import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env.test' });
if (process.env.NEON_BRANCH !== 'milestone2-validation') {
  throw new Error('Identity integration test requires the isolated milestone2-validation branch');
}
process.env.COMPVISTA_BOOTSTRAP = '1';

test('Better Auth persistence and single-enterprise membership', async () => {
  const { auth } = await import('../src/auth.js');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: process.env.DEV_OWNER_EMAIL } });
    const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'compvista-demo' } });
    const ownerMember = await prisma.member.findUniqueOrThrow({ where: { userId: owner.id } });
    assert.equal(ownerMember.organizationId, org.id);
    assert.equal(ownerMember.role, 'owner');

    const signIn = await auth.api.signInEmail({
      body: { email: owner.email, password: process.env.DEV_OWNER_PASSWORD! },
    });
    assert.equal(signIn.user.id, owner.id);
    assert.ok(await prisma.session.findUnique({ where: { token: signIn.token } }));

    const email = `member-${randomUUID()}@compvista.local`;
    const password = randomBytes(24).toString('base64url');
    const signedUp = await auth.api.signUpEmail({ body: { email, name: 'Test Member', password } });
    const memberUserId = signedUp.user.id;
    await auth.api.addMember({ body: { userId: memberUserId, role: 'member', organizationId: org.id } });
    const member = await prisma.member.findUniqueOrThrow({ where: { userId: memberUserId } });
    assert.equal(member.organizationId, org.id);
    const ownerResponse = await auth.api.signInEmail({
      body: { email: owner.email, password: process.env.DEV_OWNER_PASSWORD! },
      asResponse: true,
    });
    const ownerCookie = ownerResponse.headers.get('set-cookie')?.split(';')[0];
    assert.ok(ownerCookie);
    await auth.api.updateMemberRole({
      body: { memberId: member.id, role: 'admin', organizationId: org.id },
      headers: new Headers({ cookie: ownerCookie }),
    });
    assert.equal((await prisma.member.findUniqueOrThrow({ where: { id: member.id } })).role, 'admin');

    const inviteEmail = `invitee-${randomUUID()}@compvista.local`;
    const invitePassword = randomBytes(24).toString('base64url');
    const invitee = await auth.api.signUpEmail({ body: { email: inviteEmail, name: 'Invited Member', password: invitePassword } });
    const invitation = await auth.api.createInvitation({
      body: { email: inviteEmail, role: 'member', organizationId: org.id },
      headers: new Headers({ cookie: ownerCookie }),
    });
    const inviteeResponse = await auth.api.signInEmail({
      body: { email: inviteEmail, password: invitePassword },
      asResponse: true,
    });
    const inviteeCookie = inviteeResponse.headers.get('set-cookie')?.split(';')[0];
    assert.ok(inviteeCookie);
    await auth.api.acceptInvitation({
      body: { invitationId: invitation.id },
      headers: new Headers({ cookie: inviteeCookie }),
    });
    assert.equal((await prisma.member.findUniqueOrThrow({ where: { userId: invitee.user.id } })).organizationId, org.id);
    await auth.api.enableTwoFactor({
      body: { password: invitePassword, method: 'totp' },
      headers: new Headers({ cookie: inviteeCookie }),
    });
    assert.ok(await prisma.twoFactor.findFirst({ where: { userId: invitee.user.id } }));

    const secondOrg = await prisma.organization.create({
      data: { id: randomUUID(), name: 'Constraint Test', slug: `constraint-${randomUUID()}`, createdAt: new Date() },
    });
    await assert.rejects(prisma.member.create({
      data: { id: randomUUID(), userId: memberUserId, organizationId: secondOrg.id, role: 'member', createdAt: new Date() },
    }));
    assert.equal(await prisma.member.count({ where: { userId: memberUserId } }), 1);
  } finally {
    await prisma.$disconnect();
  }
});
