import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

type Actor = { userId: string; organizationId: string };
type Rule = { code: string; type: 'FIXED' | 'PERCENTAGE_OF_BASE'; value: string; frequency?: 'MONTHLY' | 'ANNUAL' };

async function harness(url: string) {
  process.env.DATABASE_URL = url;
  const { PrismaService } = await import('../src/prisma/prisma.service.js');
  const { AnalyticsController } = await import('../src/analytics.controller.js');
  const { WorkforceController } = await import('../src/workforce.controller.js');
  const prisma = new PrismaService();
  const kinds: string[] = [];
  let actor: Actor = { userId: '', organizationId: '' };
  const compensation = { actor: async (_request: unknown, kind: string) => { kinds.push(kind); return actor; } };
  const analytics = new AnalyticsController(prisma, compensation as never);
  const workforce = new WorkforceController(prisma, compensation as never);
  return { prisma, analytics, workforce, kinds, as: (next: Actor) => { actor = next; } };
}

// Small, hand-checkable dataset: two currencies, a deduction, an annual bonus, a pending request,
// and a second organization whose data must never leak in.
test('analytics aggregates per currency, excludes deductions, filters, and stays organization-scoped', { skip: !process.env.COMPVISTA_COMP_TEST_URL }, async () => {
  const { prisma, analytics, workforce, kinds, as } = await harness(process.env.COMPVISTA_COMP_TEST_URL!);
  const { calculateCompensation } = await import('../src/compensation-calculation.js');
  const suffix = randomUUID().slice(0, 8);
  const userId = `analytics-test-${suffix}`;
  const orgA = `analytics-a-${suffix}`;
  const orgB = `analytics-b-${suffix}`;
  try {
    await prisma.user.create({ data: { id: userId, name: 'Analytics Test', email: `${userId}@example.test`, updatedAt: new Date() } });
    await prisma.organization.createMany({ data: [{ id: orgA, name: 'Analytics A', slug: orgA, createdAt: new Date() }, { id: orgB, name: 'Analytics B', slug: orgB, createdAt: new Date() }] });
    const definitions: Record<string, Record<string, string>> = {};
    const departments: Record<string, Record<string, string>> = {};
    for (const org of [orgA, orgB]) {
      definitions[org] = {};
      for (const [code, category, isBasic] of [['BASIC', 'EARNING', true], ['BONUS', 'EARNING', false], ['EMPLOYER_PF', 'EMPLOYER_CONTRIBUTION', false], ['EMPLOYEE_PF', 'EMPLOYEE_DEDUCTION', false]] as const) {
        const id = randomUUID();
        definitions[org][code] = id;
        await prisma.compensation_component_definition.create({ data: { id, organization_id: org, code, name: code, category, is_basic: isBasic } });
      }
      departments[org] = { ENG: randomUUID(), FIN: randomUUID() };
      await prisma.department.createMany({ data: [{ id: departments[org].ENG, organization_id: org, name: 'Engineering', code: 'ENGINEERING' }, { id: departments[org].FIN, organization_id: org, name: 'Finance', code: 'FINANCE' }] });
    }
    const person = async (org: string, name: string, country: string, department: 'ENG' | 'FIN') => {
      const id = randomUUID();
      await prisma.employee.create({ data: { id, organizationId: org, displayName: name, countryCode: country, departmentId: departments[org][department], employeeCode: `T-${name.toUpperCase()}`.slice(0, 32).replace(/[^A-Z0-9-]/g, '') } });
      return id;
    };
    const pkg = async (org: string, employeeId: string, currency: string, rules: Rule[], status: 'ACTIVE' | 'PENDING_APPROVAL' = 'ACTIVE') => {
      const ids = definitions[org];
      const result = calculateCompensation({
        currency: { code: currency, decimalPlaces: 2, isActive: true },
        definitions: Object.entries(ids).map(([code, id]) => ({ id, category: code === 'EMPLOYER_PF' ? 'EMPLOYER_CONTRIBUTION' : code === 'EMPLOYEE_PF' ? 'EMPLOYEE_DEDUCTION' : 'EARNING', isBasic: code === 'BASIC', isActive: true })),
        items: rules.map((rule) => ({ componentDefinitionId: ids[rule.code], calculationType: rule.type, fixedAmount: rule.type === 'FIXED' ? rule.value : null, percentage: rule.type === 'FIXED' ? null : rule.value, frequency: rule.frequency })),
      });
      const id = randomUUID();
      await prisma.employee_compensation.create({ data: { id, organization_id: org, employee_id: employeeId, currency_code: currency, status: 'DRAFT', effective_from: new Date('2026-04-01T00:00:00Z'), created_by: userId } });
      await prisma.employee_compensation_item.createMany({ data: result.items.map((item) => ({ id: randomUUID(), compensation_id: id, component_definition_id: item.componentDefinitionId, calculation_type: item.calculationType, fixed_amount: item.fixedAmount ?? null, percentage: item.percentage ?? null, resolved_monthly_amount: item.resolvedMonthlyAmount, frequency: item.frequency, resolved_amount: item.resolvedAmount, annual_amount: item.annualAmount })) });
      await prisma.employee_compensation.update({ where: { id }, data: { status, submitted_by: userId, submitted_at: new Date(Date.now() - 10 * 86_400_000) } });
    };
    // Org A. INR annual CTC: Asha 1,344,000 (1,200,000 + 12% PF; 12% employee PF is a deduction),
    // Bala 660,000 (600,000 + 60,000 annual bonus), Chitra 300,000. USD: Dana 120,000. Evan has no package.
    const asha = await person(orgA, 'Asha', 'IN', 'ENG');
    const bala = await person(orgA, 'Bala', 'IN', 'FIN');
    const chitra = await person(orgA, 'Chitra', 'IN', 'ENG');
    const dana = await person(orgA, 'Dana', 'US', 'ENG');
    const evan = await person(orgA, 'Evan', 'US', 'FIN');
    await pkg(orgA, asha, 'INR', [{ code: 'BASIC', type: 'FIXED', value: '100000' }, { code: 'EMPLOYER_PF', type: 'PERCENTAGE_OF_BASE', value: '12' }, { code: 'EMPLOYEE_PF', type: 'PERCENTAGE_OF_BASE', value: '12' }]);
    await pkg(orgA, bala, 'INR', [{ code: 'BASIC', type: 'FIXED', value: '50000' }, { code: 'BONUS', type: 'FIXED', value: '60000', frequency: 'ANNUAL' }]);
    await pkg(orgA, chitra, 'INR', [{ code: 'BASIC', type: 'FIXED', value: '25000' }]);
    await pkg(orgA, dana, 'USD', [{ code: 'BASIC', type: 'FIXED', value: '10000' }]);
    await pkg(orgA, evan, 'USD', [{ code: 'BASIC', type: 'FIXED', value: '9000' }], 'PENDING_APPROVAL');
    // Org B: one expensive INR package that must never appear in org A's numbers.
    await pkg(orgB, await person(orgB, 'Zed', 'IN', 'ENG'), 'INR', [{ code: 'BASIC', type: 'FIXED', value: '999999' }]);

    as({ userId, organizationId: orgA });
    const request = (query: Record<string, string> = {}) => ({ headers: {}, query });
    const all = await analytics.analytics(request());
    assert.deepEqual(kinds, ['read'], 'analytics uses the existing organization-wide read permission');
    assert.equal(all.headcount, 5);
    assert.equal(all.covered, 4);
    assert.equal(all.requiresCurrency, true, 'two currencies and none selected');
    assert.equal(all.money, null, 'no consolidated CTC across currencies');
    assert.deepEqual(all.native.map((row) => [row.currency.code, row.employees, Number(row.annualCtc)]), [['INR', 3, 2_304_000], ['USD', 1, 120_000]]);
    assert.equal(all.approvals.pending, 1);
    assert.equal(all.approvals.ages.find((age) => age.key === 'fortnight')!.requests, 1);
    assert.equal(all.approvals.recent[0].employee.displayName, 'Evan');

    const inr = await analytics.analytics(request({ currency: 'INR' }));
    assert.deepEqual(inr.money, { employees: 3, total: '2304000.00', average: '768000.00', median: '660000.00', min: '300000.00', max: '1344000.00', gross: '2160000.00', employer: '144000.00', deductions: '144000.00' });
    assert.equal(Number(inr.money!.gross) + Number(inr.money!.employer), Number(inr.money!.total), 'CTC = gross + employer; deductions excluded');
    const components = Object.fromEntries(inr.components!.map((row) => [row.code, Number(row.annual)]));
    assert.deepEqual(components, { BASIC: 2_100_000, BONUS: 60_000, EMPLOYER_PF: 144_000, EMPLOYEE_PF: 144_000 });
    assert.equal(inr.distribution!.bands.reduce((sum, band) => sum + band.employees, 0), 3);
    const engineering = inr.departments.find((row) => row.name === 'Engineering')!;
    assert.deepEqual([engineering.headcount, engineering.employees, Number(engineering.annualCtc)], [3, 2, 1_644_000]);
    assert.equal(inr.matrix.find((cell) => cell.countryCode === 'IN' && cell.departmentId === departments[orgA].ENG)!.headcount, 2);

    const engInr = await analytics.analytics(request({ currency: 'INR', department: departments[orgA].ENG }));
    assert.equal(engInr.money!.median, '822000.00', 'even count: mean of the two middle values');
    assert.equal(engInr.headcount, 3);
    const us = await analytics.analytics(request({ country: 'US' }));
    assert.equal(us.headcount, 2);
    assert.equal(us.currency?.code, 'USD', 'a single currency in scope enables monetary views');
    assert.equal(us.money!.total, '120000.00');

    const directory = await workforce.directory(request({ currency: 'INR', ctcMin: '500000', sort: 'ctc-desc' }));
    assert.deepEqual(directory.items.map((row) => row.displayName), ['Asha', 'Bala']);
    assert.equal((await workforce.directory(request({ country: 'US' }))).total, 2);
    assert.equal((await workforce.directory(request({ department: departments[orgA].FIN, status: 'none' }))).items[0].displayName, 'Evan');
    // The CSV export contains exactly the filtered rows (all pages) with annual amounts.
    const csv = await workforce.exportDirectory(request({ currency: 'INR', sort: 'ctc-desc' }));
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.equal(lines[0].split(',')[0], 'employee_code');
    assert.deepEqual(lines.slice(1).map((line) => line.split(',')[1]), ['Asha', 'Bala', 'Chitra']);
    assert.ok(lines[1].includes(',INR,1344000.00,1200000.00,100000.00,2026-04-01,'));

    as({ userId, organizationId: orgB });
    const other = await analytics.analytics(request());
    assert.equal(other.headcount, 1);
    assert.equal(other.money!.total, '11999988.00');
    assert.equal((await workforce.directory(request({ q: 'Asha' }))).total, 0, 'directory is organization-scoped');
  } finally { await prisma.$disconnect(); }
});

