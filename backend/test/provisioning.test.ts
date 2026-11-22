import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { assignRoles, credentialsCsv, parseProvisionInput, ProvisioningError, temporaryPassword } from '../src/provisioning.js';
import { validNewPassword } from '../src/password-policy.js';
import { cellKey, countryCodes, departmentCodes, distributionMatrix, scaleTargets, countryTargets, workforcePlan } from '../src/workforce-plan.js';

test('provisioning input enforces 100–20,000 people and at least one admin', () => {
  const ok = parseProvisionInput({ name: '  Acme   Labs ', admins: 2, hrs: 8, employees: '90', emailDomain: 'YOPMAIL.com' });
  assert.deepEqual(ok, { name: 'Acme Labs', slug: 'acme-labs', admins: 2, hrs: 8, employees: 90, emailDomain: 'yopmail.com', adminEmail: null, adminName: null });
  assert.throws(() => parseProvisionInput({ name: 'Acme', admins: 1, hrs: 0, employees: 98 }), /between 100 and 20,000/);
  assert.equal(parseProvisionInput({ name: 'Acme', admins: 1, hrs: 0, employees: 19_999 }).employees, 19_999);
  assert.throws(() => parseProvisionInput({ name: 'Acme', admins: 1, hrs: 0, employees: 20_000 }), /between 100 and 20,000/);
  assert.throws(() => parseProvisionInput({ name: 'Acme', admins: 0, hrs: 10, employees: 100 }), /At least one admin/);
  assert.throws(() => parseProvisionInput({ name: 'Acme', admins: 1.5, hrs: 10, employees: 100 }), ProvisioningError);
  assert.throws(() => parseProvisionInput({ name: 'Acme', admins: 1, hrs: 10, employees: 100, emailDomain: 'not a domain' }), /domain/);
  assert.throws(() => parseProvisionInput({ name: 'Acme', slug: 'Bad Slug', admins: 1, hrs: 10, employees: 100 }), /Slug/);
});

test('temporary passwords satisfy the password policy and hash the way Better Auth verifies', async () => {
  const passwords = Array.from({ length: 200 }, temporaryPassword);
  assert.ok(passwords.every(validNewPassword));
  assert.equal(new Set(passwords).size, passwords.length);
  const hash = await hashPassword(passwords[0]);
  assert.equal(await verifyPassword({ hash, password: passwords[0] }), true);
  assert.equal(await verifyPassword({ hash, password: passwords[1] }), false);
});

test('roles go to senior people in Human Resources first, with exact counts', () => {
  const plan = workforcePlan(new Map(), 'yopmail.com', { total: 500, emailPrefix: 'acme' });
  const people = assignRoles(plan, 3, 12);
  assert.equal(people.filter((entry) => entry.role === 'admin').length, 3);
  assert.equal(people.filter((entry) => entry.role === 'hr').length, 12);
  assert.equal(people.length, 500);
  for (const entry of people.filter((item) => item.role !== 'employee')) assert.equal(entry.person.department, 'HUMAN_RESOURCES');
  assert.ok(plan.every((person) => person.email.startsWith('acme.') && person.email.endsWith('@yopmail.com')));
});

test('any organization size keeps exact, proportional country and department totals', () => {
  for (const total of [100, 137, 4_321, 20_000]) {
    const matrix = distributionMatrix(total);
    assert.equal([...matrix.values()].reduce((a, b) => a + b), total);
    const countries = scaleTargets(countryTargets, total);
    for (const country of countryCodes) assert.equal(departmentCodes.reduce((sum, department) => sum + matrix.get(cellKey({ country, department }))!, 0), countries[country]);
    assert.equal(workforcePlan(new Map(), 'example.com', { total }).length, total);
  }
});

test('credentials CSV quotes commas and neutralizes spreadsheet formulas', () => {
  const csv = credentialsCsv([{ name: 'Doe, Jane', email: 'jane@x.io', role: 'hr', password: '=HYPERLINK("x")', employeeCode: 'CV-00001', department: 'Sales & Marketing', country: 'IN', jobTitle: 'HR Manager' }], 'http://localhost:3000/login');
  const [header, row] = csv.trim().split('\r\n');
  assert.equal(header, 'name,email,role,temporary_password,employee_code,department,country,job_title,login_url');
  assert.equal(row, `"Doe, Jane",jane@x.io,hr,"'=HYPERLINK(""x"")",CV-00001,Sales & Marketing,IN,HR Manager,http://localhost:3000/login`);
});
