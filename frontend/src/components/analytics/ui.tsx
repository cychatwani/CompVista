'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconAlertCircle, IconCheck, IconChevronDown, IconRefresh, IconX } from '@tabler/icons-react';
import { Flag } from '@/components/flag';
import type { Analytics, Filters } from './data';

export const panel = 'rounded-2xl border border-[var(--rule)] bg-white shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-14px_rgba(15,76,92,.14)]';

export function Panel({ title, description, action, children, className = '', id }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  const headingId = `${id ?? title.replace(/\W+/g, '-').toLowerCase()}-heading`;
  return <section aria-labelledby={headingId} className={`${panel} flex min-w-0 flex-col p-5 sm:p-6 ${className}`}>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={headingId} className="font-[family-name:var(--font-manrope)] text-base font-semibold tracking-[-0.01em] text-[var(--charcoal)]">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--muted-text)]">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>;
}

export function Kpi({ label, value, detail, title, tone = 'default' }: { label: string; value: ReactNode; detail?: ReactNode; title?: string; tone?: 'default' | 'accent' | 'attention' }) {
  const accent = tone === 'accent' ? 'bg-[var(--deep-teal)] text-white border-transparent' : tone === 'attention' ? 'bg-[#FFFBF3] border-[#EBD9B4]' : 'bg-white border-[var(--rule)]';
  return <div className={`flex h-full min-w-0 flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,76,92,.04)] ${accent}`}>
    <p className={`truncate text-[13px] font-medium ${tone === 'accent' ? 'text-[#BFE0D9]' : 'text-[var(--muted-text)]'}`}>{label}</p>
    <p title={title} className="mt-3 truncate font-[family-name:var(--font-manrope)] text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
    {detail && <p className={`mt-auto pt-3 text-[13px] leading-snug ${tone === 'accent' ? 'text-[#D6ECE7]' : 'text-[var(--muted-text)]'}`}>{detail}</p>}
  </div>;
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-xl bg-[#E3ECEA] motion-safe:animate-pulse ${className}`} />;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="grid min-h-40 flex-1 place-items-center rounded-xl border border-dashed border-[#CBD8D5] bg-[#FAFCFB] px-6 py-8 text-center">
    <div><p className="text-sm font-medium text-[var(--charcoal)]">{title}</p>{children && <div className="mt-1 text-[13px] text-[var(--muted-text)]">{children}</div>}</div>
  </div>;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-[#F0C9C4] bg-[#FDF6F5] px-5 py-4 text-sm text-[#7A2A20]">
    <IconAlertCircle aria-hidden="true" size={18} stroke={1.75} /><span className="flex-1">{message}</span>
    <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg border border-[#E3B4AC] bg-white px-3 py-1.5 font-semibold hover:bg-[#FBEDEB]"><IconRefresh aria-hidden="true" size={16} stroke={1.75} />Try again</button>
  </div>;
}

/** Hover/focus tooltip for a chart mark. Content is also exposed through the mark's aria-label. */
export function Tip({ children, align = 'center' }: { children: ReactNode; align?: 'center' | 'start' | 'end' }) {
  const position = align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return <span role="presentation" className={`pointer-events-none absolute bottom-full z-30 mb-2 hidden w-max max-w-64 rounded-lg bg-[var(--charcoal)] px-3 py-2 text-left text-xs leading-relaxed text-white shadow-lg group-hover:block group-focus-visible:block ${position}`}>{children}</span>;
}

type Option = { value: string; label: string; flag?: string; hint?: string };

/** Compact dropdown that can show flags (a native select cannot). */
export function Picker({ label, value, options, allLabel, onChange }: { label: string; value: string; options: Option[]; allLabel: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"], button')?.focus();
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const choose = (next: string) => { onChange(next); setOpen(false); root.current?.querySelector('button')?.focus(); };
  const all = [{ value: '', label: allLabel } as Option, ...options];
  return <div ref={root} className="relative" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus(); }
    if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const items = [...(list.current?.querySelectorAll('button') ?? [])];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }}>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className={`flex h-10 min-w-[11rem] items-center gap-2 rounded-lg border bg-white px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--deep-teal)] ${value ? 'border-[var(--deep-teal)] text-[var(--deep-teal)]' : 'border-[#B7CAC7] text-[var(--charcoal)] hover:border-[#8FA7A3]'}`}>
      <span className="text-[var(--muted-text)]">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 font-medium">{current?.flag && <Flag code={current.flag} />}<span className="truncate">{current?.label ?? allLabel}</span></span>
      <IconChevronDown aria-hidden="true" size={16} stroke={1.75} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <ul ref={list} role="listbox" aria-label={label} className="absolute left-0 top-full z-40 mt-1.5 max-h-80 min-w-full overflow-auto rounded-xl border border-[var(--rule)] bg-white p-1 shadow-[0_12px_32px_-12px_rgba(15,76,92,.35)]">
      {all.map((option) => <li key={option.value || 'all'} role="presentation">
        <button type="button" role="option" aria-selected={option.value === value} onClick={() => choose(option.value)} className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-[var(--charcoal)] hover:bg-[#EEF4F3] focus-visible:bg-[#EEF4F3] focus-visible:outline-none aria-selected:font-semibold aria-selected:text-[var(--deep-teal)]">
          {option.flag && <Flag code={option.flag} />}<span className="flex-1">{option.label}</span>
          {option.hint && <span className="text-xs text-[var(--muted-text)]">{option.hint}</span>}
          <IconCheck aria-hidden="true" size={15} stroke={2} className={option.value === value ? 'text-[var(--deep-teal)]' : 'invisible'} />
        </button>
      </li>)}
    </ul>}
  </div>;
}

export function FilterBar({ data, filters, set }: { data: Analytics | null; filters: Filters; set: (change: Partial<Filters>) => void }) {
  const options = data?.options;
  const active = !!(filters.country || filters.department || filters.currency);
  return <div className="mt-8 flex flex-wrap items-center gap-2.5" role="group" aria-label="Dashboard filters">
    <Picker label="Country" allLabel="All countries" value={filters.country} onChange={(country) => set({ country })}
      options={(options?.countries ?? []).map((item) => ({ value: item.code, label: item.name, flag: item.code }))} />
    <Picker label="Department" allLabel="All departments" value={filters.department} onChange={(department) => set({ department })}
      options={(options?.departments ?? []).map((item) => ({ value: item.id, label: item.name, hint: item.isActive ? undefined : 'Inactive' }))} />
    <Picker label="Currency" allLabel="All currencies" value={filters.currency} onChange={(currency) => set({ currency })}
      options={[...(options?.currencies ?? []), ...(filters.currency && !options?.currencies.some((item) => item.code === filters.currency) ? [{ code: filters.currency, employees: 0, name: filters.currency, symbol: '', decimal_places: 2 }] : [])].map((item) => ({ value: item.code, label: `${item.code} · ${item.name}`, hint: item.employees ? `${item.employees.toLocaleString('en-US')}` : undefined }))} />
    {active && <button type="button" onClick={() => set({ country: '', department: '', currency: '' })} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#E6EFED] focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)]"><IconX aria-hidden="true" size={16} stroke={2} />Clear filters</button>}
  </div>;
}