// Read-only smoke test against the seeded 10,000-person demo organization.
test('dashboard queries stay fast and consistent on the 10,000-employee demo organization', { skip: !process.env.COMPVISTA_ANALYTICS_SMOKE_URL }, async () => {
  const { prisma, analytics, workforce, as } = await harness(process.env.COMPVISTA_ANALYTICS_SMOKE_URL!);
  try {
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: process.env.COMPVISTA_ANALYTICS_SMOKE_ORG ?? 'compvista-demo' } });
    as({ userId: 'smoke', organizationId: org.id });
    const timed = async <T>(label: string, run: () => Promise<T>) => {
      const started = performance.now();
      const result = await run();
      const elapsed = performance.now() - started;
      console.log(`${label}: ${elapsed.toFixed(0)} ms`);
      assert.ok(elapsed < 4000, `${label} took ${elapsed.toFixed(0)} ms`);
      return result;
    };
    const all = await timed('analytics, no filters', () => analytics.analytics({ headers: {}, query: {} }));
    assert.equal(all.headcount, 10_000);
    assert.equal(all.native.reduce((sum, row) => sum + row.employees, 0), all.covered, 'currency breakdown covers every package once');
    const inr = await timed('analytics, INR', () => analytics.analytics({ headers: {}, query: { currency: 'INR' } }));
    assert.equal(inr.departments.reduce((sum, row) => sum + Number(row.annualCtc), 0).toFixed(2), Number(inr.money!.total).toFixed(2), 'department totals add up to the currency total');
    assert.equal(inr.matrix.reduce((sum, cell) => sum + cell.headcount, 0), 10_000);
    await timed('analytics, India + Engineering', () => analytics.analytics({ headers: {}, query: { country: 'IN', department: all.options.departments.find((row) => row.code === 'ENGINEERING')!.id } }));
    const page = await timed('directory, CTC descending in USD', () => workforce.directory({ headers: {}, query: { currency: 'USD', sort: 'ctc-desc', pageSize: '25' } }));
    assert.equal(page.items.length, 25);
  } finally { await prisma.$disconnect(); }
});
