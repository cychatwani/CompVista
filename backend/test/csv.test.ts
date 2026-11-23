import assert from 'node:assert/strict';
import test from 'node:test';
import { csvCell, toCsv } from '../src/csv.js';

test('CSV cells quote separators and neutralize spreadsheet formulas but keep numbers numeric', () => {
  assert.equal(csvCell('Sales & Marketing'), 'Sales & Marketing');
  assert.equal(csvCell('Doe, Jane'), '"Doe, Jane"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=SUM(A1:A9)'), `"'=SUM(A1:A9)"`);
  assert.equal(csvCell('+44 20 7946'), `"'+44 20 7946"`);
  assert.equal(csvCell(-1200.5), '-1200.5');
  assert.equal(csvCell(null), '');
  assert.equal(toCsv(['a', 'b'], [[1, 'x,y']]), 'a,b\r\n1,"x,y"\r\n');
});
