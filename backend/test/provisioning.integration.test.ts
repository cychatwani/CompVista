import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

// Writes a real organization; run only against a disposable validation branch.
test('provisioning creates working logins, roles, profiles, and packages', { skip: !process.env.COMPVISTA_COMP_TEST_URL }, async () => {
  process.env.DATABASE_URL = process.env.COMPVISTA_COMP_TEST_URL!;
  const { PrismaService } = await import('../src/prisma/prisma.service.js');
  const { provisionOrganization, parseProvisionInput } = await import('../src/provisioning.js');
  const { auth } = await import('../src/auth.js');
  const prisma = new PrismaService();
  try {
    const suffix = randomUUID().slice(0, 8);
    const input = parseProvisionInput({ name: `Provision Test ${suffix}`, admins: 1, hrs: 4, employees: 115, emailDomain: 'example.test' });
    const phases: string[] = [];
    const result = await provisionOrganization(prisma, input, (progress) => phases.push(progress.phase));
    assert.equal(result.credentials.length, 120);
    assert.deepEqual([...new Set(phases)], ['setup', 'accounts', 'verifying', 'done']);
    const members = await prisma.member.groupBy({ by: ['role'], where: { organizationId: result.organizationId }, _count: { _all: true } });
    assert.deepEqual(Object.fromEntries(members.map((row) => [row.role, row._count._all])), { admin: 1, hr: 4, employee: 115 });
    assert.equal(await prisma.member.count({ where: { organizationId: result.organizationId, roleId: null } }), 0, 'every member has its organization role');
    assert.equal(await prisma.employee.count({ where: { organizationId: result.organizationId, userId: null } }), 0, 'every employee can log in');
    assert.equal(await prisma.employee_compensation.count({ where: { organization_id: result.organizationId, status: 'ACTIVE' } }), 120);

    const employee = result.credentials.find((row) => row.role === 'employee')!;
    const signedIn = await auth.api.signInEmail({ body: { email: employee.email, password: employee.password } });
    assert.equal(signedIn.user.email, employee.email);
    assert.equal((signedIn.user as { mustChangePassword?: boolean }).mustChangePassword ?? (await prisma.user.findUniqueOrThrow({ where: { email: employee.email } })).mustChangePassword, true);
    await assert.rejects(() => auth.api.signInEmail({ body: { email: employee.email, password: 'Wrong-password-1' } }));

    await assert.rejects(() => provisionOrganization(prisma, input), /already exists/);
  } finally { await prisma.$disconnect(); }
});
