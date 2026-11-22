export type Currency = { code: string; name: string; symbol: string; decimal_places: number };
export type Definition = { id: string; code: string; name: string; category: 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION'; is_basic: boolean; is_active: boolean };
export type Item = { id: string; component_definition_id: string; calculation_type: 'FIXED' | 'PERCENTAGE_OF_BASE'; fixed_amount: string | null; percentage: string | null; resolved_monthly_amount: string; definition: Definition };
export type Summary = { monthlyGross: string; monthlyEmployerContributions: string; monthlyEmployeeDeductions: string; monthlyCtc: string; annualCtc: string };
export type Package = { id: string; status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED'; currency_code: string; effective_from: string; effective_to: string | null; version: number; items: Item[]; summary: Summary };
export type EmployeeRecord = { id: string; displayName: string; organizationId: string; organization?: { name: string } };

export async function domain<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/domain/${path}`, { ...init, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers }, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Compensation request failed');
  return result as T;
}

export function formatMoney(value: string, currency: Currency | undefined) {
  if (!currency || !/^\d+(?:\.\d+)?$/.test(value)) return value;
  const [whole, fraction = ''] = value.split('.');
  const grouped = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(BigInt(whole));
  const parts = new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.code, minimumFractionDigits: currency.decimal_places, maximumFractionDigits: currency.decimal_places }).formatToParts(0);
  return parts.map((part) => part.type === 'integer' ? grouped : part.type === 'fraction' ? fraction.padEnd(currency.decimal_places, '0').slice(0, currency.decimal_places) : part.value).join('');
}
