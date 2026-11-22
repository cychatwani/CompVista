import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

const url = process.env.COMPVISTA_COMP_TEST_URL;
test('compensation package writes, isolation, conflicts, and immutable history on a Flyway-migrated validation branch', { skip: !url }, async () => {
  process.env.DATABASE_URL = url!;
  const { PrismaService } = await import('../src/prisma/prisma.service.js');
  const { CompensationController } = await import('../src/compensation.controller.js');
  const prisma = new PrismaService();
  const controller = new CompensationController(prisma);
  const suffix = randomUUID();
  const userId = `comp-test-${suffix}`;
  const orgA = `comp-test-a-${suffix}`;
  const orgB = `comp-test-b-${suffix}`;
  const employeeId = `comp-test-employee-${suffix}`;
  const basicId = randomUUID();
  const otherId = randomUUID();
  const inactiveId = randomUUID();
  const request = { headers: {} };
  const asOrg = (organizationId: string) => { (controller as unknown as { actor: () => Promise<{ userId: string; organizationId: string }> }).actor = async () => ({ userId, organizationId }); };
  try {
    const bandwidth = await prisma.organization.findUnique({ where: { slug: 'bandwidth-holdings' } });
    assert.ok(bandwidth, 'Bandwidth Holdings must exist on the validation branch');
    const seeded = await prisma.compensation_component_definition.findMany({ where: { organization_id: bandwidth.id }, select: { code: true } });
    for (const code of ['BASIC', 'HRA', 'SPECIAL', 'EMPLOYER_PF', 'EMPLOYEE_PF']) assert.ok(seeded.some((item) => item.code === code));
    await prisma.user.create({ data: { id: userId, name: 'Compensation Test', email: `${suffix}@example.test`, updatedAt: new Date() } });
    await prisma.organization.createMany({ data: [{ id: orgA, name: 'Comp Test A', slug: orgA, createdAt: new Date() }, { id: orgB, name: 'Comp Test B', slug: orgB, createdAt: new Date() }] });
    await prisma.employee.create({ data: { id: employeeId, userId, organizationId: orgA, displayName: 'Comp Test Employee', countryCode: 'IN' } });
    await prisma.compensation_component_definition.createMany({ data: [
      { id: basicId, organization_id: orgA, code: 'BASIC', name: 'Basic Salary', category: 'EARNING', is_basic: true },
      { id: inactiveId, organization_id: orgA, code: 'INACTIVE', name: 'Inactive', category: 'EARNING', is_active: false },
      { id: otherId, organization_id: orgB, code: 'OTHER', name: 'Other', category: 'EARNING' },
    ] });
    await assert.rejects(() => prisma.compensation_component_definition.update({ where: { id: basicId }, data: { code: 'RENAMED' } }));
    await assert.rejects(() => prisma.compensation_component_definition.update({ where: { id: basicId }, data: { is_active: false } }));
    asOrg(orgA);
    const rules = [{ componentDefinitionId: basicId, calculationType: 'FIXED' as const, fixedAmount: '10000' }];
    const draft = await controller.createPackage(request, employeeId, { currencyCode: 'INR', effectiveFrom: '2026-01-01', status: 'DRAFT', items: rules });
    assert.equal(draft.package?.status, 'DRAFT');
    assert.equal(draft.calculation.annualCtc, '120000.00');
    const id = draft.package!.id;
    const updateBody = { currencyCode: 'INR', effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', version: 1, items: [{ ...rules[0], fixedAmount: '12000' }] };
    const updates = await Promise.allSettled([controller.updateDraft(request, id, updateBody), controller.updateDraft(request, id, updateBody)]);
    assert.equal(updates.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(updates.filter((result) => result.status === 'rejected').length, 1);
    assert.ok((updates.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason instanceof ConflictException);
    const updated = await prisma.employee_compensation.findUniqueOrThrow({ where: { id }, include: { items: true } });
    assert.equal(updated.version, 2);
    assert.equal(updated.effective_to?.toISOString().slice(0, 10), '2026-12-31');
    assert.equal(updated.items[0].resolved_monthly_amount.toString(), '12000');
    await assert.rejects(() => controller.updateDraft(request, id, { ...updateBody, effectiveTo: '2025-12-31', version: 2 }), BadRequestException);
    asOrg(orgB);
    await assert.rejects(() => controller.current(request, employeeId), NotFoundException);
    asOrg(orgA);
    await assert.rejects(() => controller.createPackage(request, employeeId, { currencyCode: 'INR', effectiveFrom: '2026-01-01', status: 'DRAFT', items: [...rules, { componentDefinitionId: otherId, calculationType: 'FIXED', fixedAmount: '1' }] }));
    await assert.rejects(() => controller.createPackage(request, employeeId, { currencyCode: 'INR', effectiveFrom: '2026-01-01', status: 'DRAFT', items: [...rules, { componentDefinitionId: inactiveId, calculationType: 'FIXED', fixedAmount: '1' }] }));
    assert.equal(await prisma.employee_compensation.count({ where: { employee_id: employeeId } }), 1);
    await controller.deleteDraft(request, id, { version: 2 });
    assert.equal(await prisma.employee_compensation_item.count({ where: { compensation_id: id } }), 0);
    const active = await controller.createPackage(request, employeeId, { currencyCode: 'INR', effectiveFrom: '2026-01-01', status: 'ACTIVE', items: rules });
    assert.equal(active.package?.status, 'ACTIVE');
    await assert.rejects(() => controller.createPackage(request, employeeId, { currencyCode: 'INR', effectiveFrom: '2027-01-01', status: 'ACTIVE', items: rules }), ConflictException);
    await assert.rejects(() => controller.updateDraft(request, active.package!.id, updateBody), ConflictException);
    await assert.rejects(() => controller.deleteDraft(request, active.package!.id, { version: 1 }), ConflictException);
    assert.equal((await controller.history(request, employeeId)).length, 1);
    await assert.rejects(() => prisma.employee_compensation_item.update({ where: { id: active.package!.items[0].id }, data: { resolved_monthly_amount: '1' } }));
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      const invalid = await tx.employee_compensation.create({ data: { id: randomUUID(), organization_id: orgA, employee_id: employeeId, currency_code: 'INR', status: 'DRAFT', effective_from: new Date('2027-01-01'), created_by: userId } });
      await tx.employee_compensation_item.create({ data: { id: randomUUID(), compensation_id: invalid.id, component_definition_id: otherId, calculation_type: 'FIXED', fixed_amount: '1', resolved_monthly_amount: '1', resolved_amount: '1', annual_amount: '12' } });
    }));
    assert.equal(await prisma.employee_compensation.count({ where: { employee_id: employeeId } }), 1);
  } finally { await prisma.$disconnect(); }
});
