'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { IconAlertCircle, IconArrowRight, IconRefresh } from '@tabler/icons-react';
import SidebarDemo from '@/components/sidebar-demo';
import { domain, formatMoney, frequencyShort, type Currency, type Frequency } from './api';

type CurrencyStats = {
  currency: Currency;
  packages: number;
  totals: { monthlyGross: string; monthlyEmployerContributions: string; monthlyEmployeeDeductions: string; monthlyCtc: string; annualCtc: string };
  annualCtc: { average: string; median: string; min: string; max: string };
  components: { code: string; name: string; category: 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION'; monthly: string; annual: string; oneTime: string; frequencies: Frequency[] }[];
  roles: { role: string; count: number; averageAnnualCtc: string }[];
  distribution: { from: string; to: string; count: number }[];
};
type Stats = { headcount: number; withActivePackage: number; withoutActivePackage: number; drafts: number; pending: number; currencies: CurrencyStats[] };

const roleLabel: Record<string, string> = { admin: 'Admin', hr: 'HR', employee: 'Employees' };
const categoryLabel = { EARNING: 'Earning', EMPLOYER_CONTRIBUTION: 'Employer contribution', EMPLOYEE_DEDUCTION: 'Deduction' } as const;
const panel = 'rounded-2xl border border-[var(--rule)] bg-white shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-12px_rgba(15,76,92,.12)]';
const heading = 'font-[family-name:var(--font-manrope)] text-base font-semibold tracking-[-0.01em] text-[var(--charcoal)]';

function formatters(currency: Currency) {
  const locale = currency.code === 'INR' ? 'en-IN' : undefined;
  const compact = new Intl.NumberFormat(locale, { style: 'currency', currency: currency.code, notation: 'compact', maximumFractionDigits: 1 });
  return { full: (value: string) => formatMoney(value, currency, locale), compact: (value: string) => compact.format(Number(value)) };
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    domain<Stats>('compensation/stats').then(setStats).catch((reason: Error) => setError(reason.message));
  }, []);
  useEffect(() => { queueMicrotask(load); }, [load]);
  const primary = stats?.currencies[0];

  return <SidebarDemo title="Dashboard" subtitle="Compensation across your organization">
    <div className="mt-8 w-full space-y-6 tabular-nums">
      {error ? <LoadError message={error} onRetry={load} /> : !stats ? <Skeleton /> : <>
        {(stats.withoutActivePackage > 0 || stats.drafts > 0 || stats.pending > 0) && <Attention stats={stats} />}
        {primary ? <Overview stats={stats} data={primary} /> : <Empty headcount={stats.headcount} />}
        {primary && <div className="grid gap-6 lg:grid-cols-2">
          <Distribution data={primary} />
          <ByRole data={primary} />
        </div>}
        {primary && <Components data={primary} />}
        {stats.currencies.length > 1 && <p className="text-sm text-[var(--muted-text)]">Figures above cover {primary!.currency.code} packages only. {stats.currencies.slice(1).map((item) => `${item.packages} ${item.currency.code}`).join(', ')} package(s) are excluded so currencies are never mixed.</p>}
      </>}
    </div>
  </SidebarDemo>;
}

function Attention({ stats }: { stats: Stats }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EBD9B4] bg-[#FDF8EE] px-5 py-3.5 text-sm text-[#6B4E16]">
    <p className="flex items-center gap-2.5"><IconAlertCircle aria-hidden="true" size={18} stroke={1.75} className="shrink-0" />
      {[stats.pending > 0 && `${stats.pending} waiting for approval`, stats.withoutActivePackage > 0 && `${stats.withoutActivePackage} ${stats.withoutActivePackage === 1 ? 'person has' : 'people have'} no active package`, stats.drafts > 0 && `${stats.drafts} draft${stats.drafts === 1 ? '' : 's'} waiting`].filter(Boolean).join(' · ')}
    </p>
    <Link href={stats.pending > 0 ? "/app/compensation?status=pending" : "/app/compensation"} className="inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6B4E16]">Review <IconArrowRight aria-hidden="true" size={16} stroke={1.75} /></Link>
  </div>;
}

