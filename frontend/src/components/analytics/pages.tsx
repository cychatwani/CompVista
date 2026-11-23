'use client';

import Link from 'next/link';
import { IconArrowRight, IconChartDots, IconLayoutDashboard } from '@tabler/icons-react';
import SidebarDemo from '@/components/sidebar-demo';
import { Flag } from '@/components/flag';
import { useAnalytics, useFilters, type Analytics, type Filters } from './data';
import { ApprovalsPanel, CompositionChart, CountryChart, CurrencyPrompt, DepartmentChart, DepartmentTable, DistributionChart, KpiRow, LevelChart, Matrix } from './charts';
import { FilterBar, LoadError, Skeleton } from './ui';

const switchLink = 'inline-flex h-10 items-center gap-2 rounded-lg border border-[#B7CAC7] bg-white px-4 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';

function scopeLabel(data: Analytics | null, filters: Filters) {
  if (!data) return 'Compensation across your organization';
  const parts = [filters.country ? data.options.countries.find((item) => item.code === filters.country)?.name : null, filters.department ? data.options.departments.find((item) => item.id === filters.department)?.name : null].filter(Boolean);
  return parts.length ? `Showing ${parts.join(' · ')}` : 'Compensation across your organization';
}

function SelectionNote({ data, filters }: { data: Analytics; filters: Filters }) {
  if (!filters.country) return null;
  const country = data.options.countries.find((item) => item.code === filters.country);
  const local = country?.currencyCode;
  if (!local || !filters.currency || filters.currency === local) return null;
  return <p className="flex items-center gap-2 text-[13px] text-[var(--muted-text)]"><Flag code={filters.country} />{country.name} defaults to {local}. You are viewing packages recorded in {filters.currency}; nothing is converted.</p>;
}

function Loading() {
  return <div aria-busy="true" aria-label="Loading analytics" className="mt-6 space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6"><Skeleton className="h-32 sm:col-span-2" />{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-32" />)}</div>
    <div className="grid gap-6 xl:grid-cols-3"><Skeleton className="h-96 xl:col-span-2" /><Skeleton className="h-96" /></div>
  </div>;
}

export function Dashboard() {
  const { filters, query, set } = useFilters();
  const { data, error, loading, retry } = useAnalytics(query);
  return <SidebarDemo title="Dashboard" subtitle={scopeLabel(data, filters)} actions={<Link href={`/app/insights${query ? `?${query}` : ''}`} className={switchLink}><IconChartDots aria-hidden="true" size={18} stroke={1.75} />Compensation insights</Link>}>
    <FilterBar data={data} filters={filters} set={set} />
    {error && !data ? <LoadError message={error} onRetry={retry} /> : !data ? <Loading /> :
      <div className={`mt-6 space-y-6 transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        {error && <LoadError message={error} onRetry={retry} />}
        <CurrencyPrompt data={data} set={set} />
        <SelectionNote data={data} filters={filters} />
        <KpiRow data={data} />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <DepartmentChart data={data} filters={filters} set={set} />
          <ApprovalsPanel data={data} />
        </div>
        <div className="grid items-stretch gap-6 xl:grid-cols-2">
          <CountryChart data={data} filters={filters} set={set} />
          <DistributionChart data={data} filters={filters} />
        </div>
        <Link href={`/app/insights${query ? `?${query}` : ''}`} className="group flex items-center justify-between rounded-2xl border border-[var(--rule)] bg-white px-6 py-4 text-sm hover:border-[#B7CAC7]">
          <span><span className="font-semibold text-[var(--charcoal)]">Go deeper in Compensation insights</span><span className="ml-2 text-[var(--muted-text)]">Department × country matrix, cost composition, and department comparison.</span></span>
          <IconArrowRight aria-hidden="true" size={18} stroke={1.75} className="text-[var(--deep-teal)] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>}
  </SidebarDemo>;
}

export function Insights() {
  const { filters, query, set } = useFilters();
  const { data, error, loading, retry } = useAnalytics(query);
  return <SidebarDemo title="Compensation insights" subtitle={scopeLabel(data, filters)} actions={<Link href={`/app${query ? `?${query}` : ''}`} className={switchLink}><IconLayoutDashboard aria-hidden="true" size={18} stroke={1.75} />Dashboard</Link>}>
    <FilterBar data={data} filters={filters} set={set} />
    {error && !data ? <LoadError message={error} onRetry={retry} /> : !data ? <Loading /> :
      <div className={`mt-6 space-y-6 transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        {error && <LoadError message={error} onRetry={retry} />}
        <CurrencyPrompt data={data} set={set} />
        <SelectionNote data={data} filters={filters} />
        <Matrix data={data} filters={filters} set={set} />
        <LevelChart data={data} />
        <DepartmentTable data={data} filters={filters} />
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <CompositionChart data={data} />
          <CountryChart data={data} filters={filters} set={set} />
        </div>
      </div>}
  </SidebarDemo>;
}
