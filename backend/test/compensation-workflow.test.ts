import assert from 'node:assert/strict';
import test from 'node:test';
import { appliedStatus, msUntilMidnight, today, canApprove, canPropose, dayBefore, submissionOutcome, type WorkflowActor } from '../src/compensation-workflow.js';
import { defaultPermissions } from '../scripts/seed-plan.js';

const actor = (role: 'admin' | 'hr' | 'employee', userId = 'me'): WorkflowActor => ({ role, userId, flags: { ...defaultPermissions[role] } });

test('admins apply directly; HR submissions wait for approval', () => {
  assert.equal(submissionOutcome(actor('admin')), 'ACTIVE');
  assert.equal(submissionOutcome(actor('hr')), 'PENDING_APPROVAL');
});

test('requiresApproval from the role permissions row decides the outcome', () => {
  const hr = actor('hr');
  hr.flags!.requiresApproval = false;
  assert.equal(submissionOutcome(hr), 'ACTIVE');
});

test('proposing follows own vs others permissions; employees never propose', () => {
  assert.equal(canPropose(actor('hr'), 'someone-else'), true);
  assert.equal(canPropose(actor('hr'), 'me'), false);
  assert.equal(canPropose(actor('admin'), 'me'), true);
  assert.equal(canPropose({ ...actor('employee'), flags: { ...defaultPermissions.hr, canProposeOthersComp: true } }, 'someone-else'), false);
});

test('approval requires canApproveComp and blocks self-approval of a gated submission', () => {
  assert.equal(canApprove(actor('admin'), 'employee-user', 'hr-user'), true);
  assert.equal(canApprove(actor('hr'), 'employee-user', 'other-hr'), false);
  const approverHr = actor('hr', 'hr-user');
  approverHr.flags!.canApproveComp = true;
  assert.equal(canApprove(approverHr, 'employee-user', 'hr-user'), false);
  assert.equal(canApprove(approverHr, 'employee-user', 'other-hr'), true);
  assert.equal(canApprove(approverHr, 'hr-user', 'other-hr'), false);
});

test('superseded packages end the day before the next one starts', () => {
  assert.equal(dayBefore(new Date('2026-04-01T00:00:00Z')).toISOString().slice(0, 10), '2026-03-31');
  assert.equal(dayBefore(new Date('2028-03-01T00:00:00Z')).toISOString().slice(0, 10), '2028-02-29');
});


test('packages starting after today are scheduled as upcoming; today or earlier apply now', () => {
  const now = new Date(2026, 10, 23, 15, 0);
  assert.equal(appliedStatus(new Date('2026-12-01T00:00:00Z'), now), 'SCHEDULED');
  assert.equal(appliedStatus(new Date('2026-11-24T00:00:00Z'), now), 'SCHEDULED');
  assert.equal(appliedStatus(new Date('2026-11-23T00:00:00Z'), now), 'ACTIVE');
  assert.equal(appliedStatus(new Date('2026-04-01T00:00:00Z'), now), 'ACTIVE');
});

test('nightly promotion timer targets the next local midnight', () => {
  assert.equal(msUntilMidnight(new Date(2026, 10, 23, 23, 59, 0)), 60_000);
  assert.equal(today(new Date(2026, 10, 23, 0, 0, 1)).toISOString().slice(0, 10), '2026-11-23');
});
