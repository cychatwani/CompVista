import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessCompensation } from '../src/compensation-access.js';

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
