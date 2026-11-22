'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { IconAlertCircle, IconBuilding, IconChevronLeft, IconChevronRight, IconSearch, IconSettings, IconX } from '@tabler/icons-react';
import SidebarDemo from '@/components/sidebar-demo';
import { Flag } from '@/components/flag';
import { Picker } from '@/components/analytics/ui';
import { domain, formatMoney, type Currency } from './api';

type Row = { id: string; displayName: string; email: string | null; employeeCode: string | null; jobTitle: string | null; role: string | null; country: { code: string; name: string }; department: { id: string; name: string } | null; drafts: number; pending: number; upcoming: boolean; active: { currency: Currency; effectiveFrom: string; annualCtc: string; monthlyGross: string } | null };
type Page = { items: Row[]; page: number; pageSize: number; total: number; pages: number; counts: { all: number; active: number; none: number; draft: number; pending: number } };

const roleLabel: Record<string, string> = { admin: 'Admin', hr: 'HR', employee: 'Employee' };
const statusTabs = [
  { value: '', label: 'All', count: 'all' },
  { value: 'active', label: 'Active', count: 'active' },
  { value: 'none', label: 'No package', count: 'none' },
  { value: 'pending', label: 'Pending approval', count: 'pending' },
  { value: 'draft', label: 'Has drafts', count: 'draft' },
] as const;
const control = 'h-10 rounded-lg border border-[#B7CAC7] bg-white px-3 text-sm text-[var(--charcoal)] outline-none focus-visible:border-[var(--deep-teal)] focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)]';
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('');
}

function pageList(current: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  const around = [current - 1, current, current + 1].filter((page) => page > 1 && page < pages);
  return [1, ...(around[0]! > 2 ? ['…' as const] : []), ...around, ...(around[around.length - 1]! < pages - 1 ? ['…' as const] : []), pages];
}

