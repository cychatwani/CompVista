import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSeedPlan, parseSeedPlan } from '../scripts/seed-plan.js';

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
