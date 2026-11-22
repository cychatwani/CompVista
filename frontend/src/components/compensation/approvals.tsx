'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { IconAlertCircle, IconArrowRight, IconCircleCheck, IconInbox, IconX } from '@tabler/icons-react';
import SidebarDemo, { refreshSidebar } from '@/components/sidebar-demo';
import { domain, type Currency, type EmployeeRecord, type Package } from './api';
import { PendingCard } from './pending-review';

type Pending = Package & { currency: Currency; employee: Pick<EmployeeRecord, 'id' | 'displayName'>; current: (Package & { currency: Currency }) | null };

export function Approvals() {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try { setRows(await domain<Pending[]>('compensation/approvals')); setError(''); }
    catch (reason) { setError((reason as Error).message); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function decided(name: string, outcome: string) {
    await load();
    refreshSidebar();
    setNotice(outcome === 'ACTIVE' ? `${name}'s package was approved and is now current.` : outcome === 'SCHEDULED' ? `${name}'s package was approved. It becomes current on its effective date.` : `${name}'s package was returned to the proposer with your feedback.`);
  }
  const mine = rows?.filter((row) => row.canDecide) ?? [];
  const others = rows?.filter((row) => !row.canDecide) ?? [];

  return <SidebarDemo title="Approvals" subtitle="Compensation changes waiting for your decision.">
    <div className="mt-8 w-full space-y-6 tabular-nums">
      {error && <div role="alert" className="flex items-center gap-3 rounded-xl border border-[#F0C9C4] bg-[#FDF6F5] px-4 py-3 text-sm text-[#7A2A20]"><IconAlertCircle aria-hidden="true" size={18} stroke={1.75} />{error}</div>}
      {notice && <div role="status" className="flex items-center gap-3 rounded-xl border border-[#BFE0D9] bg-[#F0F8F6] px-4 py-3 text-sm text-[#1D5E55]"><IconCircleCheck aria-hidden="true" size={18} stroke={1.75} /><span className="flex-1">{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice('')} className="opacity-70 hover:opacity-100"><IconX aria-hidden="true" size={16} /></button></div>}
      {!rows && !error && <div aria-busy="true" aria-label="Loading approvals" className="space-y-4">{[0, 1].map((index) => <div key={index} className="h-56 rounded-2xl bg-[#E3ECEA] motion-safe:animate-pulse" />)}</div>}
      {rows && !rows.length && <div className="flex max-w-xl items-start gap-4 rounded-2xl border border-[var(--rule)] bg-white p-8">
        <IconInbox aria-hidden="true" size={24} stroke={1.5} className="mt-0.5 text-[var(--teal)]" />
        <div><h2 className="font-[family-name:var(--font-manrope)] text-lg font-semibold">Nothing waiting for approval</h2><p className="mt-1 text-sm text-[var(--muted-text)]">When someone submits a package that needs your approval, it appears here.</p></div>
      </div>}
      {mine.length > 0 && <section aria-labelledby="mine-heading" className="space-y-4">
        <h2 id="mine-heading" className="font-[family-name:var(--font-manrope)] text-lg font-semibold">Waiting for you <span className="ml-1 rounded-full bg-[#FBF1DE] px-2 py-0.5 text-sm text-[#7A5512]">{mine.length}</span></h2>
        {mine.map((row) => <Entry key={row.id} row={row} onDecided={(outcome) => decided(row.employee.displayName, outcome)} />)}
      </section>}
      {others.length > 0 && <section aria-labelledby="others-heading" className="space-y-4">
        <h2 id="others-heading" className="font-[family-name:var(--font-manrope)] text-lg font-semibold">Waiting for someone else</h2>
        <p className="-mt-2 text-sm text-[var(--muted-text)]">You submitted these, or they are for your own compensation, so another approver must decide.</p>
        {others.map((row) => <Entry key={row.id} row={row} onDecided={(outcome) => decided(row.employee.displayName, outcome)} />)}
      </section>}
    </div>
  </SidebarDemo>;
}

function Entry({ row, onDecided }: { row: Pending; onDecided: (outcome: string) => Promise<void> }) {
  return <div>
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="font-medium text-[var(--charcoal)]">{row.employee.displayName}</p>
      <Link href={`/app/employees/${row.employee.id}/compensation`} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--deep-teal)] underline-offset-4 hover:underline">Open person<IconArrowRight aria-hidden="true" size={16} stroke={1.75} /></Link>
    </div>
    <PendingCard row={row} active={row.current} currency={row.currency} onChanged={onDecided} />
  </div>;
}
