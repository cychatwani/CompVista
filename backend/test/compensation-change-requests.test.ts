import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { parseChangeRequests } from '../src/compensation.controller.js';

const components = [{ id: 'basic', name: 'Basic Salary' }, { id: 'hra', name: 'House Rent Allowance' }];

test('change requests take labels from the package, not the client', () => {
  const parsed = parseChangeRequests([{ target: 'component', componentDefinitionId: 'hra', note: ' Use 50% ' }, { target: 'effectiveFrom', note: 'Start in January' }], components);
  assert.deepEqual(parsed, [
    { target: 'component', componentDefinitionId: 'hra', label: 'House Rent Allowance', note: 'Use 50%' },
    { target: 'effectiveFrom', componentDefinitionId: null, label: 'Effective date', note: 'Start in January' },
  ]);
  assert.deepEqual(parseChangeRequests(undefined, components), []);
});

test('change requests reject unknown components, duplicates, and empty notes', () => {
  assert.throws(() => parseChangeRequests([{ target: 'component', componentDefinitionId: 'bonus', note: 'x' }], components), BadRequestException);
  assert.throws(() => parseChangeRequests([{ target: 'component', componentDefinitionId: 'hra', note: 'a' }, { target: 'component', componentDefinitionId: 'hra', note: 'b' }], components), BadRequestException);
  assert.throws(() => parseChangeRequests([{ target: 'component', componentDefinitionId: 'hra', note: '  ' }], components), BadRequestException);
  assert.throws(() => parseChangeRequests('nope', components), BadRequestException);
});
