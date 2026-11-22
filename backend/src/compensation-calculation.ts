import { Prisma } from './generated/prisma/client.js';

export type Category = 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION';
export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'TRIANNUAL' | 'HALF_YEARLY' | 'ANNUAL' | 'ONE_TIME';
export type Rule = {
  componentDefinitionId: string;
  calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE';
  fixedAmount?: string | null;
  percentage?: string | null;
  /** How often the amount is paid. Amounts and percentages are per payment. Defaults to MONTHLY. */
  frequency?: Frequency;
};
export type Definition = { id: string; category: Category; isBasic: boolean; isActive: boolean; name?: string };
export type CalculationInput = { currency: { code: string; decimalPlaces: number; isActive: boolean }; definitions: Definition[]; items: Rule[] };

/** Payments per year. ONE_TIME is paid once and is reported outside recurring CTC. */
export const paymentsPerYear: Record<Frequency, number> = { MONTHLY: 12, QUARTERLY: 4, TRIANNUAL: 3, HALF_YEARLY: 2, ANNUAL: 1, ONE_TIME: 0 };
export const frequencies = Object.keys(paymentsPerYear) as Frequency[];

export class CompensationValidationError extends Error {}

const fail = (message: string): never => { throw new CompensationValidationError(message); };
const decimal = (value: string | null | undefined, label: string): Prisma.Decimal => {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,4})?$/.test(value)) return fail(`${label} must be a nonnegative decimal with at most four fractional digits`);
  return new Prisma.Decimal(value);
};

type Totalled = { category: Category; frequency: Frequency; resolvedAmount: Prisma.Decimal };

// Recurring amounts are summed per year; monthly figures are the annual figure divided by 12.
function totalsFor(items: Totalled[], decimals: number) {
  const zero = new Prisma.Decimal(0);
  const annual = { EARNING: zero, EMPLOYER_CONTRIBUTION: zero, EMPLOYEE_DEDUCTION: zero };
  const oneTime = { EARNING: zero, EMPLOYER_CONTRIBUTION: zero, EMPLOYEE_DEDUCTION: zero };
  for (const item of items) {
    if (item.frequency === 'ONE_TIME') oneTime[item.category] = oneTime[item.category].add(item.resolvedAmount);
    else annual[item.category] = annual[item.category].add(item.resolvedAmount.mul(paymentsPerYear[item.frequency]));
  }
  const fixed = (value: Prisma.Decimal) => value.toDecimalPlaces(decimals, Prisma.Decimal.ROUND_HALF_UP).toFixed(decimals);
  const annualCtc = annual.EARNING.add(annual.EMPLOYER_CONTRIBUTION);
  return {
    monthlyGross: fixed(annual.EARNING.div(12)),
    monthlyEmployerContributions: fixed(annual.EMPLOYER_CONTRIBUTION.div(12)),
    monthlyEmployeeDeductions: fixed(annual.EMPLOYEE_DEDUCTION.div(12)),
    monthlyCtc: fixed(annualCtc.div(12)),
    annualGross: fixed(annual.EARNING),
    annualEmployerContributions: fixed(annual.EMPLOYER_CONTRIBUTION),
    annualEmployeeDeductions: fixed(annual.EMPLOYEE_DEDUCTION),
    annualCtc: fixed(annualCtc),
    oneTimePayments: fixed(oneTime.EARNING.add(oneTime.EMPLOYER_CONTRIBUTION)),
    oneTimeDeductions: fixed(oneTime.EMPLOYEE_DEDUCTION),
  };
}

