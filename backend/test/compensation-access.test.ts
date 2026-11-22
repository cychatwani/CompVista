import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessCompensation, canViewOwnCompensation } from '../src/compensation-access.js';

const member = (role: string, view: boolean, write: boolean) => ({ organizationId: 'org-a', role, organization_role: { organization_role_permissions: { canViewAllComp: view, canProposeOthersComp: write } } });
test('admin and configured HR permissions grant organization-level access', () => {
  assert.equal(canAccessCompensation(member('admin', false, false), 'org-a', 'write'), true);
  assert.equal(canAccessCompensation(member('hr', true, true), 'org-a', 'read'), true);
  assert.equal(canAccessCompensation(member('hr', true, true), 'org-a', 'write'), true);
});
test('employees, unconfigured HR, and cross-organization sessions cannot use management endpoints', () => {
  assert.equal(canAccessCompensation(member('employee', false, false), 'org-a', 'read'), false);
  assert.equal(canAccessCompensation(member('hr', true, false), 'org-a', 'write'), false);
  assert.equal(canAccessCompensation(member('admin', false, false), 'org-b', 'read'), false);
  assert.equal(canAccessCompensation(null, null, 'read'), false);
});
test('employee role never gains management access even with elevated flags', () => {
  assert.equal(canAccessCompensation(member('employee', true, true), 'org-a', 'read'), false);
  assert.equal(canAccessCompensation(member('employee', true, true), 'org-a', 'write'), false);
});
test('every role can view its own compensation within its organization', () => {
  assert.equal(canViewOwnCompensation(member('employee', false, false), 'org-a'), true);
  assert.equal(canViewOwnCompensation(member('hr', true, true), 'org-a'), true);
  assert.equal(canViewOwnCompensation(member('admin', false, false), 'org-a'), true);
  assert.equal(canViewOwnCompensation(member('employee', false, false), 'org-b'), false);
  assert.equal(canViewOwnCompensation(null, null), false);
});
test('approval access follows canApproveComp, never for the employee role', () => {
  const withApprove = (role: string, approve: boolean) => ({ organizationId: 'org-a', role, organization_role: { organization_role_permissions: { canViewAllComp: false, canProposeOthersComp: false, canApproveComp: approve } } });
  assert.equal(canAccessCompensation(withApprove('hr', true), 'org-a', 'approve'), true);
  assert.equal(canAccessCompensation(withApprove('hr', false), 'org-a', 'approve'), false);
  assert.equal(canAccessCompensation(withApprove('admin', false), 'org-a', 'approve'), true);
  assert.equal(canAccessCompensation(withApprove('employee', true), 'org-a', 'approve'), false);
});