function Overview({ stats, data }: { stats: Stats; data: CurrencyStats }) {
  const { full, compact } = formatters(data.currency);
  const gross = Number(data.totals.monthlyGross), employer = Number(data.totals.monthlyEmployerContributions), ctc = gross + employer || 1;
  const coverage = stats.headcount ? Math.round((stats.withActivePackage / stats.headcount) * 100) : 0;
  return <section aria-label="Totals" className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
    <div className="rounded-2xl bg-[var(--deep-teal)] p-6 text-white">
      <p className="text-sm text-[#B9D6D3]">Total annual cost to company</p>
      <p className="mt-2 font-[family-name:var(--font-manrope)] text-[2.25rem] font-bold leading-none tracking-[-0.03em]">{compact(data.totals.annualCtc)}</p>
      <p className="mt-2 text-sm text-[#B9D6D3]">{full(data.totals.annualCtc)} · {full(data.totals.monthlyCtc)} per month</p>
      <div className="mt-6 flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Gross pay ${Math.round((gross / ctc) * 100)}% and employer contributions ${Math.round((employer / ctc) * 100)}% of monthly CTC`}>
        <span className="band-reveal block h-full rounded-l-full bg-[#92DCCB]" style={{ width: `${(gross / ctc) * 100}%` }} />
        {employer > 0 && <span className="band-reveal block h-full rounded-r-full bg-[#4FB3A3]" style={{ width: `${(employer / ctc) * 100}%`, animationDelay: '120ms' }} />}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-[#D5E8E5]"><span aria-hidden="true" className="size-2 rounded-full bg-[#92DCCB]" />Monthly gross pay</dt><dd className="font-semibold">{full(data.totals.monthlyGross)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-[#D5E8E5]"><span aria-hidden="true" className="size-2 rounded-full bg-[#4FB3A3]" />Employer contributions</dt><dd className="font-semibold">{full(data.totals.monthlyEmployerContributions)}</dd></div>
      </dl>
    </div>
    <dl className={`${panel} grid grid-cols-2 gap-px overflow-hidden bg-[var(--rule)] sm:grid-cols-3 [&>div]:bg-white [&>div]:p-5 sm:[&>div]:p-6`}>
      <Stat label="Headcount" value={String(stats.headcount)} detail={`${stats.withActivePackage} with an active package (${coverage}%)`} />
      <Stat label="Average annual CTC" value={compact(data.annualCtc.average)} detail={full(data.annualCtc.average)} />
      <Stat label="Median annual CTC" value={compact(data.annualCtc.median)} detail={full(data.annualCtc.median)} />
      <Stat label="Lowest annual CTC" value={compact(data.annualCtc.min)} detail={full(data.annualCtc.min)} />
      <Stat label="Highest annual CTC" value={compact(data.annualCtc.max)} detail={full(data.annualCtc.max)} />
      <Stat label="Monthly deductions" value={compact(data.totals.monthlyEmployeeDeductions)} detail="Withheld from gross pay" />
    </dl>
  </section>;
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div>
    <dt className="text-sm text-[var(--muted-text)]">{label}</dt>
    <dd className="mt-1.5 font-[family-name:var(--font-manrope)] text-2xl font-semibold tracking-[-0.02em] text-[var(--charcoal)]">{value}</dd>
    <dd className="mt-1 text-xs text-[var(--muted-text)]">{detail}</dd>
  </div>;
}

function Distribution({ data }: { data: CurrencyStats }) {
  const { compact } = formatters(data.currency);
  const max = Math.max(1, ...data.distribution.map((bucket) => bucket.count));
  return <section className={`${panel} overflow-hidden p-6`} aria-labelledby="distribution-heading">
    <h2 id="distribution-heading" className={heading}>Annual CTC distribution</h2>
    <p className="mt-1 text-sm text-[var(--muted-text)]">People per pay range</p>
    <div className="mt-6 flex h-44 items-end gap-2 border-b border-[var(--rule)]">
      {data.distribution.map((bucket) => {
        const label = `${compact(bucket.from)} – ${compact(bucket.to)}: ${bucket.count} ${bucket.count === 1 ? 'person' : 'people'}`;
        return <div key={bucket.from} className="group relative flex h-full flex-1 flex-col justify-end" tabIndex={0} aria-label={label}>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--charcoal)] px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-first:left-0 group-first:translate-x-0 group-last:left-auto group-last:right-0 group-last:translate-x-0">{label}</span>
          <span className="mb-1 text-center text-xs font-medium text-[var(--charcoal)]">{bucket.count || ''}</span>
          <span className="block rounded-t-[4px] bg-[var(--teal)] transition-colors group-hover:bg-[var(--deep-teal)]" style={{ height: `${(bucket.count / max) * 80}%`, minHeight: bucket.count ? 4 : 0 }} />
        </div>;
      })}
    </div>
    <div className="mt-2 flex gap-2 text-[11px] text-[var(--muted-text)]">{data.distribution.map((bucket) => <span key={bucket.from} className="flex-1 truncate text-center">{compact(bucket.from)}</span>)}</div>
  </section>;
}

function ByRole({ data }: { data: CurrencyStats }) {
  const { compact, full } = formatters(data.currency);
  const max = Math.max(1, ...data.roles.map((role) => Number(role.averageAnnualCtc)));
  return <section className={`${panel} p-6`} aria-labelledby="role-heading">
    <h2 id="role-heading" className={heading}>Average annual CTC by role</h2>
    <p className="mt-1 text-sm text-[var(--muted-text)]">Active packages only</p>
    <ul className="mt-6 space-y-5">
      {data.roles.map((role) => <li key={role.role} title={full(role.averageAnnualCtc)}>
        <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium text-[var(--charcoal)]">{roleLabel[role.role] ?? role.role} <span className="font-normal text-[var(--muted-text)]">· {role.count}</span></span><span className="font-semibold">{compact(role.averageAnnualCtc)}</span></div>
        <div className="mt-2 h-2 rounded-full bg-[#EDF3F2]"><div className="band-reveal h-full rounded-full bg-[var(--teal)]" style={{ width: `${(Number(role.averageAnnualCtc) / max) * 100}%` }} /></div>
      </li>)}
    </ul>
  </section>;
}

