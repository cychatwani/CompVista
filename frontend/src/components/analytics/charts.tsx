'use client';

import Link from 'next/link';
import { useState } from 'react';
import { IconArrowRight, IconClock, IconCoins } from '@tabler/icons-react';
import { Flag } from '@/components/flag';
import type { Currency } from '@/components/compensation/api';
import { count, directoryHref, money, percent, shortMoney, type Analytics, type Filters } from './data';
import { Empty, Kpi, Panel, Tip } from './ui';

type SetFilters = (change: Partial<Filters>) => void;
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const currencyOf = (data: Analytics, code: string): Currency | undefined => data.native.find((row) => row.currency.code === code)?.currency ?? data.options.currencies.find((row) => row.code === code);
const segmented = 'inline-flex rounded-lg bg-[#E8F0EE] p-0.5 text-xs font-semibold';
const segment = (on: boolean) => `rounded-md px-2.5 py-1 focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)] ${on ? 'bg-white text-[var(--deep-teal)] shadow-sm' : 'text-[var(--muted-text)] hover:text-[var(--charcoal)]'}`;

export function KpiRow({ data }: { data: Analytics }) {
  const { money: totals, currency } = data;
  const coverage = percent(data.covered, data.headcount);
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
    {totals && currency ? <>
      <div className="sm:col-span-2 xl:col-span-2"><Kpi tone="accent" label={`Total annual CTC · ${currency.code}`} value={shortMoney(totals.total, currency)} title={money(totals.total, currency)} detail={<>{money(totals.total, currency)} across {count(totals.employees)} packages</>} /></div>
      <Kpi label="Average CTC" value={shortMoney(totals.average, currency)} title={money(totals.average, currency)} detail={totals.min && totals.max ? <>Range {shortMoney(totals.min, currency)}–{shortMoney(totals.max, currency)}</> : undefined} />
      <Kpi label="Median CTC" value={shortMoney(totals.median, currency)} title={money(totals.median, currency)} detail="Half of employees earn more" />
    </> : <div className="sm:col-span-2 xl:col-span-4"><NativeTotals data={data} /></div>}
    <Kpi label="Headcount" value={count(data.headcount)} detail={data.covered === data.headcount ? 'All with active pay' : <>{count(data.covered)} with active pay · {coverage}</>} />
    <Kpi tone={data.approvals.pending ? 'attention' : 'default'} label="Pending approvals" value={count(data.approvals.pending)} detail={data.approvals.pending ? <Link href="/app/approvals" className="font-semibold text-[#7A5512] underline-offset-4 hover:underline">Review requests</Link> : 'Nothing waiting'} />
  </div>;
}

/** Mixed currencies: one total per currency, never combined, with a prompt to pick one. */
function NativeTotals({ data }: { data: Analytics }) {
  return <div className="flex h-full flex-col rounded-2xl border border-[var(--rule)] bg-white p-5 shadow-[0_1px_2px_rgba(15,76,92,.04)]">
    <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--muted-text)]"><IconCoins aria-hidden="true" size={16} stroke={1.75} />Annual CTC by currency</p>
    {data.native.length ? <ul className="mt-3 grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {data.native.map((row) => <li key={row.currency.code} className="min-w-0">
        <p className="truncate font-[family-name:var(--font-manrope)] text-lg font-semibold tabular-nums tracking-[-0.02em]" title={money(row.annualCtc, row.currency)}>{shortMoney(row.annualCtc, row.currency)}</p>
        <p className="text-xs text-[var(--muted-text)]">{row.currency.code} · {count(row.employees)} packages</p>
      </li>)}
    </ul> : <p className="mt-3 text-sm text-[var(--muted-text)]">No active packages in this selection.</p>}
    {data.requiresCurrency && <p className="mt-3 border-t border-[var(--rule)] pt-3 text-[13px] text-[var(--muted-text)]">Totals stay in their own currency. Choose a currency to compare averages, medians, and spend.</p>}
  </div>;
}

