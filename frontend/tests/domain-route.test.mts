import assert from 'node:assert/strict';
import test from 'node:test';
import { GET, POST } from '../src/app/api/domain/[...path]/route';
import { formatMoney } from '../src/components/compensation/api';

test('domain proxy forwards session cookie and JSON without changing the backend response', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /\/compensation\/preview$/);
    assert.equal((init?.headers as Record<string, string>).cookie, 'session=test');
    assert.equal(init?.body, '{"currencyCode":"INR"}');
    return Response.json({ annualCtc: '120000.00' });
  };
  try {
    const result = await POST(new Request('http://localhost/api/domain/compensation/preview', { method: 'POST', headers: { cookie: 'session=test' }, body: '{"currencyCode":"INR"}' }), { params: Promise.resolve({ path: ['compensation', 'preview'] }) });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { annualCtc: '120000.00' });
  } finally { globalThis.fetch = original; }
});

test('domain proxy rejects paths outside the compensation API', async () => {
  const result = await GET(new Request('http://localhost/api/domain/api/auth'), { params: Promise.resolve({ path: ['api', 'auth'] }) });
  assert.equal(result.status, 400);
});

test('currency display preserves large decimal values without floating point conversion', () => {
  assert.equal(formatMoney('1234567890123456.78', { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimal_places: 2 }), '₹1,23,45,67,89,01,23,456.78');
});

test('domain proxy forwards query strings for paginated lists', async () => {
  const original = globalThis.fetch;
  let target = '';
  globalThis.fetch = async (input) => { target = String(input); return Response.json({ items: [] }); };
  try {
    await GET(new Request('http://localhost/api/domain/employees/directory?page=2&q=priya'), { params: Promise.resolve({ path: ['employees', 'directory'] }) });
    assert.match(target, /\/employees\/directory\?page=2&q=priya$/);
  } finally { globalThis.fetch = original; }
});

test('package values keep whole-number zeros when trimming decimals', async () => {
  const { trimDecimal } = await import('../src/components/compensation/employee-compensation');
  assert.equal(trimDecimal('60000'), '60000');
  assert.equal(trimDecimal('60000.0000'), '60000');
  assert.equal(trimDecimal('40'), '40');
  assert.equal(trimDecimal('12.5000'), '12.5');
  assert.equal(trimDecimal(null), '');
});
