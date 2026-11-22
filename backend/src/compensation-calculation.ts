import { Prisma } from './generated/prisma/client.js';

export type Category = 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION';
export type Rule = {
  componentDefinitionId: string;
  calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE';
  fixedAmount?: string | null;
  percentage?: string | null;
};
export type Definition = { id: string; category: Category; isBasic: boolean; isActive: boolean };
export type CalculationInput = { currency: { code: string; decimalPlaces: number; isActive: boolean }; definitions: Definition[]; items: Rule[] };

export class CompensationValidationError extends Error {}

const fail = (message: string): never => { throw new CompensationValidationError(message); };
const decimal = (value: string | null | undefined, label: string): Prisma.Decimal => {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,4})?$/.test(value)) return fail(`${label} must be a nonnegative decimal with at most four fractional digits`);
  return new Prisma.Decimal(value);
};

export function calculateCompensation(input: CalculationInput) {
  const { currency, definitions, items } = input;
  if (!currency.isActive || !Number.isInteger(currency.decimalPlaces) || currency.decimalPlaces < 0 || currency.decimalPlaces > 4) fail('Currency is not available');
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const basicDefinitions = definitions.filter((definition) => definition.isBasic);
  if (basicDefinitions.length !== 1) fail('Exactly one Basic Salary definition is required');
  if (new Set(items.map((item) => item.componentDefinitionId)).size !== items.length) fail('A component may appear only once');
  const basicRule = items.find((item) => item.componentDefinitionId === basicDefinitions[0].id);
  if (!basicRule || basicRule.calculationType !== 'FIXED' || basicRule.percentage != null) throw new CompensationValidationError('Basic Salary must be present and fixed');
  const baseInput = decimal(basicRule.fixedAmount, 'Basic Salary');
  if (baseInput.lte(0)) fail('Basic Salary must be positive');
  const round = (value: Prisma.Decimal) => value.toDecimalPlaces(currency.decimalPlaces, Prisma.Decimal.ROUND_HALF_UP);
  const base = round(baseInput);
  if (base.lte(0)) fail('Basic Salary must remain positive after currency rounding');
  const zero = new Prisma.Decimal(0);
  const maximumStoredAmount = new Prisma.Decimal('9999999999999999.9999');
  const totals = { gross: zero, employerContributions: zero, employeeDeductions: zero };
  const resolvedItems = items.map((item) => {
    const definition = byId.get(item.componentDefinitionId);
    if (!definition || !definition.isActive) throw new CompensationValidationError('Unknown or inactive component definition');
    if (definition.isBasic && item.calculationType !== 'FIXED') fail('Basic Salary must be fixed');
    let amount: Prisma.Decimal = zero;
    if (item.calculationType === 'FIXED') {
      if (item.percentage != null) fail('Fixed component cannot have a percentage');
      amount = decimal(item.fixedAmount, 'Fixed amount');
    } else if (item.calculationType === 'PERCENTAGE_OF_BASE') {
      if (item.fixedAmount != null) fail('Percentage component cannot have a fixed amount');
      const percentage = decimal(item.percentage, 'Percentage');
      if (percentage.gt(1000)) fail('Percentage must be between 0 and 1000');
      amount = base.mul(percentage).div(100);
    } else fail('Unknown calculation type');
    const resolvedMonthlyAmount = round(amount);
    if (amount.gt(maximumStoredAmount) || resolvedMonthlyAmount.gt(maximumStoredAmount)) fail('Amount exceeds supported precision');
    if (definition.category === 'EARNING') totals.gross = totals.gross.add(resolvedMonthlyAmount);
    else if (definition.category === 'EMPLOYER_CONTRIBUTION') totals.employerContributions = totals.employerContributions.add(resolvedMonthlyAmount);
    else totals.employeeDeductions = totals.employeeDeductions.add(resolvedMonthlyAmount);
    return { ...item, category: definition.category, resolvedMonthlyAmount: resolvedMonthlyAmount.toFixed(currency.decimalPlaces) };
  });
  const monthlyCtc = totals.gross.add(totals.employerContributions);
  return {
    currencyCode: currency.code,
    items: resolvedItems,
    monthlyGross: totals.gross.toFixed(currency.decimalPlaces),
    monthlyEmployerContributions: totals.employerContributions.toFixed(currency.decimalPlaces),
    monthlyEmployeeDeductions: totals.employeeDeductions.toFixed(currency.decimalPlaces),
    monthlyCtc: monthlyCtc.toFixed(currency.decimalPlaces),
    annualCtc: monthlyCtc.mul(12).toFixed(currency.decimalPlaces),
  };
}

export function summarizeResolvedCompensation(currency: { code: string; decimalPlaces: number }, items: { resolvedMonthlyAmount: string; category: Category }[]) {
  const totals = { gross: new Prisma.Decimal(0), employerContributions: new Prisma.Decimal(0), employeeDeductions: new Prisma.Decimal(0) };
  for (const item of items) {
    const amount = new Prisma.Decimal(item.resolvedMonthlyAmount);
    if (item.category === 'EARNING') totals.gross = totals.gross.add(amount);
    else if (item.category === 'EMPLOYER_CONTRIBUTION') totals.employerContributions = totals.employerContributions.add(amount);
    else totals.employeeDeductions = totals.employeeDeductions.add(amount);
  }
  const fixed = (value: Prisma.Decimal) => value.toFixed(currency.decimalPlaces);
  const monthlyCtc = totals.gross.add(totals.employerContributions);
  return { currencyCode: currency.code, monthlyGross: fixed(totals.gross), monthlyEmployerContributions: fixed(totals.employerContributions), monthlyEmployeeDeductions: fixed(totals.employeeDeductions), monthlyCtc: fixed(monthlyCtc), annualCtc: fixed(monthlyCtc.mul(12)) };
}
