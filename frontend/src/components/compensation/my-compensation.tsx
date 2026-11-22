'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconAlertCircle, IconChevronDown, IconRefresh } from '@tabler/icons-react';
import SidebarDemo from '@/components/sidebar-demo';
import { domain, formatMoney, frequencyShort, type Currency, type Definition, type EmployeeRecord, type Frequency, type Item, type Package } from './api';

type OwnPackage = Package & { currency: Currency };
type OwnRecord = { employee: EmployeeRecord; active: OwnPackage | null; history: OwnPackage[] };
type Category = Definition['category'];

const sections: { category: Category; title: string; subtotal: string; note?: string }[] = [
  { category: 'EARNING', title: 'Earnings', subtotal: 'Gross pay' },
  { category: 'EMPLOYER_CONTRIBUTION', title: 'Employer contributions', subtotal: 'Total employer contributions', note: 'Paid by the company on your behalf, in addition to your gross pay.' },
];
const deductionSection = { category: 'EMPLOYEE_DEDUCTION' as const, title: 'Your deductions', subtotal: 'Total deductions', note: 'Withheld from your monthly pay. Deductions do not reduce your CTC.' };

const perPayment: Record<Frequency, string> = { MONTHLY: '/mo', QUARTERLY: '/quarter', TRIANNUAL: '×3 a year', HALF_YEARLY: '/half-year', ANNUAL: '/year', ONE_TIME: 'once' };

function basis(item: Item): string {
  const how = item.calculation_type === 'PERCENTAGE_OF_BASE' ? `${Number(item.percentage ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}% of Basic` : item.definition.is_basic ? 'Fixed · base for % items' : 'Fixed';
  return item.frequency && item.frequency !== 'MONTHLY' ? `${frequencyShort(item.frequency)} · ${how}` : how;
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const formatDate = (value: string) => dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
const period = (row: Package) => row.effective_to ? `${formatDate(row.effective_from)} – ${formatDate(row.effective_to)}` : `Since ${formatDate(row.effective_from)}`;

function useMoney(currency: Currency) {
  const locale = currency.code === 'INR' ? 'en-IN' : undefined;
  return (value: string) => formatMoney(value, currency, locale);
}

export function MyCompensation() {
  const [record, setRecord] = useState<OwnRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true); setError('');
    domain<OwnRecord>('me/compensation').then(setRecord).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { queueMicrotask(load); }, [load]);

  const past = record?.history.filter((row) => row.id !== record.active?.id) ?? [];
  const subtitle = record ? [record.employee.displayName, record.employee.organization?.name].filter(Boolean).join(' · ') : 'Your pay, explained line by line';

  return <SidebarDemo title="My compensation" subtitle={subtitle} background="fluted-bg">
    <div className="mt-8 w-full tabular-nums">
      {loading && !record ? <StatementSkeleton /> : error ? <LoadError message={error} onRetry={load} /> : record && (record.active ? <Statement row={record.active} /> : <NoPackage />)}
      {record && past.length > 0 && <History rows={past} />}
    </div>
  </SidebarDemo>;
}