export function CurrencyPrompt({ data, set }: { data: Analytics; set: SetFilters }) {
  if (!data.requiresCurrency) return null;
  return <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-[#CFE3DE] bg-[#F1F8F6] px-4 py-3 text-sm text-[#1D5E55]">
    <span className="flex-1">This selection has packages in {data.native.length} currencies. Pick one for monetary comparisons. Amounts are never converted.</span>
    <span className="flex flex-wrap gap-1.5">{data.native.map((row) => <button key={row.currency.code} type="button" onClick={() => set({ currency: row.currency.code })} className="rounded-md border border-[#B9D7D0] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--deep-teal)] hover:border-[var(--deep-teal)] focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)]">{row.currency.code}</button>)}</span>
  </div>;
}

export function DepartmentChart({ data, filters, set }: { data: Analytics; filters: Filters; set: SetFilters }) {
  const monetary = !!data.currency && !!data.money;
  const [sort, setSort] = useState<'spend' | 'people'>('spend');
  const rows = [...data.departments].sort((a, b) => monetary && sort === 'spend' ? Number(b.annualCtc) - Number(a.annualCtc) : b.headcount - a.headcount);
  const max = Math.max(...rows.map((row) => monetary && sort === 'spend' ? Number(row.annualCtc) : row.headcount), 1);
  const total = Number(data.money?.total ?? 0);
  const headcount = rows.reduce((sum, row) => sum + row.headcount, 0);
  return <Panel title="Compensation by department" description={monetary ? `Annual CTC in ${data.currency!.code}. Select a department to filter.` : 'Headcount and package coverage. Choose a currency to see spend.'}
    action={monetary && <div className={segmented} role="group" aria-label="Sort departments">{(['spend', 'people'] as const).map((value) => <button key={value} type="button" aria-pressed={sort === value} onClick={() => setSort(value)} className={segment(sort === value)}>{value === 'spend' ? 'By spend' : 'By headcount'}</button>)}</div>}>
    {rows.length ? <ul className="space-y-1">
      {rows.map((row) => {
        const value = monetary && sort === 'spend' ? Number(row.annualCtc) : row.headcount;
        const selected = filters.department === row.id;
        const dimmed = !!filters.department && !selected;
        const share = monetary ? percent(Number(row.annualCtc), total) : percent(row.headcount, headcount);
        const label = monetary ? `${row.name}: ${money(row.annualCtc, data.currency)} annual CTC, ${count(row.employees)} packages, ${share} of ${data.currency!.code} spend` : `${row.name}: ${count(row.headcount)} people, ${count(row.employees)} with packages`;
        return <li key={row.id ?? 'none'}>
          <button type="button" disabled={!row.id} aria-pressed={selected} aria-label={label} onClick={() => row.id && set({ department: selected ? '' : row.id })}
            className={`group relative grid w-full grid-cols-[minmax(5.5rem,9.5rem)_minmax(3rem,1fr)_auto] items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-[#F2F7F6] focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)] ${dimmed ? 'opacity-55 hover:opacity-100' : ''}`}>
            <span className={`truncate ${selected ? 'font-semibold text-[var(--deep-teal)]' : 'text-[var(--charcoal)]'}`}>{row.name}</span>
            <span className="h-5 overflow-hidden rounded-[5px] bg-[#EEF4F3]"><span className={`block h-full rounded-[5px] ${selected ? 'bg-[var(--deep-teal)]' : 'bg-[var(--teal)] group-hover:bg-[var(--deep-teal)]'}`} style={{ width: `${Math.max(1.5, (value / max) * 100)}%` }} /></span>
            <span className="text-right tabular-nums sm:w-40">
              <span className="font-semibold text-[var(--charcoal)]">{monetary ? shortMoney(row.annualCtc, data.currency) : count(row.headcount)}</span>
              <span className="ml-1.5 text-xs text-[var(--muted-text)]">{monetary ? `${count(row.employees)} · ${share}` : `${share}`}</span>
            </span>
            <Tip align="start">
              <span className="block font-semibold">{row.name}</span>
              {monetary && <span className="block">{money(row.annualCtc, data.currency)} annual CTC · {share} of spend</span>}
              {monetary && row.employees > 0 && <span className="block">Average {money(Number(row.annualCtc) / row.employees, data.currency)}</span>}
              <span className="block">{count(row.headcount)} people · {count(row.employees)} {monetary ? `${data.currency!.code} packages` : 'with packages'}</span>
            </Tip>
          </button>
        </li>;
      })}
    </ul> : <Empty title="No departments yet" />}
  </Panel>;
}

export function CountryChart({ data, filters, set }: { data: Analytics; filters: Filters; set: SetFilters }) {
  const headcount = data.countries.reduce((sum, row) => sum + row.headcount, 0);
  const max = Math.max(...data.countries.map((row) => row.headcount), 1);
  return <Panel title="Compensation by country" description="Headcount share and native annual CTC. Currencies are shown separately, never combined.">
    {data.countries.length ? <ul className="divide-y divide-[var(--rule)]">
      {data.countries.map((row) => {
        const selected = filters.country === row.code;
        return <li key={row.code}>
          <button type="button" aria-pressed={selected} onClick={() => set({ country: selected ? '' : row.code })}
            className={`group w-full rounded-lg px-2 py-3 text-left transition-colors hover:bg-[#F2F7F6] focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)] ${filters.country && !selected ? 'opacity-55 hover:opacity-100' : ''}`}>
            <span className="flex items-center gap-2.5 text-sm">
              <Flag code={row.code} className="text-base" />
              <span className={`flex-1 truncate ${selected ? 'font-semibold text-[var(--deep-teal)]' : 'font-medium text-[var(--charcoal)]'}`}>{row.name}</span>
              <span className="tabular-nums font-semibold text-[var(--charcoal)]">{count(row.headcount)}</span>
              <span className="w-12 text-right text-xs tabular-nums text-[var(--muted-text)]">{percent(row.headcount, headcount)}</span>
            </span>
            <span className="mt-2 flex items-center gap-3 pl-[calc(1.3125rem+0.625rem)]">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF4F3]"><span className={`block h-full rounded-full ${selected ? 'bg-[var(--deep-teal)]' : 'bg-[var(--jade)]'}`} style={{ width: `${(row.headcount / max) * 100}%` }} /></span>
              <span className="flex flex-wrap justify-end gap-x-3 text-xs tabular-nums text-[var(--muted-text)]">
                {row.totals.length ? row.totals.map((total) => <span key={total.currency} title={`${money(total.annualCtc, currencyOf(data, total.currency))} · ${count(total.employees)} packages`}><span className="font-semibold text-[var(--charcoal)]">{shortMoney(total.annualCtc, currencyOf(data, total.currency))}</span> {total.currency}</span>) : <span>No packages</span>}
              </span>
            </span>
          </button>
        </li>;
      })}
    </ul> : <Empty title="No people match these filters" />}
  </Panel>;
}