export function calculateCompensation(input: CalculationInput) {
  const { currency, definitions, items } = input;
  if (!currency.isActive || !Number.isInteger(currency.decimalPlaces) || currency.decimalPlaces < 0 || currency.decimalPlaces > 4) fail('Currency is not available');
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const basicDefinitions = definitions.filter((definition) => definition.isBasic);
  if (basicDefinitions.length !== 1) fail('Exactly one Basic Salary definition is required');
  if (new Set(items.map((item) => item.componentDefinitionId)).size !== items.length) fail('A component may appear only once');
  const basicRule = items.find((item) => item.componentDefinitionId === basicDefinitions[0].id);
  if (!basicRule || basicRule.calculationType !== 'FIXED' || basicRule.percentage != null) throw new CompensationValidationError('Basic Salary must be present and fixed');
  if ((basicRule.frequency ?? 'MONTHLY') !== 'MONTHLY') fail('Basic Salary must be paid monthly');
  const baseInput = decimal(basicRule.fixedAmount, 'Basic Salary');
  if (baseInput.lte(0)) fail('Basic Salary must be positive');
  const round = (value: Prisma.Decimal) => value.toDecimalPlaces(currency.decimalPlaces, Prisma.Decimal.ROUND_HALF_UP);
  const base = round(baseInput);
  if (base.lte(0)) fail('Basic Salary must remain positive after currency rounding');
  const zero = new Prisma.Decimal(0);
  const maximumStoredAmount = new Prisma.Decimal('9999999999999999.9999');
  const resolved = items.map((item) => {
    const definition = byId.get(item.componentDefinitionId);
    if (!definition) throw new CompensationValidationError('A component in this package no longer exists. Remove it and try again.');
    if (!definition.isActive) throw new CompensationValidationError(`${definition.name ?? 'A component'} has been deactivated. Remove it from the package, or reactivate it in Component definitions.`);
    const frequency = item.frequency ?? 'MONTHLY';
    if (!(frequency in paymentsPerYear)) fail(`Unknown payment frequency for ${definition.name ?? 'a component'}`);
    if (frequency === 'ONE_TIME' && definition.category === 'EMPLOYEE_DEDUCTION') fail(`${definition.name ?? 'A deduction'} cannot be one-time; choose how often it is deducted`);
    if (definition.isBasic && item.calculationType !== 'FIXED') fail('Basic Salary must be fixed');
    let amount: Prisma.Decimal = zero;
    if (item.calculationType === 'FIXED') {
      if (item.percentage != null) fail('Fixed component cannot have a percentage');
      amount = decimal(item.fixedAmount, `${definition.name ?? 'Fixed'} amount`);
    } else if (item.calculationType === 'PERCENTAGE_OF_BASE') {
      if (item.fixedAmount != null) fail('Percentage component cannot have a fixed amount');
      const percentage = decimal(item.percentage, `${definition.name ?? 'Percentage'} percentage`);
      if (percentage.gt(1000)) fail('Percentage must be between 0 and 1000');
      amount = base.mul(percentage).div(100);
    } else fail('Unknown calculation type');
    const resolvedAmount = round(amount);
    const annualAmount = resolvedAmount.mul(paymentsPerYear[frequency]);
    if (amount.gt(maximumStoredAmount) || annualAmount.gt(maximumStoredAmount)) fail('Amount exceeds supported precision');
    return { item: { ...item, frequency }, definition, resolvedAmount, annualAmount };
  });
  const totals = totalsFor(resolved.map(({ item, definition, resolvedAmount }) => ({ category: definition.category, frequency: item.frequency, resolvedAmount })), currency.decimalPlaces);
  return {
    currencyCode: currency.code,
    items: resolved.map(({ item, definition, resolvedAmount, annualAmount }) => ({
      ...item,
      category: definition.category,
      resolvedAmount: resolvedAmount.toFixed(currency.decimalPlaces),
      annualAmount: annualAmount.toFixed(currency.decimalPlaces),
      // Monthly equivalent of a recurring item; zero for one-time payments.
      resolvedMonthlyAmount: round(annualAmount.div(12)).toFixed(currency.decimalPlaces),
    })),
    ...totals,
  };
}

export function summarizeResolvedCompensation(currency: { code: string; decimalPlaces: number }, items: { resolvedAmount: string; frequency: Frequency; category: Category }[]) {
  return { currencyCode: currency.code, ...totalsFor(items.map((item) => ({ category: item.category, frequency: item.frequency, resolvedAmount: new Prisma.Decimal(item.resolvedAmount) })), currency.decimalPlaces) };
}
