import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCompensation } from '../src/compensation-calculation.js';
import {
  cellKey, countryCodes, countryCurrency, countryTargets, departmentCodes, departmentTargets, distributionMatrix, workforcePlan, workforceTarget,
  workforceComponents, type CountryCode,
} from '../src/workforce-plan.js';
import { defaultComponentCatalog } from '../scripts/seed-plan.js';

const existing = new Map([[cellKey({ country: 'IN', department: 'ENGINEERING' }), 5], [cellKey({ country: 'IN', department: 'HUMAN_RESOURCES' }), 4]]);

test('distribution matrix hits every country and department total exactly, spread across countries', () => {
  const matrix = distributionMatrix();
  for (const country of countryCodes) assert.equal(departmentCodes.reduce((sum, department) => sum + matrix.get(cellKey({ country, department }))!, 0), countryTargets[country]);
  for (const department of departmentCodes) assert.equal(countryCodes.reduce((sum, country) => sum + matrix.get(cellKey({ country, department }))!, 0), departmentTargets[department]);
  // No department is concentrated in a single country.
  for (const department of departmentCodes) assert.ok(countryCodes.every((country) => matrix.get(cellKey({ country, department }))! > 0), department);
  assert.equal([...matrix.values()].reduce((a, b) => a + b), workforceTarget);
});

test('the roster is deterministic and, with existing people, reaches the targets exactly', () => {
  const first = workforcePlan(existing, 'demo.example');
  const second = workforcePlan(existing, 'demo.example');
  assert.deepEqual(first, second);
  assert.equal(first.length, workforceTarget - 9);
  assert.equal(new Set(first.map((person) => person.code)).size, first.length);
  assert.equal(new Set(first.map((person) => person.email)).size, first.length);
  const counts = new Map<string, number>(existing);
  for (const person of first) counts.set(cellKey(person), (counts.get(cellKey(person)) ?? 0) + 1);
  for (const country of countryCodes) assert.equal(departmentCodes.reduce((sum, department) => sum + (counts.get(cellKey({ country, department })) ?? 0), 0), countryTargets[country]);
  for (const department of departmentCodes) assert.equal(countryCodes.reduce((sum, country) => sum + (counts.get(cellKey({ country, department })) ?? 0), 0), departmentTargets[department]);
  assert.throws(() => workforcePlan(new Map([[cellKey({ country: 'SG', department: 'HUMAN_RESOURCES' }), 10_000]]), 'demo.example'), /exceed/);
});

test('generated packages use the real calculator, local currency, and country-appropriate components', () => {
  const definitions = [...defaultComponentCatalog, ...workforceComponents.map((item) => ({ ...item, is_basic: false }))].map((item) => ({ id: item.code, name: item.name, category: item.category, isBasic: item.is_basic, isActive: true }));
  const plan = workforcePlan(existing, 'demo.example');
  const levels = new Map<string, number>();
  for (const person of plan) {
    levels.set(person.level, (levels.get(person.level) ?? 0) + 1);
    assert.equal(person.currency, countryCurrency[person.country as CountryCode]);
    const codes = person.rules.map((rule) => rule.code);
    assert.equal(codes.includes('EMPLOYER_PF'), person.country === 'IN', `${person.code} PF only in India`);
    const result = calculateCompensation({ currency: { code: person.currency, decimalPlaces: 2, isActive: true }, definitions, items: person.rules.map((rule) => ({ componentDefinitionId: rule.code, calculationType: rule.calculationType, fixedAmount: rule.fixedAmount, percentage: rule.percentage, frequency: rule.frequency })) });
    const drift = Math.abs(Number(result.annualCtc) - person.targetAnnualCtc) / person.targetAnnualCtc;
    assert.ok(drift < 0.03, `${person.code} CTC ${result.annualCtc} vs target ${person.targetAnnualCtc}`);
  }
  for (const level of ['JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR']) assert.ok((levels.get(level) ?? 0) > 100, level);
});