function Components({ data }: { data: CurrencyStats }) {
  const { full } = formatters(data.currency);
  // Rank by the yearly cost so quarterly and annual components compare fairly with monthly ones.
  const cost = (item: CurrencyStats['components'][number]) => Number(item.annual) + Number(item.oneTime);
  const max = Math.max(1, ...data.components.map(cost));
  const paid = (item: CurrencyStats['components'][number]) => item.frequencies.length === 1 ? frequencyShort(item.frequencies[0]) : 'Mixed';
  return <section className={`${panel} overflow-hidden`} aria-labelledby="component-heading">
    <div className="p-6 pb-2"><h2 id="component-heading" className={heading}>Yearly cost by component</h2><p className="mt-1 text-sm text-[var(--muted-text)]">Summed across all active packages. Quarterly, half-yearly, and annual payments are counted per year.</p></div>
    <table className="w-full text-left text-sm">
      <thead><tr className="border-b border-[var(--rule)] text-xs text-[var(--muted-text)]"><th scope="col" className="py-2 pl-6 pr-3 font-medium">Component</th><th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Paid</th><th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Type</th><th scope="col" className="hidden px-3 py-2 font-medium md:table-cell"><span className="sr-only">Share</span></th><th scope="col" className="px-3 py-2 text-right font-medium">Per year</th><th scope="col" className="hidden py-2 pl-3 pr-6 text-right font-medium sm:table-cell">Monthly equivalent</th></tr></thead>
      <tbody className="divide-y divide-[var(--rule)]">
        {data.components.map((item) => { const sign = item.category === 'EMPLOYEE_DEDUCTION' ? '−' : ''; const oneTimeOnly = Number(item.annual) === 0 && Number(item.oneTime) > 0; return <tr key={item.code} className="hover:bg-[#F7FAF9]">
          <th scope="row" className="py-3 pl-6 pr-3 font-medium text-[var(--charcoal)]">{item.name}</th>
          <td className="hidden px-3 py-3 text-[var(--muted-text)] sm:table-cell">{paid(item)}</td>
          <td className="hidden px-3 py-3 text-[var(--muted-text)] lg:table-cell">{categoryLabel[item.category]}</td>
          <td className="hidden w-[22%] px-3 py-3 md:table-cell"><div className="h-2 rounded-full bg-[#EDF3F2]"><div className="h-full rounded-full bg-[var(--teal)]" style={{ width: `${(cost(item) / max) * 100}%` }} /></div></td>
          <td className="px-3 py-3 text-right font-semibold">{oneTimeOnly ? <>{full(item.oneTime)}<span className="block text-xs font-normal text-[var(--muted-text)]">one-time, not in CTC</span></> : <>{sign}{full(item.annual)}{Number(item.oneTime) > 0 && <span className="block text-xs font-normal text-[var(--muted-text)]">+ {full(item.oneTime)} one-time</span>}</>}</td>
          <td className="hidden py-3 pl-3 pr-6 text-right text-[var(--muted-text)] sm:table-cell">{oneTimeOnly ? '—' : `${sign}${full(item.monthly)}`}</td>
        </tr>; })}
      </tbody>
    </table>
  </section>;
}

function Empty({ headcount }: { headcount: number }) {
  return <div className={`${panel} max-w-xl p-8`}>
    <h2 className={heading}>No active packages yet</h2>
    <p className="mt-2 text-sm leading-relaxed text-[var(--muted-text)]">{headcount} {headcount === 1 ? 'person is' : 'people are'} in your organization. Totals and charts appear once compensation is applied.</p>
    <Link href="/app/compensation" className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[var(--deep-teal)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--teal)]">Manage compensation <IconArrowRight aria-hidden="true" size={16} stroke={1.75} /></Link>
  </div>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="flex max-w-xl gap-4 rounded-2xl border border-[#F0C9C4] bg-[#FDF6F5] p-6 text-[#7A2A20]">
    <IconAlertCircle aria-hidden="true" size={22} stroke={1.75} className="mt-0.5 shrink-0" />
    <div><p className="font-semibold">We couldn&apos;t load the dashboard</p><p className="mt-1 text-sm">{message}</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#E2B3AC] bg-white px-3.5 py-2 text-sm font-semibold hover:bg-[#FBEDEB]"><IconRefresh aria-hidden="true" size={16} stroke={1.75} />Try again</button></div>
  </div>;
}

function Skeleton() {
  const block = 'rounded-2xl bg-[#E3ECEA] motion-safe:animate-pulse';
  return <div aria-busy="true" aria-label="Loading dashboard" className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]"><div className={`${block} h-64`} /><div className={`${block} h-64`} /></div>
    <div className="grid gap-6 lg:grid-cols-2"><div className={`${block} h-72`} /><div className={`${block} h-72`} /></div>
  </div>;
}
