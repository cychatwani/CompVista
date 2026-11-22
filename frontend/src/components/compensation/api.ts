export type Currency = { code: string; name: string; symbol: string; decimal_places: number };
export type Definition = { id: string; code: string; name: string; category: 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION'; is_basic: boolean; is_active: boolean; default_frequency?: Frequency; usage?: number; liveUsage?: number };
export type Frequency = 'MONTHLY' | 'QUARTERLY' | 'TRIANNUAL' | 'HALF_YEARLY' | 'ANNUAL' | 'ONE_TIME';
export type Item = { id: string; component_definition_id: string; calculation_type: 'FIXED' | 'PERCENTAGE_OF_BASE'; fixed_amount: string | null; percentage: string | null; resolved_monthly_amount: string; resolved_amount: string; annual_amount: string; frequency: Frequency; definition: Definition };

// Amounts are entered and stored per payment; recurring items are annualized, one-time items sit outside CTC.
export const frequencyOptions: { value: Frequency; label: string; short: string; perYear: number }[] = [
  { value: 'MONTHLY', label: 'Monthly', short: 'Monthly', perYear: 12 },
  { value: 'QUARTERLY', label: 'Quarterly (4× a year)', short: 'Quarterly', perYear: 4 },
  { value: 'TRIANNUAL', label: '3× a year', short: '3× a year', perYear: 3 },
  { value: 'HALF_YEARLY', label: 'Half-yearly (2× a year)', short: 'Half-yearly', perYear: 2 },
  { value: 'ANNUAL', label: 'Annual (once a year)', short: 'Annual', perYear: 1 },
  { value: 'ONE_TIME', label: 'One-time', short: 'One-time', perYear: 0 },
];
export const frequencyShort = (value: Frequency | undefined) => frequencyOptions.find((option) => option.value === (value ?? 'MONTHLY'))!.short;
export type Summary = { monthlyGross: string; monthlyEmployerContributions: string; monthlyEmployeeDeductions: string; monthlyCtc: string; annualCtc: string; annualGross?: string; annualEmployerContributions?: string; annualEmployeeDeductions?: string; oneTimePayments?: string; oneTimeDeductions?: string };
export type Package = { id: string; status: 'DRAFT' | 'ACTIVE' | 'SCHEDULED' | 'SUPERSEDED' | 'PENDING_APPROVAL'; currency_code: string; effective_from: string; effective_to: string | null; version: number; items: Item[]; summary: Summary; submitted_at?: string | null; decided_at?: string | null; decision_note?: string | null; change_requests?: { target: 'component' | 'effectiveFrom'; componentDefinitionId: string | null; label?: string; note: string }[] | null; submitter?: { name: string } | null; decider?: { name: string } | null; canDecide?: boolean };
export type EmployeeRecord = { id: string; displayName: string; organizationId: string; organization?: { name: string }; email?: string | null; employeeCode?: string | null; jobTitle?: string | null; jobLevel?: string | null; employmentStatus?: string; hireDate?: string | null; departmentId?: string | null; countryCode: string; department?: { id: string; name: string } | null; country?: { code: string; name: string; currency_code?: string } };

export async function domain<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/domain/${path}`, { ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers }, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Compensation request failed');
  return result as T;
}

export function formatMoney(value: string, currency: Currency | undefined, locale?: string) {
  if (!currency || !/^\d+(?:\.\d+)?$/.test(value)) return value;
  const [whole, fraction = ''] = value.split('.');
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(whole));
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: currency.code, minimumFractionDigits: currency.decimal_places, maximumFractionDigits: currency.decimal_places }).formatToParts(0);
  return parts.map((part) => part.type === 'integer' ? grouped : part.type === 'fraction' ? fraction.padEnd(currency.decimal_places, '0').slice(0, currency.decimal_places) : part.value).join('');
}
