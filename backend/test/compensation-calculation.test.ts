import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCompensation, CompensationValidationError, summarizeResolvedCompensation, type CalculationInput } from '../src/compensation-calculation.js';

const definitions: CalculationInput['definitions'] = [
  { id: 'basic', category: 'EARNING', isBasic: true, isActive: true },
  { id: 'hra', category: 'EARNING', isBasic: false, isActive: true },
  { id: 'special', category: 'EARNING', isBasic: false, isActive: true },
  { id: 'employer', category: 'EMPLOYER_CONTRIBUTION', isBasic: false, isActive: true },
  { id: 'employee', category: 'EMPLOYEE_DEDUCTION', isBasic: false, isActive: true },
  { id: 'bonus', category: 'EARNING', isBasic: false, isActive: true },
];
const fixed = (componentDefinitionId: string, fixedAmount: string) => ({ componentDefinitionId, calculationType: 'FIXED' as const, fixedAmount });
const percent = (componentDefinitionId: string, percentage: string) => ({ componentDefinitionId, calculationType: 'PERCENTAGE_OF_BASE' as const, percentage });
const input = (items: CalculationInput['items'], decimalPlaces = 2): CalculationInput => ({ currency: { code: 'INR', decimalPlaces, isActive: true }, definitions, items });

test('fixed earnings and contributions form CTC while employee deductions remain separate', () => {
  const result = calculateCompensation(input([fixed('basic', '50000'), fixed('special', '12500'), fixed('employer', '1800'), fixed('employee', '1800')]));
  assert.equal(result.monthlyGross, '62500.00');
  assert.equal(result.monthlyEmployerContributions, '1800.00');
  assert.equal(result.monthlyEmployeeDeductions, '1800.00');
  assert.equal(result.monthlyCtc, '64300.00');
  assert.equal(result.annualCtc, '771600.00');
});

test('percentage items recalculate from changed Basic Salary', () => {
  const rules = (basic: string) => [fixed('basic', basic), percent('hra', '40'), percent('employer', '12')];
  const first = calculateCompensation(input(rules('10000')));
  const second = calculateCompensation(input(rules('12000')));
  assert.deepEqual(first.items.map((item) => item.resolvedMonthlyAmount), ['10000.00', '4000.00', '1200.00']);
  assert.deepEqual(second.items.map((item) => item.resolvedMonthlyAmount), ['12000.00', '4800.00', '1440.00']);
});

test('zero nonbasic amounts and fractional percentages are valid', () => {
  const result = calculateCompensation(input([fixed('basic', '1'), fixed('special', '0'), percent('hra', '12.3456')]));
  assert.equal(result.items[2].resolvedMonthlyAmount, '0.12');
  assert.equal(result.monthlyGross, '1.12');
});

test('currency precision rounds each item before totals using decimal arithmetic', () => {
  const result = calculateCompensation(input([fixed('basic', '1.005'), fixed('special', '0.005'), percent('hra', '50')], 2));
  assert.deepEqual(result.items.map((item) => item.resolvedMonthlyAmount), ['1.01', '0.01', '0.51']);
  assert.equal(result.monthlyGross, '1.53');
  assert.equal(calculateCompensation(input([fixed('basic', '1.5'), percent('hra', '10')], 0)).monthlyGross, '2');
});

test('missing, duplicate, nonpositive, and percentage Basic Salary are rejected', () => {
  for (const rules of [[fixed('hra', '1')], [fixed('basic', '1'), fixed('basic', '2')], [fixed('basic', '0')], [percent('basic', '100')]]) {
    assert.throws(() => calculateCompensation(input(rules)), CompensationValidationError);
  }
});

test('invalid percentages, rule shapes, inactive definitions, and arbitrary references are rejected', () => {
  for (const rules of [
    [fixed('basic', '1'), percent('hra', '1000.0001')],
    [fixed('basic', '1'), percent('hra', '-1')],
    [fixed('basic', '1'), { ...percent('hra', '10'), fixedAmount: '1' }],
    [fixed('basic', '1'), fixed('unknown', '2')],
  ]) assert.throws(() => calculateCompensation(input(rules)), CompensationValidationError);
  assert.throws(() => calculateCompensation({ ...input([fixed('basic', '1'), fixed('hra', '1')]), definitions: definitions.map((item) => item.id === 'hra' ? { ...item, isActive: false } : item) }), CompensationValidationError);
});

test('historical totals can be read from stored resolved values after a definition is deactivated', () => {
  const summary = summarizeResolvedCompensation({ code: 'USD', decimalPlaces: 2 }, [
    { category: 'EARNING', resolvedAmount: '500.00', frequency: 'MONTHLY' },
    { category: 'EMPLOYER_CONTRIBUTION', resolvedAmount: '10.00', frequency: 'MONTHLY' },
    { category: 'EMPLOYEE_DEDUCTION', resolvedAmount: '20.00', frequency: 'MONTHLY' },
  ]);
  assert.equal(summary.monthlyCtc, '510.00');
  assert.equal(summary.annualCtc, '6120.00');
});

test('frequencies annualize per payment; one-time stays outside CTC', () => {
  const result = calculateCompensation(input([
    fixed('basic', '1000'),
    { ...percent('hra', '50'), frequency: 'QUARTERLY' },
    { ...fixed('special', '300'), frequency: 'TRIANNUAL' },
    { ...fixed('bonus', '5000'), frequency: 'ONE_TIME' },
  ]));
  const by = (id: string) => result.items.find((item) => item.componentDefinitionId === id)!;
  assert.equal(by('hra').resolvedAmount, '500.00');
  assert.equal(by('hra').annualAmount, '2000.00');
  assert.equal(by('special').annualAmount, '900.00');
  assert.equal(by('bonus').annualAmount, '0.00');
  assert.equal(result.annualGross, '14900.00');
  assert.equal(result.annualCtc, '14900.00');
  assert.equal(result.monthlyGross, '1241.67');
  assert.equal(result.oneTimePayments, '5000.00');
});

test('basic salary must be monthly and deductions cannot be one-time', () => {
  assert.throws(() => calculateCompensation(input([{ ...fixed('basic', '1000'), frequency: 'ANNUAL' }])), /Basic Salary must be paid monthly/);
  assert.throws(() => calculateCompensation(input([fixed('basic', '1000'), { ...fixed('employee', '10'), frequency: 'ONE_TIME' }])), /cannot be one-time/);
});

test('half-yearly and annual items count 2 and 1 payments per year', () => {
  const result = calculateCompensation(input([fixed('basic', '1000'), { ...fixed('special', '600'), frequency: 'HALF_YEARLY' }, { ...fixed('bonus', '1200'), frequency: 'ANNUAL' }]));
  assert.equal(result.annualGross, '14400.00');
  assert.equal(result.monthlyCtc, '1200.00');
});