export function CompensationDirectory() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = useMemo(() => ({
    q: params.get('q') ?? '', status: params.get('status') ?? '', role: params.get('role') ?? '',
    sort: params.get('sort') ?? 'name', page: Number(params.get('page') ?? '1') || 1, pageSize: Number(params.get('pageSize') ?? '10') || 10,
    department: params.get('department') ?? '', country: params.get('country') ?? '', currency: params.get('currency') ?? '', ctcMin: params.get('ctcMin') ?? '', ctcMax: params.get('ctcMax') ?? '',
  }), [params]);
  const [options, setOptions] = useState<{ departments: { id: string; name: string; is_active: boolean }[]; countries: { code: string; name: string }[]; currencies: Currency[] }>({ departments: [], countries: [], currencies: [] });
  useEffect(() => {
    Promise.all([domain<{ id: string; name: string; is_active: boolean }[]>('departments'), domain<{ code: string; name: string }[]>('countries'), domain<Currency[]>('currencies')])
      .then(([departments, countries, currencies]) => setOptions({ departments, countries, currencies }))
      .catch(() => undefined);
  }, []);
  const [search, setSearch] = useState(state.q);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  function update(change: Partial<typeof state>) {
    const next = { ...state, page: 1, ...change };
    const query = new URLSearchParams();
    if (next.q) query.set('q', next.q);
    if (next.status) query.set('status', next.status);
    if (next.role) query.set('role', next.role);
    if (next.sort !== 'name') query.set('sort', next.sort);
    if (next.page > 1) query.set('page', String(next.page));
    if (next.pageSize !== 10) query.set('pageSize', String(next.pageSize));
    for (const key of ['department', 'country', 'currency', 'ctcMin', 'ctcMax'] as const) if (next[key]) query.set(key, next[key]);
    router.replace(query.size ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  // Debounce typing into the URL so each keystroke doesn't fire a request.
  useEffect(() => {
    if (search === state.q) return;
    const timeout = setTimeout(() => update({ q: search.trim() }), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams({ page: String(state.page), pageSize: String(state.pageSize), sort: state.sort });
    if (state.q) query.set('q', state.q);
    if (state.status) query.set('status', state.status);
    if (state.role) query.set('role', state.role);
    for (const key of ['department', 'country', 'currency', 'ctcMin', 'ctcMax'] as const) if (state[key]) query.set(key, state[key]);
    queueMicrotask(() => { if (current) setLoading(true); });
    domain<Page>(`employees/directory?${query}`)
      .then((result) => { if (current) { setData(result); setError(''); } })
      .catch((reason: Error) => { if (current) setError(reason.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [state]);

  const filtered = !!(state.q || state.role || state.status || state.department || state.country || state.currency || state.ctcMin || state.ctcMax);
  const rangeCurrency = options.currencies.find((item) => item.code === state.currency);
  const rangeLabel = state.currency && (state.ctcMin || state.ctcMax) ? [state.ctcMin, state.ctcMax].map((value) => value ? formatMoney(String(Math.round(Number(value))), rangeCurrency ? { ...rangeCurrency, decimal_places: 0 } : undefined, state.currency === 'INR' ? 'en-IN' : undefined) : '…').join(' – ') : '';
  const first = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return <SidebarDemo title="Manage compensation" subtitle="Find a person to review, draft, or apply their package.">
    <div className="mt-8 w-full tabular-nums">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter by package status" className="flex flex-wrap gap-1 rounded-xl bg-[#E8F0EE] p-1">
          {statusTabs.map((tab) => {
            const selected = state.status === tab.value;
            return <button key={tab.value} role="tab" aria-selected={selected} type="button" onClick={() => update({ status: tab.value })} className={`flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)] ${selected ? 'bg-white text-[var(--deep-teal)] shadow-[0_1px_2px_rgba(15,76,92,.12)]' : 'text-[var(--muted-text)] hover:text-[var(--deep-teal)]'}`}>
              {tab.label}{data && <span className={`rounded-full px-1.5 text-xs ${selected ? 'bg-[#E3F2EF] text-[var(--deep-teal)]' : 'bg-white/70'}`}>{data.counts[tab.count]}</span>}
            </button>;
          })}
        </div>
        <span className="flex flex-wrap gap-2"><Link href="/app/compensation/departments" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#B7CAC7] bg-white px-4 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]"><IconBuilding aria-hidden="true" size={18} stroke={1.75} />Departments</Link>
        <Link href="/app/compensation/components" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#B7CAC7] bg-white px-4 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]"><IconSettings aria-hidden="true" size={18} stroke={1.75} />Component definitions</Link></span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[16rem] flex-1">
          <span className="sr-only">Search by name, email, code, or title</span>
          <IconSearch aria-hidden="true" size={18} stroke={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)]" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, code, or title" className={`${control} w-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden`} />
          {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(''); update({ q: '' }); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted-text)] hover:text-[var(--deep-teal)]"><IconX aria-hidden="true" size={16} /></button>}
        </label>
        <Picker label="Department" allLabel="All" value={state.department} onChange={(department) => update({ department })} options={[...options.departments.map((item) => ({ value: item.id, label: item.name, hint: item.is_active ? undefined : 'Inactive' })), { value: 'none', label: 'Unassigned' }]} />
        <Picker label="Country" allLabel="All" value={state.country} onChange={(country) => update({ country })} options={options.countries.map((item) => ({ value: item.code, label: item.name, flag: item.code }))} />
        <Picker label="Currency" allLabel="All" value={state.currency} onChange={(currency) => update({ currency, ctcMin: '', ctcMax: '' })} options={options.currencies.map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }))} />
        <label className="flex items-center gap-2 text-sm text-[var(--muted-text)]">Role
          <select value={state.role} onChange={(event) => update({ role: event.target.value })} className={control}><option value="">All roles</option><option value="admin">Admin</option><option value="hr">HR</option><option value="employee">Employee</option></select>
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--muted-text)]">Sort
          <select value={state.sort} onChange={(event) => update({ sort: event.target.value })} className={control}><option value="name">Name (A–Z)</option><option value="ctc-desc">Annual CTC (high to low)</option><option value="ctc-asc">Annual CTC (low to high)</option><option value="effective">Recently effective</option></select>
        </label>
      </div>

      {rangeLabel && <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#B9D7D0] bg-[#F1F8F6] py-1 pl-3 pr-1 text-[var(--deep-teal)]">Annual CTC {rangeLabel}
          <button type="button" aria-label="Remove salary range filter" onClick={() => update({ ctcMin: '', ctcMax: '' })} className="grid size-6 place-items-center rounded-full hover:bg-white"><IconX aria-hidden="true" size={14} stroke={2} /></button></span>
        <span className="text-xs text-[var(--muted-text)]">Lower bound included, upper bound excluded</span>
      </div>}

      {error ? <div role="alert" className="mt-6 flex items-center gap-3 rounded-xl border border-[#F0C9C4] bg-[#FDF6F5] px-5 py-4 text-sm text-[#7A2A20]"><IconAlertCircle aria-hidden="true" size={18} stroke={1.75} />{error}</div> : <div className={`mt-5 overflow-hidden rounded-2xl border border-[var(--rule)] bg-white shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-12px_rgba(15,76,92,.12)] transition-opacity ${loading && data ? 'opacity-60' : ''}`} aria-busy={loading}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">People and their current compensation</caption>
          <thead><tr className="border-b border-[var(--rule)] bg-[#F7FAF9] text-xs text-[var(--muted-text)]">
            <th scope="col" className="px-5 py-3 font-medium">Person</th>
            <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Department</th>
            <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Country</th>
            <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-medium">Annual CTC</th>
            <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Effective since</th>
            <th scope="col" className="hidden px-3 py-3 font-medium sm:table-cell">Status</th>
            <th scope="col" className="w-10 py-3 pr-4"><span className="sr-only">Open</span></th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {!data && loading && Array.from({ length: 6 }, (_, index) => <tr key={index}><td colSpan={7} className="px-5 py-4"><div className="h-8 rounded-md bg-[#EDF3F2] motion-safe:animate-pulse" /></td></tr>)}
            {data?.items.map((row) => {
              const href = `/app/employees/${row.id}/compensation`;
              const locale = row.active?.currency.code === 'INR' ? 'en-IN' : undefined;
              return <tr key={row.id} className="group cursor-pointer hover:bg-[#F4F8F7]" onClick={() => router.push(href)}>
                <td className="w-full max-w-0 px-5 py-3">
                  <Link href={href} onClick={(event) => event.stopPropagation()} className="flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--deep-teal)]">
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#DCEBE8] text-xs font-semibold text-[var(--deep-teal)]">{initials(row.displayName)}</span>
                    <span className="min-w-0"><span className="block truncate font-medium text-[var(--charcoal)] group-hover:text-[var(--deep-teal)]">{row.displayName}</span><span className="block truncate text-xs text-[var(--muted-text)]">{[row.jobTitle, row.employeeCode].filter(Boolean).join(' · ') || row.email}{row.role && row.role !== 'employee' && <span className="ml-1.5 rounded bg-[#E8F0EE] px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--deep-teal)]">{roleLabel[row.role] ?? row.role}</span>}</span></span>
                  </Link>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-[var(--muted-text)] lg:table-cell">{row.department?.name ?? '—'}</td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-[var(--muted-text)] md:table-cell"><span className="inline-flex items-center gap-1.5"><Flag code={row.country.code} />{row.country.name}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[var(--charcoal)]">{row.active ? formatMoney(row.active.annualCtc, row.active.currency, locale) : <span className="font-normal text-[var(--muted-text)]">—</span>}</td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-[var(--muted-text)] lg:table-cell">{row.active ? dateFormat.format(new Date(row.active.effectiveFrom)) : '—'}</td>
                <td className="hidden px-3 py-3 sm:table-cell"><span className="flex flex-wrap gap-1.5">
                  {row.active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">No package</Badge>}
                  {row.pending > 0 && <Badge tone="warn">Pending approval</Badge>}
                  {row.upcoming && <Badge tone="neutral">Upcoming</Badge>}
                  {row.drafts > 0 && <Badge tone="neutral">{row.drafts} draft{row.drafts === 1 ? '' : 's'}</Badge>}
                </span></td>
                <td className="py-3 pr-4 text-[var(--muted-text)]"><IconChevronRight aria-hidden="true" size={18} stroke={1.75} className="transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--deep-teal)]" /></td>
              </tr>;
            })}
            {data && !data.items.length && <tr><td colSpan={7} className="px-5 py-12 text-center">
              <p className="font-medium text-[var(--charcoal)]">{filtered ? 'No one matches these filters' : 'No people in this organization yet'}</p>
              {filtered && <button type="button" onClick={() => { setSearch(''); update({ q: '', role: '', status: '', department: '', country: '', currency: '', ctcMin: '', ctcMax: '' }); }} className="mt-2 text-sm font-semibold text-[var(--deep-teal)] underline underline-offset-4">Clear filters</button>}
            </td></tr>}
          </tbody>
        </table>

        {data && data.total > 0 && <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] bg-[#FAFCFB] px-5 py-3 text-sm text-[var(--muted-text)]">
          <div className="flex items-center gap-4">
            <span>Showing <strong className="font-semibold text-[var(--charcoal)]">{first}–{last}</strong> of <strong className="font-semibold text-[var(--charcoal)]">{data.total}</strong></span>
            <label className="hidden items-center gap-2 sm:flex">Rows
              <select value={state.pageSize} onChange={(event) => update({ pageSize: Number(event.target.value) })} className="h-8 rounded-md border border-[#B7CAC7] bg-white px-2 text-sm text-[var(--charcoal)]">{[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}</select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <PageButton label="Previous page" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}><IconChevronLeft aria-hidden="true" size={16} stroke={2} /></PageButton>
            {pageList(data.page, data.pages).map((item, index) => item === '…'
              ? <span key={`gap-${index}`} className="px-1.5">…</span>
              : <PageButton key={item} label={`Page ${item}`} current={item === data.page} onClick={() => update({ page: item })}>{item}</PageButton>)}
            <PageButton label="Next page" disabled={data.page >= data.pages} onClick={() => update({ page: data.page + 1 })}><IconChevronRight aria-hidden="true" size={16} stroke={2} /></PageButton>
          </div>
        </nav>}
      </div>}
    </div>
  </SidebarDemo>;
}

function Badge({ tone, children }: { tone: 'good' | 'warn' | 'neutral'; children: ReactNode }) {
  const styles = { good: 'bg-[#E3F2EF] text-[var(--jade-text)]', warn: 'bg-[#FBF1DE] text-[#7A5512]', neutral: 'bg-[#EDF1F2] text-[var(--muted-text)]' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${styles}`}>{children}</span>;
}

function PageButton({ label, current, disabled, onClick, children }: { label: string; current?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} aria-current={current ? 'page' : undefined} disabled={disabled} onClick={onClick} className={`grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)] disabled:cursor-not-allowed disabled:opacity-40 ${current ? 'bg-[var(--deep-teal)] text-white' : 'text-[var(--charcoal)] hover:bg-[#E8F1EF]'}`}>{children}</button>;
}
