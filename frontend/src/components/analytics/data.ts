'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { domain, formatMoney, type Currency } from '@/components/compensation/api';

export type Filters = { country: string; department: string; currency: string };
export type Analytics = {
  filters: { country: string | null; departmentId: string | null; currency: string | null };
  options: { countries: { code: string; name: string; currencyCode: string }[]; departments: { id: string; name: string; code: string; isActive: boolean }[]; currencies: (Currency & { employees: number })[] };
  currency: Currency | null;
  requiresCurrency: boolean;
  headcount: number;
  covered: number;
  native: { currency: Currency; employees: number; annualCtc: string; gross: string; employer: string; deductions: string }[];
  money: { employees: number; total: string; average: string | null; median: string | null; min: string | null; max: string | null; gross: string; employer: string; deductions: string } | null;
  departments: { id: string | null; name: string; headcount: number; employees: number; annualCtc: string | null }[];
  countries: { code: string; name: string; headcount: number; covered: number; totals: { currency: string; employees: number; annualCtc: string }[] }[];
  distribution: { start: number; step: number; bands: { from: number; to: number; employees: number }[] } | null;
  components: { id: string; code: string; name: string; category: 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION'; employees: number; annual: string; oneTime: string }[] | null;
  matrix: { departmentId: string | null; countryCode: string; headcount: number; employees: number; averageCtc: string | null }[];
  approvals: { pending: number; ages: { key: string; label: string; requests: number }[]; recent: { id: string; employee: { id: string; displayName: string; countryCode: string; department: string | null }; submitter: string | null; submittedAt: string | null; effectiveFrom: string; currencyCode: string; annualCtc: string }[] };
};

/** Dashboard filters live in the URL so both analytics pages share them and links are shareable. */
export function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo<Filters>(() => ({ country: params.get('country') ?? '', department: params.get('department') ?? '', currency: params.get('currency') ?? '' }), [params]);
  const query = useMemo(() => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) next.set(key, value);
    return next.toString();
  }, [filters]);
  const set = useCallback((change: Partial<Filters>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...change })) if (value) next.set(key, value);
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [filters, pathname, router]);
  return { filters, query, set };
}

export function useAnalytics(query: string) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => { if (current) setLoading(true); });
    domain<Analytics>(`compensation/analytics${query ? `?${query}` : ''}`)
      .then((result) => { if (current) { setData(result); setError(''); } })
      .catch((reason: Error) => { if (current) setError(reason.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query, attempt]);
  return { data, error, loading, retry: () => setAttempt((value) => value + 1) };
}

/** Link into the people directory carrying the given filters. */
export function directoryHref(filters: Partial<Filters> & { ctcMin?: string; ctcMax?: string; status?: string }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  return `/app/compensation${query.size ? `?${query}` : ''}`;
}

const localeFor = (currency: Pick<Currency, 'code'> | null | undefined) => currency?.code === 'INR' ? 'en-IN' : 'en-GB';

/** Exact amount, e.g. ₹16,77,102.40. */
export function money(value: string | number | null | undefined, currency: Currency | null | undefined) {
  if (value == null || !currency) return '—';
  const text = typeof value === 'number' ? value.toFixed(currency.decimal_places) : value;
  return formatMoney(text, currency, localeFor(currency));
}

/** Short amount for cards and axes: lakh/crore for INR (₹18.1L, ₹1,005Cr), otherwise K/M/B ($231.5M). */
export function shortMoney(value: string | number | null | undefined, currency: Currency | null | undefined) {
  if (value == null || !currency) return '—';
  const number = Number(value);
  if (currency.code === 'INR' && Math.abs(number) >= 100_000) {
    const [unit, size] = Math.abs(number) >= 10_000_000 ? ['Cr', 10_000_000] : ['L', 100_000];
    const scaled = number / size;
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: Math.abs(scaled) >= 100 ? 0 : 1 }).format(scaled)}${unit}`;
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.code, currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: Math.abs(number) >= 1000 ? 1 : 0, minimumFractionDigits: 0 }).format(number);
}

export const count = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const percent = (part: number, whole: number) => whole ? `${((part / whole) * 100).toFixed(part / whole >= 0.1 || part === 0 ? 0 : 1)}%` : '—';
