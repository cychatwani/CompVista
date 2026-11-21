import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env.role.test' });
if (process.env.NEON_BRANCH !== 'milestone3-boolean-validation') throw new Error('Use the isolated boolean-validation branch');

test('seeded roles, identities, profiles, and closed registration', async () => {
  const { auth } = await import('../src/auth.js');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'compvista-demo' } });
    assert.equal(await prisma.organization.count({ where: { slug: 'compvista-demo' } }), 1);
    const members = await prisma.member.findMany({ where: { organizationId: org.id }, include: { user: true, organization_role: true } });
    assert.equal(members.length, 9);
    assert.deepEqual(members.reduce((counts, member) => ({ ...counts, [member.role]: (counts[member.role] ?? 0) + 1 }), {} as Record<string, number>), { admin: 1, hr: 3, employee: 5 });
    assert.ok(members.every((member) => member.roleId && member.organization_role?.key === member.role));
    await assert.rejects(prisma.member.create({ data: { id: randomUUID(), organizationId: org.id, userId: members[0].userId, role: members[0].role, createdAt: new Date() } }));
    assert.equal(members.find((member) => member.role === 'admin')?.user.email, 'cyc4597@gmail.com');
    assert.equal(members.find((member) => member.role === 'admin')?.user.emailVerified, false);
    assert.equal(await prisma.employee.count({ where: { organizationId: org.id } }), 9);
    assert.equal(await prisma.organization_role.count({ where: { organizationId: org.id } }), 3);
    const roles = await prisma.organization_role.findMany({ where: { organizationId: org.id }, include: { organization_role_permissions: true } });
    const flags = (role: typeof roles[number]) => {
      const p = role.organization_role_permissions;
      assert.ok(p);
      return [p.canViewAllComp, p.canViewOwnComp, p.canProposeOthersComp, p.canProposeOwnComp, p.canApproveComp, p.canApproveOwnComp, p.requiresApproval];
    };
    assert.deepEqual(flags(roles.find((role) => role.key === 'admin')!), [true, true, true, true, true, true, false]);
    assert.deepEqual(flags(roles.find((role) => role.key === 'hr')!), [true, true, true, false, false, false, true]);
    assert.deepEqual(flags(roles.find((role) => role.key === 'employee')!), [false, true, false, false, false, false, true]);

    const passwords = JSON.parse(readFileSync('seed/generated/compvista-demo/credentials.json', 'utf8')) as Record<string, string>;
    const email = 'compvista.demo.employee1@yopmail.com';
    const signedIn = await auth.api.signInEmail({ body: { email, password: passwords[email] } });
    assert.equal(signedIn.user.email, email);
    assert.ok(await prisma.session.findUnique({ where: { token: signedIn.token } }));
    await assert.rejects(auth.api.signUpEmail({ body: { email: `blocked-${randomUUID()}@yopmail.com`, name: 'Blocked', password: 'a-long-test-password' } }));
    const response = await auth.api.signInEmail({ body: { email, password: passwords[email] }, asResponse: true });
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    await assert.rejects(auth.api.createOrganization({ body: { name: 'Blocked', slug: `blocked-${randomUUID()}` }, headers: new Headers({ cookie }) }));
    assert.equal(await prisma.organization.count(), 1);
  } finally {
    await prisma.$disconnect();
  }
});