function Statement({ row }: { row: OwnPackage }) {
  const money = useMoney(row.currency);
  const byCategory = (category: Category) => row.items.filter((item) => item.definition.category === category && item.frequency !== 'ONE_TIME');
  const oneTime = row.items.filter((item) => item.frequency === 'ONE_TIME');
  const totalsOf: Record<Category, { monthly: string; annual: string }> = {
    EARNING: { monthly: row.summary.monthlyGross, annual: row.summary.annualGross ?? '0' },
    EMPLOYER_CONTRIBUTION: { monthly: row.summary.monthlyEmployerContributions, annual: row.summary.annualEmployerContributions ?? '0' },
    EMPLOYEE_DEDUCTION: { monthly: row.summary.monthlyEmployeeDeductions, annual: row.summary.annualEmployeeDeductions ?? '0' },
  };
  const gross = Number(row.summary.monthlyGross);
  const employer = Number(row.summary.monthlyEmployerContributions);
  const ctc = gross + employer || 1;
  const deductions = byCategory('EMPLOYEE_DEDUCTION');

  return <section aria-labelledby="current-package">
    <div>
      <h2 id="current-package" className="font-[family-name:var(--font-manrope)] text-xl font-semibold tracking-[-0.02em]">Current package</h2>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted-text)]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E3F2EF] px-2.5 py-0.5 text-xs font-semibold text-[var(--jade-text)]"><span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--jade)]" />Active</span>
        <span>{period(row)}</span>
        <span aria-hidden="true">·</span>
        <span>{row.currency.name ?? row.currency_code}</span>
      </p>
    </div>

    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-white shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-12px_rgba(15,76,92,.12)]">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Compensation components with the amount of each payment and the yearly total</caption>
          <thead>
            <tr className="border-b border-[var(--rule)] bg-[#F7FAF9] text-xs font-medium text-[var(--muted-text)]">
              <th scope="col" className="px-5 py-3 font-medium sm:px-6">Component</th>
              <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Basis</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Each payment</th>
              <th scope="col" className="hidden py-3 pl-3 pr-5 text-right font-medium sm:table-cell sm:pr-6">Per year</th>
            </tr>
          </thead>
          {sections.map((section) => <LedgerSection key={section.category} {...section} items={byCategory(section.category)} totals={totalsOf[section.category]} money={money} />)}
          <tbody>
            <tr className="bg-[var(--deep-teal)] text-white">
              <th scope="row" className="px-5 py-4 text-[15px] font-semibold sm:px-6" colSpan={1}>Cost to company</th>
              <td className="hidden md:table-cell" />
              <td className="px-3 py-4 text-right text-[15px] font-semibold">{money(row.summary.monthlyCtc)}<span className="font-normal text-[#B9D6D3]"> /mo</span></td>
              <td className="hidden py-4 pl-3 pr-5 text-right text-[15px] font-semibold sm:table-cell sm:pr-6">{money(row.summary.annualCtc)}</td>
            </tr>
          </tbody>
          {oneTime.length > 0 && <LedgerSection title="One-time payments" subtotal="Total one-time" note="Paid once, for example a joining bonus. Not part of your CTC." items={oneTime} totals={{ monthly: '', annual: row.summary.oneTimePayments ?? '0' }} money={money} oneTime />}
          {deductions.length > 0 && <LedgerSection {...deductionSection} items={deductions} totals={totalsOf.EMPLOYEE_DEDUCTION} money={money} muted />}
        </table>
      </div>

      <aside aria-label="Package summary" className="order-first rounded-2xl lg:order-none bg-[var(--deep-teal)] p-6 text-white lg:sticky lg:top-8">
        <p className="text-sm text-[#B9D6D3]">Annual cost to company</p>
        <p className="mt-2 font-[family-name:var(--font-manrope)] text-[2rem] font-bold leading-none tracking-[-0.03em]">{money(row.summary.annualCtc)}</p>
        <p className="mt-2 text-sm text-[#B9D6D3]">{money(row.summary.monthlyCtc)} per month</p>

        <div className="mt-7" role="img" aria-label={`Gross pay is ${Math.round((gross / ctc) * 100)} percent of CTC; employer contributions are ${Math.round((employer / ctc) * 100)} percent.`}>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            <span className="band-reveal block h-full rounded-l-full bg-[#92DCCB]" style={{ width: `${(gross / ctc) * 100}%` }} />
            {employer > 0 && <span className="band-reveal block h-full rounded-r-full bg-[#4FB3A3]" style={{ width: `${(employer / ctc) * 100}%`, animationDelay: '120ms' }} />}
          </div>
        </div>
        <p className="mt-5 text-xs text-[#9FC6C2]">Monthly split of your CTC</p>
        <dl className="mt-2.5 space-y-2.5 text-sm">
          <SummaryRow swatch="bg-[#92DCCB]" label="Gross pay" value={money(row.summary.monthlyGross)} share={gross / ctc} />
          <SummaryRow swatch="bg-[#4FB3A3]" label="Employer contributions" value={money(row.summary.monthlyEmployerContributions)} share={employer / ctc} />
        </dl>
        {oneTime.length > 0 && <div className="mt-6 flex items-baseline justify-between gap-3 border-t border-white/15 pt-5 text-sm"><span className="text-[#B9D6D3]">One-time payments</span><span className="font-semibold">{money(row.summary.oneTimePayments ?? '0')}</span></div>}
        {deductions.length > 0 && <div className="mt-6 border-t border-white/15 pt-5 text-sm">
          <div className="flex items-baseline justify-between gap-3"><dt className="text-[#B9D6D3]">Monthly deductions</dt><dd className="font-semibold">−{money(row.summary.monthlyEmployeeDeductions)}</dd></div>
          <p className="mt-2 text-xs leading-relaxed text-[#B9D6D3]">Withheld from gross pay. Taxes are not included in this statement.</p>
        </div>}
      </aside>
    </div>
  </section>;
}

