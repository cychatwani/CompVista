import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultComponentCatalog, loadSeedPlan, parseSeedPlan, plannedCompensation } from '../scripts/seed-plan.js';
import { calculateCompensation } from '../src/compensation-calculation.js';

test('demo plan expands deterministic Yopmail identities from Indian names', () => {
  const first = loadSeedPlan('seed/demo.json');
  const second = loadSeedPlan('seed/demo.json');
  assert.deepEqual(first, second);
  assert.equal(first.people.length, 9);
  assert.equal(first.people.filter((person) => person.generated).length, 5);
  assert.ok(first.people.filter((person) => person.generated).every((person) => person.email.endsWith('@yopmail.com') && person.name.split(' ').length >= 2));
});

test('JSON object accepts explicit employees and generated count', () => {
  const plan = parseSeedPlan({
    organization: { name: 'Example India' },
    users: [
      { email: 'admin@example.test', name: 'Example Admin', role: 'admin' },
      { email: 'priya@example.test', name: 'Priya Shah', role: 'employee' },
    ],
    generatedEmployees: { count: 2, names: { first_names: ['Aarav'], last_names: ['Patel'] } },
    roles: { hr: { displayName: 'People Team', permissions: { canProposeOwnComp: true } } },
  });
  assert.equal(plan.organization.slug, 'example-india');
  assert.equal(plan.people.length, 4);
  assert.deepEqual(plan.people.slice(2).map((person) => person.name), ['Aarav Patel', 'Aarav Patel']);
  assert.deepEqual(plan.people.slice(2).map((person) => person.email), ['example-india.employee1@yopmail.com', 'example-india.employee2@yopmail.com']);
  assert.deepEqual(plan.roles.hr, { displayName: 'People Team', permissions: { canProposeOwnComp: true } });
});

test('every planned person receives a valid, deterministic compensation package', () => {
  const plan = loadSeedPlan('seed/bandwidth-holdings.json');
  const definitions = defaultComponentCatalog.map((item) => ({ id: item.code, category: item.category, isBasic: item.is_basic, isActive: true }));
  for (const person of plan.people) {
    const rules = plannedCompensation(plan.organization.slug, person);
    assert.deepEqual(rules, plannedCompensation(plan.organization.slug, person));
    const result = calculateCompensation({ currency: { code: 'INR', decimalPlaces: 2, isActive: true }, definitions, items: rules.map((rule) => ({ componentDefinitionId: rule.code, calculationType: rule.calculationType, fixedAmount: rule.fixedAmount, percentage: rule.percentage })) });
    assert.ok(Number(result.monthlyCtc) > 0);
  }
  const basic = (role: 'admin' | 'hr' | 'employee') => Number(plannedCompensation('x', { email: `${role}@x.test`, role })[0].fixedAmount);
  assert.ok(basic('admin') > basic('hr') && basic('hr') >= 60000 && basic('employee') <= 70000);
});

test('employee role permissions cannot be elevated beyond viewing own compensation', () => {
  const base = { organization: { name: 'Example' }, users: [{ email: 'a@example.test', name: 'A', role: 'admin' }] };
  assert.throws(() => parseSeedPlan({ ...base, roles: { employee: { permissions: { canViewAllComp: true } } } }), /only view its own/);
  assert.throws(() => parseSeedPlan({ ...base, roles: { employee: { permissions: { canViewOwnComp: false } } } }), /only view its own/);
  assert.doesNotThrow(() => parseSeedPlan({ ...base, roles: { employee: { displayName: 'Staff', permissions: { canViewOwnComp: true } } } }));
});
