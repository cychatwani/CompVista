import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { EmailOtpService, type OtpUser } from '../src/email-otp.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { EmailService } from '../src/email.service.js';

type CodeRow = { userId: string; email: string; codeHash: string; sentAt: Date; expiresAt: Date; attempts: number };

function fixture() {
  const user: OtpUser = { id: 'test-user', email: 'test@example.com', emailVerified: false, mustChangePassword: false, twoFactorEnabled: false };
  let row: CodeRow | null = null;
  const sent: string[] = [];
  const tx = {
    $queryRaw: async () => [],
    user: {
      findUniqueOrThrow: async () => user,
      update: async () => { user.emailVerified = true; },
    },
    email_verification_otp: {
      findUnique: async () => row,
      upsert: async ({ create, update }: { create: CodeRow; update: Partial<CodeRow> }) => { row = row ? { ...row, ...update } : create; },
      update: async () => { if (row) row.attempts++; },
      delete: async () => { row = null; },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    email_verification_otp: { updateMany: async () => { if (row) row.attempts = 5; } },
  } as unknown as PrismaService;
  const mail = { send: async ({ text }: { text: string }) => { sent.push(text.match(/\b\d{6}\b/)?.[0] ?? ''); return 'mail-id'; } } as unknown as EmailService;
  const config = { get: () => 'test-secret' } as unknown as ConfigService;
  return { user, sent, service: new EmailOtpService(prisma, mail, config), get row() { return row; }, set row(value: CodeRow | null) { row = value; } };
}

test('issue is idempotent, resend enforces cooldown and supersedes the old code', async () => {
  const state = fixture();
  const first = await state.service.issue(state.user);
  assert.equal(first.sent, true);
  assert.equal(state.sent.length, 1);
  assert.notEqual(state.row?.codeHash, state.sent[0]);
  assert.equal((await state.service.issue(state.user)).sent, false);
  assert.equal(state.sent.length, 1);
  await assert.rejects(state.service.issue(state.user, true), (error: unknown) => error instanceof Error && error.message.includes('Wait before'));
  state.row!.sentAt = new Date(Date.now() - 61_000);
  await state.service.issue(state.user, true);
  assert.equal(state.sent.length, 2);
  await assert.rejects(state.service.verify(state.user, state.sent[0]));
  assert.equal(state.row?.attempts, 1);
  assert.deepEqual(await state.service.verify(state.user, state.sent[1]), { nextStep: 'SETUP_TOTP' });
  assert.equal(state.user.emailVerified, true);
  assert.equal(state.row, null);
});

test('mount ensure never reissues after an expired or exhausted code', async () => {
  const state = fixture();
  await state.service.issue(state.user);
  state.row!.sentAt = new Date(Date.now() - 61_000);
  state.row!.expiresAt = new Date(Date.now() - 1);
  state.row!.attempts = 5;
  assert.equal((await state.service.issue(state.user)).sent, false);
  assert.equal(state.sent.length, 1);
});

test('five wrong attempts, expiry, and mandatory reset block verification', async () => {
  const state = fixture();
  state.user.mustChangePassword = true;
  await assert.rejects(state.service.issue(state.user));
  state.user.mustChangePassword = false;
  await state.service.issue(state.user);
  for (let attempt = 0; attempt < 5; attempt++) await assert.rejects(state.service.verify(state.user, '000000'));
  assert.equal(state.row?.attempts, 5);
  await assert.rejects(state.service.verify(state.user, state.sent[0]));
  state.row!.sentAt = new Date(Date.now() - 61_000);
  await state.service.issue(state.user, true);
  state.row!.expiresAt = new Date(Date.now() - 1);
  await assert.rejects(state.service.verify(state.user, state.sent[1]));
  assert.equal(state.user.emailVerified, false);
});

test('mail failure keeps the cooldown and invalidates the unsent code', async () => {
  const state = fixture();
  const failingMail = { send: async () => { throw new Error('Delivery failed'); } } as unknown as EmailService;
  const service = new EmailOtpService((state.service as unknown as { prisma: PrismaService }).prisma, failingMail, { get: () => 'test-secret' } as unknown as ConfigService);
  await assert.rejects(service.issue(state.user));
  assert.equal(state.row?.attempts, 5);
  assert.equal((await service.issue(state.user)).sent, false);
  await assert.rejects(service.issue(state.user, true), (error: unknown) => error instanceof Error && error.message.includes('Wait before'));
});

test('a code sent to an old address cannot verify a changed address', async () => {
  const state = fixture();
  await state.service.issue(state.user);
  state.user.email = 'changed@example.com';
  await assert.rejects(state.service.verify(state.user, state.sent[0]));
  assert.equal(state.user.emailVerified, false);
});

