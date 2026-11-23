'use client';

import { useMemo, useState } from 'react';
import { IconAlertCircle, IconCheck, IconClock, IconFlag } from '@tabler/icons-react';
import { domain, formatMoney, frequencyShort, type Currency, type Definition, type Item, type Package } from './api';

export type ChangeRequest = { target: 'component' | 'effectiveFrom'; componentDefinitionId: string | null; label?: string; note: string };

const field = 'h-9 w-full rounded-lg border bg-white px-3 text-sm text-[var(--charcoal)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)]';
const okBorder = 'border-[#B7CAC7] focus-visible:border-[var(--deep-teal)]';
const badBorder = 'border-[#C8483A] focus-visible:border-[#C8483A]';
const primary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--deep-teal)] px-4 text-sm font-semibold text-white hover:bg-[var(--teal)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';
const secondary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#B7CAC7] bg-white px-4 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDate = (value: string) => dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));

const categoryOrder: Definition['category'][] = ['EARNING', 'EMPLOYER_CONTRIBUTION', 'EMPLOYEE_DEDUCTION'];
const categoryHeading: Record<Definition['category'], string> = { EARNING: 'Earnings', EMPLOYER_CONTRIBUTION: 'Employer contributions', EMPLOYEE_DEDUCTION: 'Deductions' };
// The comparable yearly figure for a line: annualized for recurring items, the payment itself for one-time items.
const yearly = (item: Item) => item.frequency === 'ONE_TIME' ? item.resolved_amount : item.annual_amount;
const basisOf = (item: Item) => `${frequencyShort(item.frequency)}${item.calculation_type === 'PERCENTAGE_OF_BASE' ? ` · ${Number(item.percentage)}% of Basic` : ''}`;
const pctChange = (next: string, prev: string | undefined) => !prev || !Number(prev) ? null : ((Number(next) - Number(prev)) / Number(prev)) * 100;

type Line = { id: string; definition: Definition; prev?: Item; next?: Item; status: 'new' | 'removed' | 'changed' | 'same' };
function compare(row: Package, active: Package | null): Line[] {
  const ids = [...new Set([...row.items, ...(active?.items ?? [])].map((item) => item.component_definition_id))];
  return ids.map((id): Line => {
    const next = row.items.find((item) => item.component_definition_id === id);
    const prev = active?.items.find((item) => item.component_definition_id === id);
    const differs = !!prev && !!next && (yearly(prev) !== yearly(next) || basisOf(prev) !== basisOf(next));
    return { id, definition: (next ?? prev)!.definition, prev, next, status: !prev ? 'new' : !next ? 'removed' : differs ? 'changed' : 'same' };
  }).sort((a, b) => categoryOrder.indexOf(a.definition.category) - categoryOrder.indexOf(b.definition.category) || Number(b.definition.is_basic) - Number(a.definition.is_basic));
}

function FlagButton({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return <button type="button" aria-pressed={on} aria-label={`${on ? 'Unflag' : 'Flag'} ${label}`} onClick={onToggle} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)] ${on ? 'border-[#E3B4AC] bg-[#FBEDEB] text-[#9A3A2D]' : 'border-[#CBD8D5] bg-white text-[var(--muted-text)] hover:border-[#9FB4B0] hover:text-[var(--charcoal)]'}`}>
    <IconFlag aria-hidden="true" size={14} stroke={2} />{on ? 'Flagged' : 'Flag'}
  </button>;
}

export function PendingCard({ row, active, currency, onChanged }: { row: Package; active: Package | null; currency: Currency | undefined; onChanged: (outcome: string) => Promise<void> }) {
  const [reviewing, setReviewing] = useState(false);
  const [note, setNote] = useState('');
  const [flags, setFlags] = useState<ChangeRequest[]>([]);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const money = (value: string) => formatMoney(value, currency, currency?.code === 'INR' ? 'en-IN' : undefined);
  const stale = !!active && row.effective_from.slice(0, 10) <= active.effective_from.slice(0, 10);
  const lines = useMemo(() => compare(row, active), [row, active]);
  const shown = onlyChanges ? lines.filter((line) => line.status !== 'same') : lines;
  const changedCount = lines.filter((line) => line.status !== 'same').length;

  const flagOf = (target: ChangeRequest['target'], id: string | null) => flags.find((flag) => flag.target === target && flag.componentDefinitionId === id);
  const toggle = (target: ChangeRequest['target'], id: string | null) => setFlags((current) => current.some((flag) => flag.target === target && flag.componentDefinitionId === id)
    ? current.filter((flag) => !(flag.target === target && flag.componentDefinitionId === id))
    : [...current, { target, componentDefinitionId: id, note: '' }]);
  const write = (target: ChangeRequest['target'], id: string | null, value: string) => setFlags((current) => current.map((flag) => flag.target === target && flag.componentDefinitionId === id ? { ...flag, note: value } : flag));
  const noteInput = (target: ChangeRequest['target'], id: string | null, label: string) => {
    const flag = flagOf(target, id);
    if (!flag) return null;
    return <input autoFocus aria-label={`What should change in ${label}?`} value={flag.note} onChange={(event) => write(target, id, event.target.value)} maxLength={500} placeholder={`What should change in ${label}?`} className={`${field} mt-2 ${error && !flag.note.trim() ? badBorder : okBorder}`} />;
  };

  async function decide(action: 'approve' | 'reject') {
    if (action === 'reject' && !flags.length && !note.trim()) { setError('Flag what needs to change, or add an overall note.'); return; }
    if (action === 'reject' && flags.some((flag) => !flag.note.trim())) { setError('Add a note to every flagged item.'); return; }
    setWorking(true); setError('');
    const body = action === 'reject'
      ? { version: row.version, note: note.trim() || undefined, changes: flags.map((flag) => ({ ...flag, note: flag.note.trim() })) }
      : { version: row.version };
    try { const result = await domain<{ outcome: string }>(`compensation/${row.id}/${action}`, { method: 'POST', body: JSON.stringify(body) }); await onChanged(result.outcome); }
    catch (reason) { setError((reason as Error).message); setWorking(false); }
  }

  const totals = [
    { label: 'Annual CTC', prev: active?.summary.annualCtc, next: row.summary.annualCtc },
    { label: 'Monthly CTC', prev: active?.summary.monthlyCtc, next: row.summary.monthlyCtc },
    { label: 'Monthly gross', prev: active?.summary.monthlyGross, next: row.summary.monthlyGross },
  ];

  return <section className="overflow-hidden rounded-2xl border border-[#EBD9B4] bg-white shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-12px_rgba(15,76,92,.12)]" aria-labelledby={`pending-${row.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#F0E4C8] bg-[#FFFCF6] px-6 py-5">
      <div className="min-w-0">
        <h2 id={`pending-${row.id}`} className="flex items-center gap-2 font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.01em] text-[var(--charcoal)]"><IconClock aria-hidden="true" size={20} stroke={1.75} className="text-[#9A6B12]" />Waiting for approval</h2>
        <p className="mt-1 text-sm text-[#6B4E16]">{row.submitter?.name ? `Submitted by ${row.submitter.name}` : 'Submitted'}{row.submitted_at ? ` on ${fmtDate(row.submitted_at)}` : ''}</p>
        {row.decision_note && <p className="mt-3 max-w-[70ch] text-sm text-[var(--charcoal)]"><span className="font-medium">Reason for change:</span> {row.decision_note}</p>}
      </div>
      {row.canDecide && !reviewing && <div className="flex gap-2">
        <button type="button" className={secondary} disabled={working} onClick={() => { setReviewing(true); setError(''); }}>Return for changes</button>
        <button type="button" className={primary} disabled={working || stale} title={stale ? 'Starts before the current package' : undefined} onClick={() => void decide('approve')}><IconCheck aria-hidden="true" size={18} stroke={2} />{working ? 'Applying…' : 'Approve and apply'}</button>
      </div>}
    </div>

    <div className="space-y-6 px-6 py-6">
      {stale && <Note>This starts on {fmtDate(row.effective_from)}, before the current package ({fmtDate(active!.effective_from)}), so it can&apos;t be applied. Return it so the proposer can choose a later date.</Note>}
      {!row.canDecide && <p className="text-sm text-[var(--muted-text)]">An approver needs to review this before it takes effect.</p>}
      {reviewing && <Note>Flag each item that needs to change and say what should change. The proposer sees each note next to that item when they edit the draft.</Note>}

      <dl className="grid gap-px overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2 xl:grid-cols-4 [&>div]:bg-[#FAFCFB] [&>div]:p-4">
        <div className={flagOf('effectiveFrom', null) ? '!bg-[#FFF8F6]' : ''}>
          <dt className="flex min-h-8 items-center justify-between gap-2 text-xs text-[var(--muted-text)]">Effective from{reviewing && <FlagButton on={!!flagOf('effectiveFrom', null)} label="effective date" onToggle={() => toggle('effectiveFrom', null)} />}</dt>
          <dd className="mt-1 font-[family-name:var(--font-manrope)] text-lg font-semibold">{fmtDate(row.effective_from)}</dd>
          <dd className="mt-0.5 text-xs text-[var(--muted-text)]">{active ? `Current package since ${fmtDate(active.effective_from)}` : 'First package for this person'}</dd>
          {reviewing && <dd>{noteInput('effectiveFrom', null, 'the effective date')}</dd>}
        </div>
        {totals.map((item) => {
          const pct = pctChange(item.next, item.prev);
          const delta = item.prev ? Number(item.next) - Number(item.prev) : 0;
          return <div key={item.label}>
            <dt className="flex min-h-8 items-center text-xs text-[var(--muted-text)]">{item.label}</dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-2 font-[family-name:var(--font-manrope)] text-lg font-semibold">{money(item.next)}{pct !== null && Math.abs(pct) >= 0.05 && <Delta up={pct > 0}>{pct > 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</Delta>}</dd>
            <dd className="mt-0.5 text-xs text-[var(--muted-text)]">{item.prev ? <>Was {money(item.prev)}{delta ? ` · ${delta > 0 ? '+' : '−'}${money(String(Math.abs(delta)))}` : ' · unchanged'}</> : 'No current package'}</dd>
          </div>;
        })}
      </dl>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--charcoal)]">Component by component <span className="font-normal text-[var(--muted-text)]">· {active ? `${changedCount} of ${lines.length} changed` : `${lines.length} components`}</span></h3>
          {active && <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--muted-text)]"><input type="checkbox" checked={onlyChanges} onChange={(event) => setOnlyChanges(event.target.checked)} className="size-4 accent-[var(--deep-teal)]" />Only show changes</label>}
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--rule)]">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-b border-[var(--rule)] bg-[#F7FAF9] text-xs text-[var(--muted-text)]">
              <th scope="col" className="px-4 py-2.5 font-medium">Component</th>
              {active && <th scope="col" className="px-4 py-2.5 text-right font-medium">Current / year</th>}
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Proposed / year</th>
              {active && <th scope="col" className="px-4 py-2.5 text-right font-medium">Change</th>}
              {reviewing && <th scope="col" className="w-28 px-4 py-2.5"><span className="sr-only">Flag</span></th>}
            </tr></thead>
            {categoryOrder.map((category) => {
              const group = shown.filter((line) => line.definition.category === category);
              if (!group.length) return null;
              const deduction = category === 'EMPLOYEE_DEDUCTION';
              return <tbody key={category} className="divide-y divide-[var(--rule)] border-b border-[var(--rule)] last:border-b-0">
                <tr className="bg-[#FBFDFC]"><th scope="rowgroup" colSpan={5} className="px-4 pb-1.5 pt-3 text-xs font-semibold text-[var(--muted-text)]">{categoryHeading[category]}</th></tr>
                {group.map((line) => {
                  const prev = line.prev ? yearly(line.prev) : null;
                  const next = line.next ? yearly(line.next) : null;
                  const delta = Number(next ?? 0) - Number(prev ?? 0);
                  const flagged = !!flagOf('component', line.id);
                  const sign = deduction ? '−' : '';
                  const good = deduction ? delta <= 0 : delta >= 0;
                  return <tr key={line.id} className={`align-top ${flagged ? 'bg-[#FFF8F6]' : ''} ${line.status === 'same' ? 'text-[var(--muted-text)]' : ''}`}>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${line.status === 'same' ? '' : 'text-[var(--charcoal)]'}`}>{line.definition.name}</span>
                      {active && line.status === 'new' && <span className="ml-2 rounded-full bg-[#E3F2EF] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--jade-text)]">New</span>}
                      {line.status === 'removed' && <span className="ml-2 rounded-full bg-[#FBEDEB] px-1.5 py-0.5 text-[11px] font-semibold text-[#9A3A2D]">Removed</span>}
                      <span className="mt-0.5 block text-xs text-[var(--muted-text)]">{line.next ? basisOf(line.next) : basisOf(line.prev!)}{line.prev && line.next && basisOf(line.prev) !== basisOf(line.next) ? ` (was ${basisOf(line.prev)})` : ''}{(line.next ?? line.prev)!.frequency === 'ONE_TIME' ? ' · not in CTC' : ''}</span>
                      {reviewing && noteInput('component', line.id, line.definition.name)}
                    </td>
                    {active && <td className="whitespace-nowrap px-4 py-3 text-right">{prev ? `${sign}${money(prev)}` : '—'}</td>}
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{next ? `${sign}${money(next)}` : '—'}</td>
                    {active && <td className="whitespace-nowrap px-4 py-3 text-right">{line.status === 'same' ? <span>—</span> : <span className={`font-medium ${good ? 'text-[var(--jade-text)]' : 'text-[#9A3A2D]'}`}>{delta > 0 ? '+' : delta < 0 ? '−' : ''}{money(String(Math.abs(delta)))}{prev && Number(prev) ? <span className="ml-1 text-xs font-normal">({delta > 0 ? '+' : ''}{((delta / Number(prev)) * 100).toFixed(1)}%)</span> : null}</span>}</td>}
                    {reviewing && <td className="px-4 py-3 text-right">{line.next && <FlagButton on={flagged} label={line.definition.name} onToggle={() => toggle('component', line.id)} />}</td>}
                  </tr>;
                })}
              </tbody>;
            })}
          </table>
        </div>
        {onlyChanges && !shown.length && <p className="mt-3 text-sm text-[var(--muted-text)]">No component changes. Only the effective date differs.</p>}
      </div>

      {reviewing && <div className="border-t border-[var(--rule)] pt-5">
        <label htmlFor={`reject-${row.id}`} className="text-sm font-medium text-[var(--charcoal)]">Overall note <span className="font-normal text-[var(--muted-text)]">{flags.length ? '(optional)' : '(required if nothing is flagged)'}</span></label>
        <textarea id={`reject-${row.id}`} value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} className={`mt-2 w-full rounded-lg border bg-white p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)] ${error && !flags.length && !note.trim() ? badBorder : okBorder}`} placeholder="Anything that applies to the whole package." />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => { setReviewing(false); setError(''); setFlags([]); }}>Cancel</button>
          <button type="button" className={primary} disabled={working} onClick={() => void decide('reject')}>{working ? 'Returning…' : flags.length ? `Return with ${flags.length} flagged ${flags.length === 1 ? 'item' : 'items'}` : 'Return to proposer'}</button>
        </div>
      </div>}
      {error && <p role="alert" className="text-sm font-medium text-[#9A3A2D]">{error}</p>}
    </div>
  </section>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <div role="status" className="flex items-start gap-3 rounded-xl border border-[#EBD9B4] bg-[#FDF8EE] px-4 py-3 text-sm text-[#6B4E16]"><IconAlertCircle aria-hidden="true" size={18} stroke={1.75} className="mt-0.5 shrink-0" /><div>{children}</div></div>;
}
function Delta({ up, children }: { up: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full px-1.5 py-0.5 font-[family-name:var(--font-inter)] text-xs font-semibold ${up ? 'bg-[#E3F2EF] text-[var(--jade-text)]' : 'bg-[#FBEDEB] text-[#9A3A2D]'}`}>{children}</span>;
}

/** The approver's itemized feedback, shown on a returned draft and inside the editor. */
export function ChangeRequests({ requests, note, compact }: { requests: ChangeRequest[] | null | undefined; note?: string | null; compact?: boolean }) {
  if (!requests?.length && !note) return null;
  return <div className={`rounded-xl border border-[#F0C9C4] bg-[#FDF6F5] text-sm text-[#7A2A20] ${compact ? 'mt-2 px-3 py-2.5' : 'px-4 py-3'}`}>
    <p className="flex items-center gap-2 font-semibold"><IconFlag aria-hidden="true" size={15} stroke={2} />Returned for changes</p>
    {note && <p className="mt-1.5 text-[var(--charcoal)]">{note}</p>}
    {!!requests?.length && <ul className="mt-2 space-y-1">
      {requests.map((request) => <li key={`${request.target}-${request.componentDefinitionId}`}><span className="font-medium text-[var(--charcoal)]">{request.label ?? (request.target === 'effectiveFrom' ? 'Effective date' : 'Component')}:</span> {request.note}</li>)}
    </ul>}
  </div>;
}