function SummaryRow({ swatch, label, value, share }: { swatch: string; label: string; value: string; share: number }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2.5">
    <span aria-hidden="true" className={`size-2 translate-y-[-1px] rounded-full ${swatch}`} />
    <dt className="text-[#D5E8E5]">{label} <span className="whitespace-nowrap text-xs text-[#9FC6C2]">{Math.round(share * 100)}%</span></dt>
    <dd className="whitespace-nowrap font-semibold">{value}</dd>
  </div>;
}

function LedgerSection({ title, subtotal, note, items, totals, money, muted, oneTime }: { title: string; subtotal: string; note?: string; items: Item[]; totals: { monthly: string; annual: string }; money: (value: string) => string; muted?: boolean; oneTime?: boolean }) {
  if (!items.length) return null;
  const sign = muted ? '−' : '';
  return <tbody className={muted || oneTime ? 'bg-[#FAFCFB]' : undefined}>
    <tr>
      <th scope="colgroup" colSpan={4} className="px-5 pb-2 pt-6 sm:px-6">
        <span className="font-[family-name:var(--font-manrope)] text-[15px] font-semibold text-[var(--charcoal)]">{title}</span>
        {note && <span className="mt-1 block max-w-[60ch] text-xs font-normal leading-relaxed text-[var(--muted-text)]">{note}</span>}
      </th>
    </tr>
    {items.map((item) => <tr key={item.id} className="transition-colors hover:bg-[#F4F8F7]">
      <th scope="row" className="px-5 py-2.5 font-normal sm:px-6">
        <span className="text-[var(--charcoal)]">{item.definition.name}</span>
        <span className="mt-0.5 block text-xs text-[var(--muted-text)] md:hidden">{basis(item)}</span>
      </th>
      <td className="hidden px-3 py-2.5 text-[var(--muted-text)] md:table-cell">{basis(item)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right text-[var(--charcoal)]">{sign}{money(item.resolved_amount ?? item.resolved_monthly_amount)}<span className="text-xs text-[var(--muted-text)]"> {perPayment[item.frequency ?? 'MONTHLY']}</span></td>
      <td className="hidden py-2.5 pl-3 pr-5 text-right text-[var(--muted-text)] sm:table-cell sm:pr-6">{item.frequency === 'ONE_TIME' ? '—' : `${sign}${money(item.annual_amount)}`}</td>
    </tr>)}
    <tr className="border-b border-[var(--rule)] align-top">
      <th scope="row" className="px-5 pb-5 pt-3 font-semibold sm:px-6"><span className="-mr-5 block border-t border-[var(--rule)] pt-3 sm:-mr-6">{subtotal}</span></th>
      <td className="hidden pb-5 pt-3 md:table-cell"><span className="block border-t border-[var(--rule)] pt-3">&nbsp;</span></td>
      <td className="whitespace-nowrap pb-5 pt-3 text-right font-semibold"><span className="block border-t border-[var(--rule)] px-3 pt-3">{oneTime ? `${money(totals.annual)}` : <>{sign}{money(totals.monthly)}<span className="text-xs font-normal text-[var(--muted-text)]"> /mo</span></>}</span></td>
      <td className="hidden pb-5 pr-5 pt-3 text-right font-semibold sm:table-cell sm:pr-6"><span className="block border-t border-[var(--rule)] pl-3 pt-3">{oneTime ? '—' : `${sign}${money(totals.annual)}`}</span></td>
    </tr>
  </tbody>;
}

function History({ rows }: { rows: OwnPackage[] }) {
  return <section aria-labelledby="package-history" className="mt-14">
    <h2 id="package-history" className="font-[family-name:var(--font-manrope)] text-xl font-semibold tracking-[-0.02em]">Previous packages</h2>
    <ul className="mt-4 divide-y divide-[var(--rule)] overflow-hidden rounded-2xl border border-[var(--rule)] bg-white">
      {rows.map((row) => <HistoryRow key={row.id} row={row} />)}
    </ul>
  </section>;
}

function HistoryRow({ row }: { row: OwnPackage }) {
  const money = useMoney(row.currency);
  return <li>
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 hover:bg-[#F7FAF9] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--deep-teal)] sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex-1 text-sm"><span className="font-medium text-[var(--charcoal)]">{period(row)}</span></span>
        <span className="text-right text-sm"><span className="font-semibold">{money(row.summary.annualCtc)}</span><span className="text-[var(--muted-text)]"> / year</span></span>
        <IconChevronDown aria-hidden="true" size={18} stroke={1.75} className="text-[var(--muted-text)] transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <dl className="grid gap-x-8 gap-y-2 border-t border-[var(--rule)] bg-[#FAFCFB] px-5 py-4 text-sm sm:grid-cols-2 sm:px-6">
        {row.items.map((item) => <div key={item.id} className="flex justify-between gap-4"><dt className="text-[var(--muted-text)]">{item.definition.name}</dt><dd>{item.definition.category === 'EMPLOYEE_DEDUCTION' ? '−' : ''}{money(item.resolved_amount ?? item.resolved_monthly_amount)}<span className="text-xs text-[var(--muted-text)]"> {perPayment[item.frequency ?? 'MONTHLY']}</span></dd></div>)}
      </dl>
    </details>
  </li>;
}

function NoPackage() {
  return <div className="max-w-xl rounded-2xl border border-[var(--rule)] bg-white p-8">
    <h2 className="font-[family-name:var(--font-manrope)] text-lg font-semibold">Your package hasn&apos;t been published yet</h2>
    <p className="mt-2 text-sm leading-relaxed text-[var(--muted-text)]">When HR applies your compensation, the full breakdown appears here: each component, how it&apos;s calculated, and your annual cost to company.</p>
  </div>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="flex max-w-xl gap-4 rounded-2xl border border-[#F0C9C4] bg-[#FDF6F5] p-6">
    <IconAlertCircle aria-hidden="true" size={22} stroke={1.75} className="mt-0.5 shrink-0 text-[#A33A2C]" />
    <div>
      <p className="font-semibold text-[#7A2A20]">We couldn&apos;t load your compensation</p>
      <p className="mt-1 text-sm text-[#7A2A20]">{message}. Check your connection and try again.</p>
      <button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#E2B3AC] bg-white px-3.5 py-2 text-sm font-semibold text-[#7A2A20] hover:bg-[#FBEDEB] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A33A2C]"><IconRefresh aria-hidden="true" size={16} stroke={1.75} />Try again</button>
    </div>
  </div>;
}

function StatementSkeleton() {
  const block = 'rounded-md bg-[#E3ECEA] motion-safe:animate-pulse';
  return <div aria-busy="true" aria-label="Loading your compensation">
    <div className={`${block} h-6 w-44`} />
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4 rounded-2xl border border-[var(--rule)] bg-white p-6">{Array.from({ length: 7 }, (_, index) => <div key={index} className="flex justify-between gap-6"><div className={`${block} h-4 w-40`} /><div className={`${block} h-4 w-24`} /></div>)}</div>
      <div className="h-72 rounded-2xl bg-[#D6E5E2] motion-safe:animate-pulse" />
    </div>
  </div>;
}