export function DistributionChart({ data, filters }: { data: Analytics; filters: Filters }) {
  const currency = data.currency;
  const distribution = data.distribution;
  const peak = Math.max(...(distribution?.bands.map((band) => band.employees) ?? [1]), 1);
  const every = distribution ? Math.ceil(distribution.bands.length / 6) : 1;
  return <Panel title="Annual CTC distribution" description={currency ? `Employees per ${shortMoney(distribution?.step ?? 0, currency)} band, ${currency.code}. Select a band to see those people.` : 'Salary bands need a single currency.'}>
    {!currency ? <Empty title="Choose a currency to see salary bands">Bands compare amounts, so they only use one currency at a time.</Empty>
      : !distribution ? <Empty title={`No ${currency.code} packages match these filters`} />
      : <div className="flex flex-1 flex-col">
        <div className="relative flex h-52 items-end gap-1 border-b border-[var(--rule)]" role="list" aria-label="Employees per salary band">
          {[0.5, 1].map((line) => <span key={line} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#E3ECEA]" style={{ bottom: `${line * 100}%` }}><span className="absolute -top-2.5 right-0 bg-white pl-1 text-[10px] tabular-nums text-[var(--muted-text)]">{count(Math.round(peak * line))}</span></span>)}
          {distribution.bands.map((band, index) => {
            const range = `${money(band.from, currency)} – ${money(band.to, currency)}`;
            return <div key={band.from} role="listitem" className="relative flex h-full flex-1 items-end">
              <Link href={directoryHref({ ...filters, currency: currency.code, ctcMin: String(band.from), ctcMax: String(band.to), status: 'active' })}
                aria-label={`${range}: ${count(band.employees)} employees`}
                className="group relative flex h-full w-full items-end focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]">
                <span className={`block w-full rounded-t-[4px] transition-colors ${band.employees ? 'bg-[var(--jade)] group-hover:bg-[var(--deep-teal)]' : ''}`} style={{ height: band.employees ? `${Math.max(1.5, (band.employees / peak) * 100)}%` : 0 }} />
                <Tip align={index < 2 ? 'start' : index > distribution.bands.length - 3 ? 'end' : 'center'}><span className="block font-semibold">{count(band.employees)} employees</span><span className="block">{range}</span></Tip>
              </Link>
            </div>;
          })}
        </div>
        <div className="mt-2 flex gap-1 text-[10px] tabular-nums text-[var(--muted-text)]" aria-hidden="true">
          {distribution.bands.map((band, index) => <span key={band.from} className="flex-1 truncate">{index % every === 0 ? shortMoney(band.from, currency) : ''}</span>)}
        </div>
        <p className="mt-3 text-xs text-[var(--muted-text)]">Each band includes its lower bound and excludes its upper bound.</p>
      </div>}
  </Panel>;
}

export function ApprovalsPanel({ data }: { data: Analytics }) {
  const { approvals } = data;
  const peak = Math.max(...approvals.ages.map((age) => age.requests), 1);
  return <Panel title="Approvals needing attention" description="Pending compensation changes in this selection."
    action={<Link href="/app/approvals" className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--deep-teal)] underline-offset-4 hover:underline">Open approvals<IconArrowRight aria-hidden="true" size={15} stroke={1.75} /></Link>}>
    <div className="flex items-baseline gap-2"><span className="font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-[-0.03em] tabular-nums">{count(approvals.pending)}</span><span className="text-sm text-[var(--muted-text)]">waiting</span></div>
    {approvals.pending > 0 ? <>
      <ul className="mt-4 space-y-2" aria-label="Pending requests by age">
        {approvals.ages.map((age) => <li key={age.key} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-3 text-xs">
          <span className="text-[var(--muted-text)]">{age.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-[#F5EEDF]"><span className={`block h-full rounded-full ${age.key === 'older' ? 'bg-[#C2410C]' : 'bg-[#D69E2E]'}`} style={{ width: `${(age.requests / peak) * 100}%` }} /></span>
          <span className="text-right font-semibold tabular-nums">{age.requests}</span>
        </li>)}
      </ul>
      <ul className="mt-5 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
        {approvals.recent.map((request) => {
          const currency = currencyOf(data, request.currencyCode) ?? { code: request.currencyCode, name: request.currencyCode, symbol: '', decimal_places: 2 };
          return <li key={request.id} className="flex items-center gap-3 py-2.5 text-sm">
            <Flag code={request.employee.countryCode} />
            <Link href={`/app/employees/${request.employee.id}/compensation`} className="min-w-0 flex-1 truncate font-medium text-[var(--charcoal)] underline-offset-4 hover:text-[var(--deep-teal)] hover:underline">{request.employee.displayName}</Link>
            <span className="tabular-nums text-[var(--charcoal)]" title={money(request.annualCtc, currency)}>{shortMoney(request.annualCtc, currency)}</span>
            <span className="flex w-16 items-center justify-end gap-1 text-xs text-[var(--muted-text)]"><IconClock aria-hidden="true" size={13} stroke={1.75} />{request.submittedAt ? dateFormat.format(new Date(request.submittedAt)) : '—'}</span>
          </li>;
        })}
      </ul>
    </> : <p className="mt-3 text-sm text-[var(--muted-text)]">Nothing is waiting for a decision.</p>}
  </Panel>;
}

export function CompositionChart({ data }: { data: Analytics }) {
  const { currency, money: totals, components } = data;
  if (!currency || !totals || !components) return <Panel title="Cost composition" description="What makes up annual CTC."><Empty title="Choose a currency to see cost composition" /></Panel>;
  const total = Number(totals.total);
  const groups = [
    { key: 'EARNING', label: 'Gross earnings', amount: totals.gross, color: 'bg-[var(--deep-teal)]', dot: 'bg-[var(--deep-teal)]' },
    { key: 'EMPLOYER_CONTRIBUTION', label: 'Employer contributions', amount: totals.employer, color: 'bg-[var(--jade)]', dot: 'bg-[var(--jade)]' },
  ] as const;
  const deductions = components.filter((row) => row.category === 'EMPLOYEE_DEDUCTION');
  const largest = Math.max(...components.filter((row) => row.category !== 'EMPLOYEE_DEDUCTION').map((row) => Number(row.annual)), 1);
  return <Panel title="Cost composition" description={`Annual CTC = gross earnings + employer contributions, ${currency.code}. Employee deductions are paid out of gross and listed separately.`}>
    <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={groups.map((group) => `${group.label} ${percent(Number(group.amount), total)}`).join(', ')}>
      {groups.map((group) => <span key={group.key} className={group.color} style={{ width: `${(Number(group.amount) / (total || 1)) * 100}%` }} />)}
    </div>
    <dl className="mt-4 grid gap-4 sm:grid-cols-3">
      {groups.map((group) => <div key={group.key}><dt className="flex items-center gap-2 text-xs text-[var(--muted-text)]"><span aria-hidden="true" className={`size-2.5 rounded-sm ${group.dot}`} />{group.label}</dt><dd className="mt-1 font-[family-name:var(--font-manrope)] text-lg font-semibold tabular-nums" title={money(group.amount, currency)}>{shortMoney(group.amount, currency)} <span className="text-xs font-normal text-[var(--muted-text)]">{percent(Number(group.amount), total)}</span></dd></div>)}
      <div><dt className="flex items-center gap-2 text-xs text-[var(--muted-text)]"><span aria-hidden="true" className="size-2.5 rounded-sm border border-[#C8483A]" />Employee deductions (not CTC)</dt><dd className="mt-1 font-[family-name:var(--font-manrope)] text-lg font-semibold tabular-nums text-[#9A3A2D]" title={money(totals.deductions, currency)}>{shortMoney(totals.deductions, currency)}</dd></div>
    </dl>
    <table className="mt-6 w-full text-left text-sm">
      <caption className="sr-only">Annual cost by component</caption>
      <thead><tr className="border-b border-[var(--rule)] text-xs text-[var(--muted-text)]"><th scope="col" className="py-2 font-medium">Component</th><th scope="col" className="hidden py-2 font-medium sm:table-cell">Share of CTC</th><th scope="col" className="py-2 text-right font-medium">People</th><th scope="col" className="py-2 text-right font-medium">Annual</th></tr></thead>
      <tbody className="divide-y divide-[var(--rule)]">
        {components.filter((row) => row.category !== 'EMPLOYEE_DEDUCTION').map((row) => <tr key={row.id}>
          <td className="py-2.5"><span className="flex items-center gap-2"><span aria-hidden="true" className={`size-2 rounded-sm ${row.category === 'EARNING' ? 'bg-[var(--deep-teal)]' : 'bg-[var(--jade)]'}`} />{row.name}</span>{Number(row.oneTime) > 0 && <span className="ml-4 block text-xs text-[var(--muted-text)]">+ {shortMoney(row.oneTime, currency)} one-time, outside CTC</span>}</td>
          <td className="hidden w-2/5 py-2.5 pr-6 sm:table-cell"><span className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF4F3]"><span className={`block h-full rounded-full ${row.category === 'EARNING' ? 'bg-[var(--deep-teal)]' : 'bg-[var(--jade)]'}`} style={{ width: `${(Number(row.annual) / largest) * 100}%` }} /></span><span className="w-10 text-right text-xs tabular-nums text-[var(--muted-text)]">{percent(Number(row.annual), total)}</span></span></td>
          <td className="py-2.5 text-right tabular-nums text-[var(--muted-text)]">{count(row.employees)}</td>
          <td className="py-2.5 text-right font-semibold tabular-nums" title={money(row.annual, currency)}>{shortMoney(row.annual, currency)}</td>
        </tr>)}
      </tbody>
      {deductions.length > 0 && <tbody className="divide-y divide-[var(--rule)] border-t-2 border-[var(--rule)]">
        <tr><th scope="rowgroup" colSpan={4} className="pb-1 pt-4 text-xs font-semibold text-[var(--muted-text)]">Employee deductions · withheld from gross, not added to CTC</th></tr>
        {deductions.map((row) => <tr key={row.id} className="text-[var(--muted-text)]">
          <td className="py-2.5"><span className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-sm border border-[#C8483A]" />{row.name}</span></td>
          <td className="hidden sm:table-cell" /><td className="py-2.5 text-right tabular-nums">{count(row.employees)}</td>
          <td className="py-2.5 text-right tabular-nums text-[#9A3A2D]" title={money(row.annual, currency)}>−{shortMoney(row.annual, currency)}</td>
        </tr>)}
      </tbody>}
    </table>
  </Panel>;
}

export function Matrix({ data, filters, set }: { data: Analytics; filters: Filters; set: SetFilters }) {
  const headcountOf = (code: string) => data.matrix.filter((item) => item.countryCode === code).reduce((sum, item) => sum + item.headcount, 0);
  const countries = data.options.countries.filter((country) => headcountOf(country.code) > 0).sort((a, b) => headcountOf(b.code) - headcountOf(a.code));
  const departments = [...data.options.departments.filter((department) => data.matrix.some((cell) => cell.departmentId === department.id)), ...(data.matrix.some((cell) => !cell.departmentId) ? [{ id: '', name: 'Unassigned', code: '', isActive: true }] : [])];
  const cell = (department: string, country: string) => data.matrix.find((item) => (item.departmentId ?? '') === department && item.countryCode === country);
  const peak = Math.max(...data.matrix.map((item) => item.headcount), 1);
  const showAverage = !!data.currency;
  return <Panel title="Department × country" description={showAverage ? `Headcount, with average annual CTC of ${data.currency!.code} packages. Select a cell to filter by both.` : 'Headcount across the whole organization. Choose a currency to add average CTC. Select a cell to filter by both.'}>
    {data.matrix.length ? <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
        <caption className="sr-only">Headcount by department and country</caption>
        <thead><tr><th scope="col" className="w-40 text-left text-xs font-medium text-[var(--muted-text)]"><span className="sr-only">Department</span></th>
          {countries.map((country) => <th key={country.code} scope="col" className="px-1 pb-1 text-xs font-medium text-[var(--muted-text)]"><span className="inline-flex items-center gap-1.5"><Flag code={country.code} />{country.code}</span></th>)}
          <th scope="col" className="px-1 pb-1 text-right text-xs font-semibold text-[var(--charcoal)]">Total</th></tr></thead>
        <tbody>
          {departments.map((department) => {
            const rowTotal = data.matrix.filter((item) => (item.departmentId ?? '') === department.id).reduce((sum, item) => sum + item.headcount, 0);
            return <tr key={department.id || 'none'}>
              <th scope="row" className={`truncate pr-2 text-left text-[13px] font-medium ${filters.department === department.id ? 'text-[var(--deep-teal)]' : 'text-[var(--charcoal)]'}`}>{department.name}</th>
              {countries.map((country) => {
                const item = cell(department.id, country.code);
                const selected = filters.department === department.id && filters.country === country.code;
                const inSelection = (!filters.department || filters.department === department.id) && (!filters.country || filters.country === country.code);
                const intensity = item ? item.headcount / peak : 0;
                const dark = intensity > 0.55;
                return <td key={country.code} className="p-0">
                  <button type="button" disabled={!item || !department.id} aria-pressed={selected}
                    aria-label={`${department.name} in ${country.name}: ${count(item?.headcount ?? 0)} people${showAverage && item?.averageCtc ? `, average ${money(item.averageCtc, data.currency)}` : ''}`}
                    onClick={() => set(selected ? { department: '', country: '' } : { department: department.id, country: country.code })}
                    className={`group relative flex h-14 w-full flex-col items-center justify-center rounded-lg text-center transition-[opacity,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--deep-teal)] disabled:cursor-default ${selected ? 'ring-2 ring-[var(--charcoal)] ring-offset-1' : ''} ${inSelection ? '' : 'opacity-35 hover:opacity-100'}`}
                    style={{ backgroundColor: item ? `color-mix(in oklab, var(--deep-teal) ${Math.round(8 + intensity * 84)}%, white)` : '#F7FAF9' }}>
                    <span className={`font-semibold tabular-nums ${dark ? 'text-white' : 'text-[var(--charcoal)]'}`}>{item ? count(item.headcount) : '—'}</span>
                    {showAverage && item?.averageCtc && <span className={`text-[11px] tabular-nums ${dark ? 'text-[#D6ECE7]' : 'text-[var(--muted-text)]'}`}>{shortMoney(item.averageCtc, data.currency)}</span>}
                    {item && <Tip><span className="block font-semibold">{department.name} · {country.name}</span><span className="block">{count(item.headcount)} people · {count(item.employees)} {showAverage ? `${data.currency!.code} packages` : 'with packages'}</span>{showAverage && item.averageCtc && <span className="block">Average {money(item.averageCtc, data.currency)}</span>}</Tip>}
                  </button>
                </td>;
              })}
              <td className="pl-2 text-right text-[13px] font-semibold tabular-nums">{count(rowTotal)}</td>
            </tr>;
          })}
        </tbody>
      </table>
    </div> : <Empty title="No people yet" />}
  </Panel>;
}

export function DepartmentTable({ data, filters }: { data: Analytics; filters: Filters }) {
  const currency = data.currency;
  const total = Number(data.money?.total ?? 0);
  const rows = [...data.departments].sort((a, b) => currency ? Number(b.annualCtc) - Number(a.annualCtc) : b.headcount - a.headcount);
  return <Panel title="Department comparison" description={currency ? `Spend, coverage, and average annual CTC per ${currency.code} package.` : 'Headcount and coverage. Choose a currency to compare spend.'}>
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead><tr className="border-b border-[var(--rule)] text-xs text-[var(--muted-text)]">
          <th scope="col" className="py-2 font-medium">Department</th><th scope="col" className="py-2 text-right font-medium">Headcount</th>
          <th scope="col" className="py-2 text-right font-medium">{currency ? `${currency.code} packages` : 'With packages'}</th>
          {currency && <><th scope="col" className="py-2 text-right font-medium">Annual CTC</th><th scope="col" className="py-2 text-right font-medium">Average</th><th scope="col" className="py-2 text-right font-medium">Share</th></>}
          <th scope="col" className="w-8"><span className="sr-only">People</span></th>
        </tr></thead>
        <tbody className="divide-y divide-[var(--rule)]">
          {rows.map((row) => <tr key={row.id ?? 'none'} className={filters.department === row.id ? 'bg-[#F2F7F6]' : ''}>
            <td className="py-2.5 font-medium">{row.name}</td>
            <td className="py-2.5 text-right tabular-nums">{count(row.headcount)}</td>
            <td className="py-2.5 text-right tabular-nums text-[var(--muted-text)]">{count(row.employees)}</td>
            {currency && <>
              <td className="py-2.5 text-right font-semibold tabular-nums" title={money(row.annualCtc, currency)}>{shortMoney(row.annualCtc, currency)}</td>
              <td className="py-2.5 text-right tabular-nums" title={row.employees ? money(Number(row.annualCtc) / row.employees, currency) : undefined}>{row.employees ? shortMoney(Number(row.annualCtc) / row.employees, currency) : '—'}</td>
              <td className="py-2.5 text-right tabular-nums text-[var(--muted-text)]">{percent(Number(row.annualCtc), total)}</td>
            </>}
            <td className="py-2.5 text-right">{row.id && <Link href={directoryHref({ ...filters, department: row.id })} aria-label={`View people in ${row.name}`} className="inline-grid size-7 place-items-center rounded-md text-[var(--muted-text)] hover:bg-[#E6EFED] hover:text-[var(--deep-teal)]"><IconArrowRight aria-hidden="true" size={15} stroke={1.75} /></Link>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </Panel>;
}
