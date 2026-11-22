import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { config } from 'dotenv';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env.m4.test' });
if (process.env.NEON_BRANCH !== 'milestone4-validation') throw new Error('Use only the isolated milestone4-validation branch');

test('pending, skip, mandatory override, enrollment and subsequent challenge', { timeout: 120_000 }, async () => {
  const [{ auth }, { PrismaService }, { TotpController }, { AccessController }] = await Promise.all([
    import('../src/auth.js'), import('../src/prisma/prisma.service.js'), import('../src/totp.controller.js'), import('../src/access.controller.js'),
  ]);
  const prisma = new PrismaService();
  const totp = new TotpController(prisma);
  const access = new AccessController(prisma);
  const email = 'bandwidth.hr1@yopmail.com';
  const credentials = JSON.parse(readFileSync('seed/generated/bandwidth-holdings/credentials.json', 'utf8')) as Record<string, string>;
  const password = credentials[email];
  assert.ok(password);

  async function signIn() {
    const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    assert.equal(response.status, 200);
    const body = await response.json() as { twoFactorRedirect?: boolean };
    const cookie = response.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
    assert.ok(cookie);
    return { body, request: { headers: { cookie } } };
  }

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { member: true } });
    assert.ok(user.member?.roleId);
    await prisma.twoFactor.deleteMany({ where: { userId: user.id } });
    await prisma.totp_enrollment_decision.deleteMany({ where: { userId: user.id } });
    await prisma.organization_role_permissions.update({ where: { roleId: user.member.roleId }, data: { requireTotp: false } });
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true, mustChangePassword: false, twoFactorEnabled: false } });
    const first = await signIn();
    assert.equal((await access.authState(first.request)).nextStep, 'SETUP_TOTP');
    assert.equal((await totp.status(first.request)).decision, 'PENDING');
    assert.equal((await totp.status(first.request)).decision, 'PENDING');
    assert.equal(await prisma.totp_enrollment_decision.findUnique({ where: { userId: user.id } }), null);
    await assert.rejects(access.check(first.request));
    await assert.rejects(totp.status({ headers: { cookie: 'better-auth.session_token=expired' } }));
    assert.equal(await prisma.totp_enrollment_decision.findUnique({ where: { userId: user.id } }), null);

    assert.equal((await totp.skip(first.request)).decision, 'SKIPPED');
    assert.equal((await access.authState(first.request)).nextStep, 'AUTHENTICATED');
    assert.deepEqual(await access.check(first.request), { authenticated: true });
    const second = await signIn();
    assert.equal(second.body.twoFactorRedirect, undefined);
    assert.equal((await access.authState(second.request)).nextStep, 'AUTHENTICATED');

    await prisma.organization_role_permissions.update({ where: { roleId: user.member.roleId }, data: { requireTotp: true } });
    assert.equal((await access.authState(second.request)).nextStep, 'SETUP_TOTP');
    await assert.rejects(access.check(second.request));
    await assert.rejects(totp.skip(second.request));
    const setup = await totp.begin(second.request, { password });
    assert.equal((await totp.status(second.request)).decision, 'SKIPPED');
    assert.ok(setup.backupCodes.length > 0);
    const secret = new URL(setup.totpURI).searchParams.get('secret');
    assert.ok(secret);
    const { createOTP } = await import('@better-auth/utils/otp');
    // The URI contains a Base32-encoded key; use the same OTP primitive as Better Auth.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0; let value = 0; const bytes: number[] = [];
    for (const char of secret.toUpperCase().replace(/=+$/, '')) {
      value = (value << 5) | alphabet.indexOf(char); bits += 5;
      if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
    }
    const code = await createOTP(Buffer.from(bytes).toString('utf8')).totp();
    const rotated: string[] = [];
    const enrolled = await totp.verify(second.request, { setHeader: (_name, values) => rotated.push(...values) }, { code });
    assert.equal(enrolled.decision, 'ENABLED');
    assert.equal((await prisma.totp_enrollment_decision.findUniqueOrThrow({ where: { userId: user.id } })).decision, 'ENABLED');
    const newRequest = { headers: { cookie: rotated.map((item) => item.split(';', 1)[0]).join('; ') } };
    assert.ok(newRequest.headers.cookie);
    assert.equal((await access.authState(newRequest)).nextStep, 'AUTHENTICATED');
    await assert.rejects(totp.skip(newRequest));
    const third = await signIn();
    assert.equal(third.body.twoFactorRedirect, true);
    const challengeCookies: string[] = [];
    const challenge = await totp.challenge(third.request, { setHeader: (_name, values) => challengeCookies.push(...values) }, { code });
    assert.equal(challenge.nextStep, 'AUTHENTICATED');
    assert.ok(challengeCookies.length > 0);
  } finally {
    await prisma.$disconnect();
  }
});
