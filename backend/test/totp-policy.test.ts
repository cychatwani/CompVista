import assert from 'node:assert/strict';
import test from 'node:test';
import { nextAuthStep, type TotpState } from '../src/totp-policy.js';

const base: TotpState = { id: 'user', mustChangePassword: false, emailVerified: true, twoFactorEnabled: false, decision: 'PENDING', requireTotp: false };

test('pending enrollment persists through repeated state checks', () => {
  assert.equal(nextAuthStep(base), 'SETUP_TOTP');
  assert.equal(nextAuthStep({ ...base }), 'SETUP_TOTP');
});

test('explicit skip permits access only under optional policy', () => {
  assert.equal(nextAuthStep({ ...base, decision: 'SKIPPED' }), 'AUTHENTICATED');
  assert.equal(nextAuthStep({ ...base, decision: 'SKIPPED', requireTotp: true }), 'SETUP_TOTP');
});

test('verified enrollment permits access and inconsistent states remain gated', () => {
  assert.equal(nextAuthStep({ ...base, decision: 'ENABLED', twoFactorEnabled: true }), 'AUTHENTICATED');
  assert.equal(nextAuthStep({ ...base, decision: 'ENABLED' }), 'SETUP_TOTP');
  assert.equal(nextAuthStep({ ...base, twoFactorEnabled: true }), 'SETUP_TOTP');
  assert.equal(nextAuthStep({ ...base, decision: 'SKIPPED', twoFactorEnabled: true }), 'SETUP_TOTP');
});

test('password and email checks precede TOTP decisions', () => {
  assert.equal(nextAuthStep({ ...base, mustChangePassword: true, decision: 'ENABLED', twoFactorEnabled: true }), 'RESET_PASSWORD');
  assert.equal(nextAuthStep({ ...base, emailVerified: false, decision: 'SKIPPED' }), 'VERIFY_EMAIL');
});
