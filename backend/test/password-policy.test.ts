import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordRequirements, validNewPassword } from '../src/password-policy.js';
test('all five password requirements are mandatory', () => {
  assert.deepEqual(passwordRequirements('Short1!'), [false, true, true, true, true]);
  assert.deepEqual(passwordRequirements('lowercase123!'), [true, false, true, true, true]);
  assert.deepEqual(passwordRequirements('UPPERCASE123!'), [true, true, false, true, true]);
  assert.deepEqual(passwordRequirements('NoNumber!!'), [true, true, true, false, true]);
  assert.deepEqual(passwordRequirements('NoSpecial123'), [true, true, true, true, false]);
  assert.equal(validNewPassword('StrongPass123!'), true);
});
