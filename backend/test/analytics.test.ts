import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { parseFilters, salaryBands } from '../src/analytics.js';

test('salary bands use round edges and cover the whole range', () => {
  for (const [min, max] of [[412_000, 9_850_000], [38_500, 412_700], [100_000, 100_000], [0, 999], [1_234.5, 98_765.25]] as const) {
    const { start, step, count } = salaryBands(min, max);
    assert.ok(start <= min, `start ${start} <= ${min}`);
    assert.ok(start + step * count > max, `end covers ${max}`);
    assert.ok(count <= 11, `at most 11 bands, got ${count}`);
    const leading = step / 10 ** Math.floor(Math.log10(step));
    assert.ok([1, 2, 2.5, 5].includes(leading), `round step ${step}`);
  }
  assert.deepEqual(salaryBands(1_000_000, 2_000_000), { start: 1_000_000, step: 100_000, count: 11 });
});

test('analytics filters accept ISO codes and department ids only', () => {
  assert.deepEqual(parseFilters({ country: 'in', currency: 'inr', department: '7b0c1a3e-1f2d-4c5b-9a8e-0d1c2b3a4f5e' }), { country: 'IN', currency: 'INR', departmentId: '7b0c1a3e-1f2d-4c5b-9a8e-0d1c2b3a4f5e' });
  assert.deepEqual(parseFilters({}), { country: null, currency: null, departmentId: null });
  assert.throws(() => parseFilters({ country: 'IND' }), BadRequestException);
  assert.throws(() => parseFilters({ currency: 'RUPEE' }), BadRequestException);
  assert.throws(() => parseFilters({ department: "x' OR 1=1" }), BadRequestException);
});
