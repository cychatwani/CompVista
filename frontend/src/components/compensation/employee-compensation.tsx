'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { IconAlertCircle, IconCheck, IconCircleCheck, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import SidebarDemo, { refreshSidebar } from '@/components/sidebar-demo';
import { ChangeRequests, PendingCard, type ChangeRequest } from './pending-review';
import { domain, formatMoney, frequencyOptions, frequencyShort, type Currency, type Definition, type EmployeeRecord, type Frequency, type Package } from './api';

type Permissions = { canPropose: boolean; submitOutcome: 'ACTIVE' | 'PENDING_APPROVAL' | null; canCancelUpcoming: boolean };
type Record_ = { employee: EmployeeRecord; active: Package | null; upcoming: Package | null; drafts: Package[]; pending: Package[]; permissions: Permissions };
type Row = { key: string; componentDefinitionId: string; calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE'; value: string; frequency: Frequency };
type Preview = { items: { componentDefinitionId: string; resolvedAmount: string; annualAmount: string; frequency: Frequency }[]; monthlyGross: string; monthlyEmployerContributions: string; monthlyEmployeeDeductions: string; monthlyCtc: string; annualCtc: string; oneTimePayments: string };
type Draft = { id: string | null; version: number | null; currencyCode: string; effectiveFrom: string; effectiveTo: string; rows: Row[]; note: string; removed: string[]; carriedOver?: string[]; changeRequests?: ChangeRequest[] | null; returnNote?: string | null };

const categoryLabel: Record<Definition['category'], string> = { EARNING: 'Earning', EMPLOYER_CONTRIBUTION: 'Employer contribution', EMPLOYEE_DEDUCTION: 'Deduction' };
const field = 'h-10 w-full rounded-lg border bg-white px-3 text-sm text-[var(--charcoal)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)]';
const okBorder = 'border-[#B7CAC7] focus-visible:border-[var(--deep-teal)]';
const badBorder = 'border-[#C8483A] focus-visible:border-[#C8483A]';
const primary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--deep-teal)] px-4 text-sm font-semibold text-white hover:bg-[var(--teal)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';
const secondary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#B7CAC7] bg-white px-4 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';
const panel = 'rounded-2xl border border-[var(--rule)] bg-white shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-12px_rgba(15,76,92,.12)]';
const heading = 'font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.01em] text-[var(--charcoal)]';
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDate = (value: string) => dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
const decimalPattern = /^\d+(?:\.\d{1,4})?$/;
let rowKey = 0;
const newKey = () => `row-${++rowKey}`;

function moneyFor(currency: Currency | undefined) {
  return (value: string) => formatMoney(value, currency, currency?.code === 'INR' ? 'en-IN' : undefined);
}
function change(next: string, previous: string | undefined) {
  if (!previous || Number(previous) === 0) return null;
  const pct = ((Number(next) - Number(previous)) / Number(previous)) * 100;
  return Math.abs(pct) < 0.05 ? null : pct;
}
function ChangeChip({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct > 0;
  return <span className={`ml-2 inline-flex rounded-full px-1.5 py-0.5 text-xs font-semibold ${up ? 'bg-[#E3F2EF] text-[var(--jade-text)]' : 'bg-[#FBEDEB] text-[#9A3A2D]'}`}>{up ? '+' : '−'}{Math.abs(pct).toFixed(1)}%</span>;
}
function nextMonthStart(after?: string) {
  const now = new Date();
  let date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  if (after) { const floor = new Date(`${after.slice(0, 10)}T00:00:00Z`); while (date <= floor) date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)); }
  return date.toISOString().slice(0, 10);
}
// "60000.0000" -> "60000", "12.5000" -> "12.5"; whole numbers keep their zeros.
export function trimDecimal(value: string | null | undefined): string {
  if (!value) return '';
  return value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
}
function rowsFrom(pkg: Package): Row[] {
  return pkg.items.map((item) => ({ key: newKey(), componentDefinitionId: item.component_definition_id, calculationType: item.calculation_type, frequency: item.frequency ?? 'MONTHLY', value: trimDecimal(item.calculation_type === 'FIXED' ? item.fixed_amount : item.percentage) }));
}
function templateRows(definitions: Definition[]): Row[] {
  const defaults: Record<string, Omit<Row, 'key' | 'componentDefinitionId' | 'frequency'>> = { BASIC: { calculationType: 'FIXED', value: '' }, HRA: { calculationType: 'PERCENTAGE_OF_BASE', value: '40' }, SPECIAL: { calculationType: 'FIXED', value: '' }, EMPLOYER_PF: { calculationType: 'PERCENTAGE_OF_BASE', value: '12' }, EMPLOYEE_PF: { calculationType: 'PERCENTAGE_OF_BASE', value: '12' } };
  const active = definitions.filter((item) => item.is_active);
  const picked = active.filter((item) => item.is_basic || defaults[item.code]);
  return picked.map((item) => ({ key: newKey(), componentDefinitionId: item.id, frequency: item.default_frequency ?? 'MONTHLY', ...(defaults[item.code] ?? { calculationType: 'FIXED' as const, value: '' }) }));
}

export function EmployeeCompensation({ employeeId }: { employeeId: string }) {
  const [record, setRecord] = useState<Record_ | null>(null);
  const [history, setHistory] = useState<Package[]>([]);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [wizard, setWizard] = useState<Draft | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [current, past, componentList, currencyList] = await Promise.all([
        domain<Record_>(`employees/${employeeId}/compensation`), domain<Package[]>(`employees/${employeeId}/compensation/history`),
        domain<Definition[]>('compensation/components'), domain<Currency[]>('currencies'),
      ]);
      setRecord(current); setHistory(past); setDefinitions(componentList); setCurrencies(currencyList); setError('');
    } catch (reason) { setError((reason as Error).message); }
  }, [employeeId]);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  function start(from?: Package) {
    setNotice('');
    const active = record?.active;
    // Components deactivated since the source package was made can't be reused; drop them and say so.
    const usable = (pkg: Package) => {
      const inactive = pkg.items.filter((item) => definitions.find((definition) => definition.id === item.component_definition_id)?.is_active === false);
      return { rows: rowsFrom(pkg).filter((row) => !inactive.some((item) => item.component_definition_id === row.componentDefinitionId)), removed: inactive.map((item) => item.definition.name) };
    };
    if (from) { setWizard({ id: from.id, version: from.version, currencyCode: from.currency_code, effectiveFrom: from.effective_from.slice(0, 10), effectiveTo: from.effective_to?.slice(0, 10) ?? '', ...usable(from), note: '', changeRequests: from.change_requests, returnNote: from.decision_note }); return; }
    // A revision starts from the current package minus anything already paid out once.
    const revision = (pkg: Package) => { const base = usable(pkg); const paidOnce = pkg.items.filter((item) => item.frequency === 'ONE_TIME'); return { rows: base.rows.filter((row) => row.frequency !== 'ONE_TIME'), removed: base.removed, carriedOver: paidOnce.map((item) => item.definition.name) }; };
    setWizard({ id: null, version: null, currencyCode: active?.currency_code ?? 'INR', effectiveFrom: nextMonthStart(active?.effective_from), effectiveTo: '', ...(active ? revision(active) : { rows: templateRows(definitions), removed: [], carriedOver: [] }), note: '' });
  }
  async function finished(outcome: string) {
    refreshSidebar();
    setWizard(null);
    setNotice(outcome === 'ACTIVE' ? 'Package applied. It is now the current package.' : outcome === 'SCHEDULED' ? 'Package scheduled. It becomes the current package on its effective date.' : outcome === 'CANCELLED' ? 'Upcoming package cancelled.' : outcome === 'PENDING_APPROVAL' ? 'Submitted for approval. It takes effect once an approver applies it.' : 'Draft saved. You can continue it any time.');
    await refresh();
  }

  const name = record?.employee.displayName ?? 'Employee compensation';
  return <SidebarDemo title={name} subtitle={record?.employee.organization?.name ?? 'Compensation package'} back={{ href: '/app/compensation', label: 'All people' }}>
    <div className="mt-8 w-full space-y-8 tabular-nums">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success" onClose={() => setNotice('')}>{notice}</Alert>}
      {record && (wizard
        ? <Wizard key={wizard.id ?? 'new'} initial={wizard} record={record} definitions={definitions} currencies={currencies} employeeId={employeeId} onCancel={() => setWizard(null)} onDone={finished} />
        : <Overview record={record} history={history} currencies={currencies} onStart={start} onChanged={finished} />)}
      {!record && !error && <div className="h-64 rounded-2xl bg-[#E3ECEA] motion-safe:animate-pulse" aria-busy="true" aria-label="Loading compensation" />}
    </div>
  </SidebarDemo>;
}

function Alert({ tone, children, onClose }: { tone: 'error' | 'success' | 'warn'; children: ReactNode; onClose?: () => void }) {
  const styles = { error: 'border-[#F0C9C4] bg-[#FDF6F5] text-[#7A2A20]', success: 'border-[#BFE0D9] bg-[#F0F8F6] text-[#1D5E55]', warn: 'border-[#EBD9B4] bg-[#FDF8EE] text-[#6B4E16]' }[tone];
  const Icon = tone === 'success' ? IconCircleCheck : IconAlertCircle;
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
    <Icon aria-hidden="true" size={18} stroke={1.75} className="mt-0.5 shrink-0" /><div className="flex-1">{children}</div>
    {onClose && <button type="button" aria-label="Dismiss" onClick={onClose} className="rounded p-0.5 opacity-70 hover:opacity-100"><IconX aria-hidden="true" size={16} /></button>}
  </div>;
}

function Overview({ record, history, currencies, onStart, onChanged }: { record: Record_; history: Package[]; currencies: Currency[]; onStart: (from?: Package) => void; onChanged: (outcome: string) => Promise<void> }) {
  const { active, upcoming, drafts, pending, permissions } = record;
  const currencyOf = (code: string) => currencies.find((item) => item.code === code);
  const busy = pending.length > 0 || !!upcoming;
  const busyReason = upcoming ? 'An upcoming package is already scheduled' : 'Resolve the pending approval first';
  return <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
    <div className="min-w-0 space-y-8">
    {upcoming && <UpcomingCard row={upcoming} active={active} currency={currencyOf(upcoming.currency_code)} canCancel={permissions.canCancelUpcoming} onChanged={onChanged} />}
    {pending.map((row) => <PendingCard key={row.id} row={row} active={active} currency={currencyOf(row.currency_code)} onChanged={onChanged} />)}

    <section className={`${panel} p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={heading}>Current package</h2>
          {active ? <p className="mt-1 text-sm text-[var(--muted-text)]">In effect since {fmtDate(active.effective_from)}{active.effective_to ? `, until ${fmtDate(active.effective_to)}` : ''}</p> : <p className="mt-1 text-sm text-[var(--muted-text)]">No package has been applied yet.</p>}
        </div>
        {permissions.canPropose && <button type="button" className={primary} onClick={() => onStart()} disabled={busy} title={busy ? busyReason : undefined}>{active ? <><IconPencil aria-hidden="true" size={18} stroke={1.75} />Revise package</> : <><IconPlus aria-hidden="true" size={18} stroke={1.75} />Create package</>}</button>}
      </div>
      {busy && permissions.canPropose && <p className="mt-3 text-sm text-[var(--muted-text)]">{upcoming ? <>An upcoming package starts {fmtDate(upcoming.effective_from)}. Only one can be scheduled at a time{permissions.canCancelUpcoming ? ', so cancel it to start another.' : '; an approver must cancel it before another can be started.'}</> : <>A revision is waiting for approval, so you can&apos;t start another until it&apos;s approved or returned.</>}</p>}
      {active && <PackageSummary row={active} currency={currencyOf(active.currency_code)} />}
    </section>

    {drafts.length > 0 && <section>
      <h2 className={`${heading} mb-3`}>Drafts</h2>
      <ul className={`${panel} divide-y divide-[var(--rule)]`}>
        {drafts.map((draft) => <DraftRow key={draft.id} draft={draft} currency={currencyOf(draft.currency_code)} canPropose={permissions.canPropose} submitOutcome={permissions.submitOutcome} blocked={busy} blockedReason={busyReason} onEdit={() => onStart(draft)} onChanged={onChanged} />)}
      </ul>
    </section>}

    </div>

    <aside aria-labelledby="history-heading" className="xl:sticky xl:top-8">
      <h2 id="history-heading" className={`${heading} mb-3`}>History</h2>
      {history.length ? <ul className={`${panel} divide-y divide-[var(--rule)]`}>
        {history.map((row) => { const money = moneyFor(currencyOf(row.currency_code)); return <li key={row.id} className="flex flex-col gap-1 px-5 py-4 text-sm">
          <span className="flex flex-wrap items-center gap-y-1"><span className="font-medium text-[var(--charcoal)]">{fmtDate(row.effective_from)} – {row.effective_to ? fmtDate(row.effective_to) : row.status === 'SCHEDULED' ? 'onwards' : 'present'}</span>{row.status === 'ACTIVE' && <span className="ml-2 rounded-full bg-[#E3F2EF] px-2 py-0.5 text-xs font-semibold text-[var(--jade-text)]">Current</span>}{row.status === 'SCHEDULED' && <span className="ml-2 rounded-full bg-[#FDF3DF] px-2 py-0.5 text-xs font-semibold text-[#7A5512]">Upcoming</span>}</span>
          <span><span className="font-semibold">{money(row.summary.annualCtc)}</span><span className="text-[var(--muted-text)]"> / year</span></span>
        </li>; })}
      </ul> : <p className={`${panel} px-5 py-6 text-sm text-[var(--muted-text)]`}>No packages have been applied yet.</p>}
    </aside>
  </div>;
}

export function PackageSummary({ row, currency, compareTo }: { row: Package; currency: Currency | undefined; compareTo?: Package | null }) {
  const money = moneyFor(currency);
  const before = compareTo?.summary;
  return <div className="mt-5">
    <dl className="grid gap-px overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-3 [&>div]:bg-[#FAFCFB] [&>div]:p-4">
      <div><dt className="text-xs text-[var(--muted-text)]">Annual CTC</dt><dd className="mt-1 font-[family-name:var(--font-manrope)] text-xl font-semibold">{money(row.summary.annualCtc)}<ChangeChip pct={change(row.summary.annualCtc, before?.annualCtc)} /></dd></div>
      <div><dt className="text-xs text-[var(--muted-text)]">Monthly CTC</dt><dd className="mt-1 font-[family-name:var(--font-manrope)] text-xl font-semibold">{money(row.summary.monthlyCtc)}</dd></div>
      <div><dt className="text-xs text-[var(--muted-text)]">Monthly gross</dt><dd className="mt-1 font-[family-name:var(--font-manrope)] text-xl font-semibold">{money(row.summary.monthlyGross)}</dd></div>
    </dl>
    <ul className="mt-4 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
      {row.items.map((item) => <li key={item.id} className="flex justify-between gap-4"><span className="text-[var(--muted-text)]">{item.definition.name}<span className="text-xs"> · {frequencyShort(item.frequency)}{item.calculation_type === 'PERCENTAGE_OF_BASE' ? ` · ${Number(item.percentage)}% of Basic` : ''}</span></span><span className="font-medium">{item.definition.category === 'EMPLOYEE_DEDUCTION' ? '−' : ''}{money(item.resolved_amount ?? item.resolved_monthly_amount)}{item.frequency && item.frequency !== 'MONTHLY' && item.frequency !== 'ONE_TIME' && <span className="text-xs font-normal text-[var(--muted-text)]"> each</span>}</span></li>)}
    </ul>
  </div>;
}

function UpcomingCard({ row, active, currency, canCancel, onChanged }: { row: Package; active: Package | null; currency: Currency | undefined; canCancel: boolean; onChanged: (outcome: string) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  async function cancel() {
    setWorking(true); setError('');
    try { await domain(`compensation/${row.id}/upcoming`, { method: 'DELETE', body: '{}' }); await onChanged('CANCELLED'); }
    catch (reason) { setError((reason as Error).message); setWorking(false); }
  }
  return <section className={`${panel} p-6`} aria-labelledby={`upcoming-${row.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id={`upcoming-${row.id}`} className={`${heading} flex items-center gap-2`}>Upcoming package<span className="rounded-full bg-[#FDF3DF] px-2 py-0.5 text-xs font-semibold text-[#7A5512]">Upcoming</span></h2>
        <p className="mt-1 text-sm text-[var(--muted-text)]">Becomes the current package on {fmtDate(row.effective_from)}{active ? `, replacing the package in effect since ${fmtDate(active.effective_from)}` : ''}.</p>
      </div>
      {canCancel && (confirm ? <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--muted-text)]">Cancel this upcoming package?</span>
        <button type="button" className={secondary} onClick={() => setConfirm(false)}>Keep</button>
        <button type="button" className="inline-flex h-10 items-center rounded-lg bg-[#B23A2C] px-4 text-sm font-semibold text-white hover:bg-[#962F23] disabled:opacity-50" disabled={working} onClick={() => void cancel()}>{working ? 'Cancelling…' : 'Cancel package'}</button>
      </div> : <button type="button" className={secondary} onClick={() => setConfirm(true)}><IconTrash aria-hidden="true" size={18} stroke={1.75} />Cancel upcoming</button>)}
    </div>
    <PackageSummary row={row} currency={currency} compareTo={active} />
    {error && <p role="alert" className="mt-3 text-sm font-medium text-[#9A3A2D]">{error}</p>}
  </section>;
}

function DraftRow({ draft, currency, canPropose, submitOutcome, blocked, blockedReason, onEdit, onChanged }: { draft: Package; currency: Currency | undefined; canPropose: boolean; submitOutcome: Permissions['submitOutcome']; blocked: boolean; blockedReason: string; onEdit: () => void; onChanged: (outcome: string) => Promise<void> }) {
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const money = moneyFor(currency);
  async function run(path: string, method: string, body: object) {
    setWorking(true); setError('');
    try { const result = await domain<{ outcome?: string }>(path, { method, body: JSON.stringify(body) }); await onChanged(result.outcome ?? 'DELETED'); }
    catch (reason) { setError((reason as Error).message); setWorking(false); }
  }
  return <li className="px-5 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm">
        <p className="font-medium text-[var(--charcoal)]">Draft · effective {fmtDate(draft.effective_from)} · {money(draft.summary.annualCtc)} / year</p>
        <ChangeRequests requests={draft.change_requests} note={draft.decision_note} compact />
      </div>
      {canPropose && <div className="flex flex-wrap gap-2">
        {confirmDelete ? <>
          <span className="self-center text-sm text-[var(--muted-text)]">Delete this draft?</span>
          <button type="button" className={secondary} onClick={() => setConfirmDelete(false)}>Keep</button>
          <button type="button" className="inline-flex h-10 items-center rounded-lg bg-[#B23A2C] px-4 text-sm font-semibold text-white hover:bg-[#962F23]" disabled={working} onClick={() => void run(`compensation/${draft.id}`, 'DELETE', { version: draft.version })}>Delete</button>
        </> : <>
          <button type="button" aria-label="Delete draft" className="inline-flex h-10 items-center rounded-lg px-3 text-[var(--muted-text)] hover:bg-[#FBEDEB] hover:text-[#9A3A2D]" onClick={() => setConfirmDelete(true)}><IconTrash aria-hidden="true" size={18} stroke={1.75} /></button>
          <button type="button" className={secondary} onClick={onEdit}>Continue editing</button>
          <button type="button" className={primary} disabled={working || blocked} title={blocked ? blockedReason : undefined} onClick={() => void run(`compensation/${draft.id}/submit`, 'POST', { version: draft.version })}>{submitOutcome === 'ACTIVE' ? 'Apply' : 'Submit for approval'}</button>
        </>}
      </div>}
    </div>
    {error && <p role="alert" className="mt-2 text-sm font-medium text-[#9A3A2D]">{error}</p>}
  </li>;
}

// ---------------------------------------------------------------- Wizard

const steps = ['Timing', 'Components', 'Review'] as const;

function Wizard({ initial, record, definitions, currencies, employeeId, onCancel, onDone }: { initial: Draft; record: Record_; definitions: Definition[]; currencies: Currency[]; employeeId: string; onCancel: () => void; onDone: (outcome: string) => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);
  // Each calculation is stored with the exact request it answers, so stale numbers are never shown.
  const [calculated, setCalculated] = useState<{ key: string; result: Preview } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState<'' | 'DRAFT' | 'SUBMIT'>('');
  const [raise, setRaise] = useState('');
  // The raise last applied, and the row values from just before it, so Undo is exact.
  const [applied, setApplied] = useState<{ pct: number; before: Row[] } | null>(null);
  const active = record.active;
  const currency = currencies.find((item) => item.code === draft.currencyCode);
  const money = moneyFor(currency);
  const byId = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const basicId = definitions.find((item) => item.is_basic)?.id;
  const outcome = record.permissions.submitOutcome;

  const timingErrors = (() => {
    const errors: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveFrom)) errors.effectiveFrom = 'Choose the date this package starts.';
    else if (active && draft.effectiveFrom <= active.effective_from.slice(0, 10)) errors.effectiveFrom = `Must be after ${fmtDate(active.effective_from)}, when the current package started.`;
    if (draft.effectiveTo && draft.effectiveTo < draft.effectiveFrom) errors.effectiveTo = 'End date must be on or after the start date.';
    if (!currency) errors.currency = 'Choose a currency.';
    return errors;
  })();

  const rowErrors = (() => {
    const errors: Record<string, string> = {};
    for (const row of draft.rows) {
      const isBasic = row.componentDefinitionId === basicId;
      if (byId.get(row.componentDefinitionId)?.is_active === false) errors[row.key] = 'This component has been deactivated. Remove it to continue.';
      else if (!row.value.trim()) errors[row.key] = isBasic ? 'Enter the monthly Basic Salary.' : 'Enter an amount or remove this component.';
      else if (!decimalPattern.test(row.value.trim())) errors[row.key] = 'Use a number with up to 4 decimal places, no commas.';
      else if (row.calculationType === 'PERCENTAGE_OF_BASE' && Number(row.value) > 1000) errors[row.key] = 'Percentage can be at most 1000.';
      else if (row.frequency === 'ONE_TIME' && byId.get(row.componentDefinitionId)?.category === 'EMPLOYEE_DEDUCTION') errors[row.key] = 'Deductions can\'t be one-time. Choose how often it is deducted.';
      else if (isBasic && Number(row.value) <= 0) errors[row.key] = 'Basic Salary must be more than zero.';
    }
    return errors;
  })();
  const missingBasic = !draft.rows.some((row) => row.componentDefinitionId === basicId);
  const componentsValid = !missingBasic && !Object.keys(rowErrors).length && draft.rows.length > 0;

  const body = useMemo(() => ({
    currencyCode: draft.currencyCode, effectiveFrom: draft.effectiveFrom, effectiveTo: draft.effectiveTo || null,
    items: draft.rows.map((row) => ({ componentDefinitionId: row.componentDefinitionId, calculationType: row.calculationType, frequency: row.frequency, fixedAmount: row.calculationType === 'FIXED' ? row.value.trim() : null, percentage: row.calculationType === 'PERCENTAGE_OF_BASE' ? row.value.trim() : null })),
  }), [draft]);
  const bodyKey = JSON.stringify(body);

  useEffect(() => {
    if (!componentsValid || !currency) return;
    let live = true;
    const timeout = setTimeout(() => {
      domain<Preview>('compensation/preview', { method: 'POST', body: JSON.stringify(body) })
        .then((result) => { if (live) { setCalculated({ key: bodyKey, result }); setPreviewError(''); } })
        .catch((reason: Error) => { if (live) { setCalculated(null); setPreviewError(reason.message); } });
    }, 250);
    return () => { live = false; clearTimeout(timeout); };
  }, [body, bodyKey, componentsValid, currency]);

  const preview = componentsValid && calculated?.key === bodyKey ? calculated.result : null;
  const calculating = componentsValid && !preview && !previewError;
  const calc = (id: string) => preview?.items.find((item) => item.componentDefinitionId === id);
  const resolved = (id: string) => calc(id)?.resolvedAmount;
  const prior = (id: string) => active?.items.find((item) => item.component_definition_id === id);
  // Compare like with like: yearly totals for recurring items, the payment itself for one-time items.
  const yearly = (item: { frequency: Frequency; annual: string; payment: string } | undefined) => item ? (item.frequency === 'ONE_TIME' ? item.payment : item.annual) : undefined;
  const nowYear = (id: string) => { const item = calc(id); return item ? yearly({ frequency: item.frequency, annual: item.annualAmount, payment: item.resolvedAmount }) : undefined; };
  const wasYear = (id: string) => { const item = prior(id); return item ? yearly({ frequency: item.frequency, annual: item.annual_amount, payment: item.resolved_amount }) : undefined; };
  const update = (key: string, change: Partial<Row>) => setDraft((current) => ({ ...current, rows: current.rows.map((row) => row.key === key ? { ...row, ...change } : row) }));
  const available = definitions.filter((item) => item.is_active && !draft.rows.some((row) => row.componentDefinitionId === item.id));

  // Raises are always calculated from the current package, never from values already in the form,
  // so applying 12% twice still means 12% over last year rather than compounding.
  function applyRaise() {
    const pct = Number(raise);
    if (!raise.trim() || !Number.isFinite(pct) || pct <= -100 || pct > 1000) return;
    const before = applied?.before ?? draft.rows;
    setDraft((current) => ({ ...current, rows: current.rows.map((row) => {
      const definition = byId.get(row.componentDefinitionId);
      const previous = active?.items.find((item) => item.component_definition_id === row.componentDefinitionId);
      if (definition?.category !== 'EARNING' || row.calculationType !== 'FIXED' || previous?.calculation_type !== 'FIXED' || !previous.fixed_amount) return row;
      return { ...row, value: (Math.round(Number(previous.fixed_amount) * (1 + pct / 100) * 100) / 100).toString() };
    }) }));
    setApplied({ pct, before });
    setRaise('');
  }
  function undoRaise() {
    if (!applied) return;
    setDraft((current) => ({ ...current, rows: applied.before }));
    setApplied(null);
  }

  function next() {
    setTouched(true);
    if (step === 0 && Object.keys(timingErrors).length) return;
    if (step === 1 && (!componentsValid || !preview)) return;
    setTouched(false); setServerError(''); setStep((value) => value + 1);
  }

  async function save(intent: 'DRAFT' | 'SUBMIT') {
    setSaving(intent); setServerError('');
    try {
      if (draft.id) {
        await domain(`compensation/${draft.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, version: draft.version }) });
        if (intent === 'SUBMIT') { const result = await domain<{ outcome: string }>(`compensation/${draft.id}/submit`, { method: 'POST', body: JSON.stringify({ version: draft.version! + 1, note: draft.note || undefined }) }); await onDone(result.outcome); }
        else await onDone('DRAFT');
      } else {
        const result = await domain<{ outcome: string }>(`employees/${employeeId}/compensation`, { method: 'POST', body: JSON.stringify({ ...body, status: intent, note: draft.note || undefined }) });
        await onDone(result.outcome);
      }
    } catch (reason) { setServerError((reason as Error).message); setSaving(''); }
  }

  const show = (message: string | undefined) => touched && message;

  return <section className={`${panel} overflow-hidden`} aria-labelledby="wizard-heading">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--rule)] px-6 py-5">
      <div>
        <h2 id="wizard-heading" className={heading}>{draft.id ? 'Edit draft' : active ? 'Revise package' : 'Create package'}</h2>
        <p className="mt-0.5 text-sm text-[var(--muted-text)]">{active && !draft.id ? 'Prefilled from the current package. Change only what needs to change.' : 'Fill in each step, then review before saving.'}</p>
      </div>
      <ol className="flex items-center gap-2 text-sm" aria-label="Steps">
        {steps.map((label, index) => <li key={label} className="flex items-center gap-2" aria-current={index === step ? 'step' : undefined}>
          <span className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${index < step ? 'bg-[var(--jade)] text-white' : index === step ? 'bg-[var(--deep-teal)] text-white' : 'bg-[#E8F0EE] text-[var(--muted-text)]'}`}>{index < step ? <IconCheck aria-hidden="true" size={14} stroke={2.5} /> : index + 1}</span>
          <span className={index === step ? 'font-semibold text-[var(--charcoal)]' : 'text-[var(--muted-text)]'}>{label}</span>
          {index < steps.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-[var(--rule)]" />}
        </li>)}
      </ol>
    </header>

    <div className="px-6 py-6">
      {serverError && <div className="mb-5"><Alert tone="error">{serverError}</Alert></div>}
      {step < 2 && <div className="mb-5"><ChangeRequests requests={draft.changeRequests} note={draft.returnNote} /></div>}
      {(draft.carriedOver?.length ?? 0) > 0 && step === 1 && <p className="mb-4 text-sm text-[var(--muted-text)]">{draft.carriedOver!.join(', ')} {draft.carriedOver!.length === 1 ? 'was a one-time payment' : 'were one-time payments'} in the current package and {draft.carriedOver!.length === 1 ? 'is' : 'are'} not repeated. Add {draft.carriedOver!.length === 1 ? 'it' : 'them'} again if this revision includes another one.</p>}
      {draft.removed.length > 0 && step < 2 && <div className="mb-5"><Alert tone="warn">{draft.removed.join(', ')} {draft.removed.length === 1 ? 'was' : 'were'} left out because {draft.removed.length === 1 ? 'it has' : 'they have'} been deactivated. Reactivate in Component definitions if {draft.removed.length === 1 ? 'it is' : 'they are'} still needed.</Alert></div>}

      {step === 0 && <div className="grid max-w-3xl gap-5 sm:grid-cols-3">
        <Field label="Effective from" error={show(timingErrors.effectiveFrom)} hint={active ? `Current package started ${fmtDate(active.effective_from)}` : undefined}>
          {(id, invalid) => <input id={id} type="date" value={draft.effectiveFrom} min={active ? nextDay(active.effective_from) : undefined} onChange={(event) => setDraft({ ...draft, effectiveFrom: event.target.value })} aria-invalid={invalid} className={`${field} ${invalid ? badBorder : okBorder}`} />}
        </Field>
        <Field label="Effective to (optional)" error={show(timingErrors.effectiveTo)} hint="Leave empty for an open-ended package">
          {(id, invalid) => <input id={id} type="date" value={draft.effectiveTo} min={draft.effectiveFrom} onChange={(event) => setDraft({ ...draft, effectiveTo: event.target.value })} aria-invalid={invalid} className={`${field} ${invalid ? badBorder : okBorder}`} />}
        </Field>
        <Field label="Currency" error={show(timingErrors.currency)}>
          {(id, invalid) => <select id={id} value={draft.currencyCode} onChange={(event) => setDraft({ ...draft, currencyCode: event.target.value })} aria-invalid={invalid} className={`${field} ${invalid ? badBorder : okBorder}`}>{currencies.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select>}
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <span className="self-center text-xs text-[var(--muted-text)]">Quick pick:</span>
          {[{ label: 'Start of next month', value: nextMonthStart(active?.effective_from) }, { label: 'Next financial year (1 April)', value: nextFinancialYear(active?.effective_from) }].map((option) => <button key={option.label} type="button" onClick={() => setDraft({ ...draft, effectiveFrom: option.value })} className={`rounded-full border px-3 py-1 text-xs font-medium ${draft.effectiveFrom === option.value ? 'border-[var(--deep-teal)] bg-[#E3F2EF] text-[var(--deep-teal)]' : 'border-[#B7CAC7] text-[var(--muted-text)] hover:text-[var(--deep-teal)]'}`}>{option.label} · {fmtDate(option.value)}</button>)}
        </div>
      </div>}

      {step === 1 && <div className="space-y-5">
        {active && <div className="flex flex-wrap items-end gap-3 rounded-xl bg-[#F4F8F7] p-4">
          <label className="text-sm font-medium text-[var(--charcoal)]">Raise over the current package
            <span className="mt-1.5 flex items-center gap-2"><input inputMode="decimal" value={raise} onChange={(event) => setRaise(event.target.value.replace('%', ''))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyRaise(); } }} placeholder={applied ? String(applied.pct) : 'e.g. 8'} aria-describedby="raise-help" className={`${field} ${okBorder} w-28`} /><span className="text-sm text-[var(--muted-text)]">%</span></span>
          </label>
          <button type="button" className={secondary} disabled={!raise.trim() || !Number.isFinite(Number(raise)) || Number(raise) <= -100} onClick={applyRaise}>{applied ? 'Change raise' : 'Apply raise'}</button>
          {applied && <p className="flex h-10 items-center gap-3 text-sm text-[var(--charcoal)]"><IconCircleCheck aria-hidden="true" size={18} stroke={1.75} className="text-[var(--jade)]" /><span><strong>{applied.pct}%</strong> applied to fixed earnings from the current package</span><button type="button" onClick={undoRaise} className="font-semibold text-[var(--deep-teal)] underline underline-offset-4">Undo</button></p>}
          <p id="raise-help" className="basis-full text-xs text-[var(--muted-text)]">Calculated from last year&apos;s fixed earnings (Basic, Special Allowance), so applying again replaces the raise instead of adding to it. Percentage components such as HRA and PF follow Basic automatically.</p>
        </div>}
        {missingBasic && touched && <Alert tone="error">Basic Salary is required. Add it from the list below.</Alert>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b border-[var(--rule)] text-xs text-[var(--muted-text)]"><th className="py-2 pr-3 font-medium">Component</th><th className="px-3 py-2 font-medium">Paid</th><th className="px-3 py-2 font-medium">Calculation</th><th className="px-3 py-2 font-medium">Per payment</th><th className="px-3 py-2 text-right font-medium">Per year</th><th className="px-3 py-2 text-right font-medium">Was / year</th><th className="w-10" /></tr></thead>
            <tbody className="divide-y divide-[var(--rule)]">
              {draft.rows.map((row) => {
                const definition = byId.get(row.componentDefinitionId);
                const isBasic = row.componentDefinitionId === basicId;
                const error = show(rowErrors[row.key]);
                const now = nowYear(row.componentDefinitionId), was = wasYear(row.componentDefinitionId), payment = resolved(row.componentDefinitionId);
                const sign = definition?.category === 'EMPLOYEE_DEDUCTION' ? '−' : '';
                const requested = draft.changeRequests?.find((request) => request.componentDefinitionId === row.componentDefinitionId);
                return <tr key={row.key} className={`align-top ${requested ? 'bg-[#FFF8F6]' : ''}`}>
                  <td className="py-3 pr-3"><p className="font-medium text-[var(--charcoal)]">{definition?.name ?? 'Unknown component'}</p><p className="text-xs text-[var(--muted-text)]">{definition ? categoryLabel[definition.category] : ''}{definition && !definition.is_active ? ' · inactive, remove it' : ''}</p>{requested && <p className="mt-1.5 max-w-56 text-xs font-medium text-[#9A3A2D]">Approver: {requested.note}</p>}</td>
                  <td className="px-3 py-3">{isBasic ? <span className="inline-flex h-10 items-center text-[var(--muted-text)]">Monthly</span> : <select aria-label={`How often ${definition?.name} is paid`} value={row.frequency} onChange={(event) => update(row.key, { frequency: event.target.value as Frequency })} className={`${field} ${okBorder} w-44`}>{frequencyOptions.filter((option) => option.value !== 'ONE_TIME' || definition?.category !== 'EMPLOYEE_DEDUCTION').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}</td>
                  <td className="px-3 py-3">{isBasic ? <span className="inline-flex h-10 items-center text-[var(--muted-text)]">Fixed</span> : <div role="radiogroup" aria-label={`${definition?.name} calculation`} className="inline-flex rounded-lg bg-[#E8F0EE] p-0.5">
                    {(['FIXED', 'PERCENTAGE_OF_BASE'] as const).map((type) => <button key={type} type="button" role="radio" aria-checked={row.calculationType === type} onClick={() => update(row.key, { calculationType: type, value: '' })} className={`h-9 rounded-md px-3 text-xs font-semibold ${row.calculationType === type ? 'bg-white text-[var(--deep-teal)] shadow-sm' : 'text-[var(--muted-text)]'}`}>{type === 'FIXED' ? 'Fixed' : '% of Basic'}</button>)}
                  </div>}</td>
                  <td className="px-3 py-3">
                    <div className="relative w-40">
                      {row.calculationType === 'FIXED' && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)]">{currency?.symbol}</span>}
                      <input aria-label={`${definition?.name} ${row.calculationType === 'FIXED' ? 'amount per payment' : 'percentage of Basic per payment'}`} inputMode="decimal" value={row.value} onChange={(event) => update(row.key, { value: event.target.value.replace(/,/g, '') })} onBlur={() => setTouched(true)} aria-invalid={!!error} className={`${field} ${error ? badBorder : okBorder} ${row.calculationType === 'FIXED' ? 'pl-8' : 'pr-8'}`} />
                      {row.calculationType === 'PERCENTAGE_OF_BASE' && <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-text)]">%</span>}
                    </div>
                    {row.calculationType === 'PERCENTAGE_OF_BASE' && payment && !error && <p className="mt-1 text-xs text-[var(--muted-text)]">= {money(payment)} per payment</p>}
                    {error && <p className="mt-1 text-xs font-medium text-[#9A3A2D]">{error}</p>}
                  </td>
                  <td className="px-3 py-3 text-right"><span className="inline-flex h-10 flex-col items-end justify-center font-semibold">{now ? <>{sign}{money(now)}{row.frequency === 'ONE_TIME' && <span className="text-xs font-normal text-[var(--muted-text)]">one-time, not in CTC</span>}</> : '—'}</span></td>
                  <td className="px-3 py-3 text-right text-[var(--muted-text)]"><span className="inline-flex h-10 items-center">{was ? money(was) : active ? 'New' : '—'}</span></td>
                  <td className="py-3 pl-1">{!isBasic && <button type="button" aria-label={`Remove ${definition?.name}`} onClick={() => setDraft({ ...draft, rows: draft.rows.filter((item) => item.key !== row.key) })} className="grid size-10 place-items-center rounded-lg text-[var(--muted-text)] hover:bg-[#FBEDEB] hover:text-[#9A3A2D]"><IconTrash aria-hidden="true" size={18} stroke={1.75} /></button>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {available.length > 0 && <label className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-text)]">Add component
          <select value="" onChange={(event) => { const definition = byId.get(event.target.value); if (definition) setDraft({ ...draft, rows: [...draft.rows, { key: newKey(), componentDefinitionId: definition.id, calculationType: 'FIXED', value: '', frequency: definition.default_frequency ?? 'MONTHLY' }] }); }} className={`${field} ${okBorder} w-auto`}>
            <option value="">Choose…</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name} ({categoryLabel[item.category]}{item.default_frequency && item.default_frequency !== 'MONTHLY' ? `, ${frequencyShort(item.default_frequency).toLowerCase()}` : ''})</option>)}
          </select>
        </label>}
        {previewError && <Alert tone="error">{previewError}</Alert>}
        <Totals preview={preview} calculating={calculating} active={active} money={money} />
      </div>}

      {step === 2 && <div className="space-y-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-[var(--muted-text)]">Effective</dt><dd className="mt-1 font-medium">{fmtDate(draft.effectiveFrom)}{draft.effectiveTo ? ` – ${fmtDate(draft.effectiveTo)}` : ' onward'}</dd></div>
          <div><dt className="text-[var(--muted-text)]">Currency</dt><dd className="mt-1 font-medium">{currency?.name}</dd></div>
          {active && <div><dt className="text-[var(--muted-text)]">Replaces</dt><dd className="mt-1 font-medium">Current package, ending {fmtDate(dayBefore(draft.effectiveFrom))}</dd></div>}
        </dl>
        <div className="overflow-x-auto rounded-xl border border-[var(--rule)]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead><tr className="border-b border-[var(--rule)] bg-[#F7FAF9] text-xs text-[var(--muted-text)]"><th className="px-4 py-2.5 font-medium">Component</th><th className="px-4 py-2.5 font-medium">Paid</th><th className="px-4 py-2.5 text-right font-medium">Current / year</th><th className="px-4 py-2.5 text-right font-medium">Proposed / year</th></tr></thead>
            <tbody className="divide-y divide-[var(--rule)]">
              {draft.rows.map((row) => { const now = nowYear(row.componentDefinitionId), was = wasYear(row.componentDefinitionId), payment = resolved(row.componentDefinitionId); return <tr key={row.key}><td className="px-4 py-2.5">{byId.get(row.componentDefinitionId)?.name}</td><td className="px-4 py-2.5 text-[var(--muted-text)]">{frequencyShort(row.frequency)}{row.frequency !== 'MONTHLY' && row.frequency !== 'ONE_TIME' && payment ? ` · ${money(payment)} each` : ''}{row.frequency === 'ONE_TIME' ? ' · not in CTC' : ''}</td><td className="px-4 py-2.5 text-right text-[var(--muted-text)]">{was ? money(was) : '—'}</td><td className="px-4 py-2.5 text-right font-medium">{now ? <>{money(now)}<ChangeChip pct={change(now, was)} /></> : <span className="text-[var(--muted-text)]">Calculating…</span>}</td></tr>; })}
              {active?.items.filter((item) => !draft.rows.some((row) => row.componentDefinitionId === item.component_definition_id)).map((item) => <tr key={item.id} className="text-[var(--muted-text)]"><td className={`px-4 py-2.5 ${item.frequency === 'ONE_TIME' ? '' : 'line-through'}`}>{item.definition.name}</td><td className="px-4 py-2.5">{frequencyShort(item.frequency)}</td><td className="px-4 py-2.5 text-right">{money(item.frequency === 'ONE_TIME' ? item.resolved_amount : item.annual_amount)}</td><td className="px-4 py-2.5 text-right">{item.frequency === 'ONE_TIME' ? 'Paid once, not repeated' : 'Removed'}</td></tr>)}
            </tbody>
          </table>
        </div>
        <Totals preview={preview} calculating={calculating} active={active} money={money} />
        <label className="block max-w-2xl text-sm font-medium text-[var(--charcoal)]">Reason for this change {outcome === 'PENDING_APPROVAL' ? <span className="font-normal text-[var(--muted-text)]">(shown to the approver)</span> : <span className="font-normal text-[var(--muted-text)]">(optional)</span>}
          <textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} maxLength={1000} rows={3} placeholder="For example: annual appraisal, promotion to Senior Engineer." className={`mt-2 w-full rounded-lg border bg-white p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)] ${okBorder}`} />
        </label>
        <Alert tone={outcome === 'ACTIVE' ? 'success' : 'warn'}>{outcome === 'ACTIVE'
          ? <>Your role can apply packages directly. Submitting {draft.effectiveFrom > new Date().toISOString().slice(0, 10) ? 'schedules this as the upcoming package; it becomes current on' : 'makes this the current package from'} <strong>{fmtDate(draft.effectiveFrom)}</strong>.</>
          : <>Your role&apos;s packages need approval. Submitting sends this to an approver; it takes effect from <strong>{fmtDate(draft.effectiveFrom)}</strong> once approved.</>}</Alert>
      </div>}
    </div>

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] bg-[#FAFCFB] px-6 py-4">
      <button type="button" className="text-sm font-semibold text-[var(--muted-text)] hover:text-[var(--charcoal)]" onClick={onCancel}>Cancel</button>
      <div className="flex flex-wrap gap-2">
        {step > 0 && <button type="button" className={secondary} onClick={() => { setStep(step - 1); setServerError(''); }}>Back</button>}
        {step === 2 && <button type="button" className={secondary} disabled={!!saving} onClick={() => void save('DRAFT')}>{saving === 'DRAFT' ? 'Saving…' : 'Save as draft'}</button>}
        {step < 2 ? <button type="button" className={primary} onClick={next} disabled={step === 1 && calculating}>{step === 1 && calculating ? 'Calculating…' : 'Continue'}</button>
          : <button type="button" className={primary} disabled={!!saving || !preview} onClick={() => void save('SUBMIT')}>{saving === 'SUBMIT' ? 'Submitting…' : outcome === 'ACTIVE' ? 'Apply package' : 'Submit for approval'}</button>}
      </div>
    </footer>
  </section>;
}

function Totals({ preview, calculating, active, money }: { preview: Preview | null; calculating?: boolean; active: Package | null; money: (value: string) => string }) {
  if (!preview) return <p className="rounded-xl bg-[#F4F8F7] px-4 py-3 text-sm text-[var(--muted-text)]" aria-live="polite">{calculating ? 'Calculating totals…' : 'Totals appear once every component has a valid value.'}</p>;
  const items: [string, string, string | undefined][] = [['Monthly gross', preview.monthlyGross, active?.summary.monthlyGross], ['Monthly CTC', preview.monthlyCtc, active?.summary.monthlyCtc], ['Annual CTC', preview.annualCtc, active?.summary.annualCtc]];
  const oneTime = Number(preview.oneTimePayments ?? 0) > 0;
  return <dl className="grid gap-px overflow-hidden rounded-xl bg-[var(--deep-teal)]/15 sm:grid-cols-3 [&>div]:bg-[var(--deep-teal)] [&>div]:p-4">
    {items.map(([label, value, before]) => <div key={label}>
      <dt className="text-xs text-[#B9D6D3]">{label}</dt>
      <dd className="mt-1 font-[family-name:var(--font-manrope)] text-xl font-semibold text-white">{money(value)}</dd>
      {before && <dd className="mt-0.5 text-xs text-[#B9D6D3]">was {money(before)}{(() => { const pct = change(value, before); return pct === null ? ' · no change' : ` · ${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`; })()}</dd>}
    </div>)}
    {oneTime && <div className="sm:col-span-3"><dt className="text-xs text-[#B9D6D3]">One-time payments (not part of CTC)</dt><dd className="mt-1 font-semibold text-white">{money(preview.oneTimePayments)}</dd></div>}
  </dl>;
}

function Field({ label, error, hint, children }: { label: string; error?: string | false; hint?: string; children: (id: string, invalid: boolean) => ReactNode }) {
  const id = `field-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--charcoal)]">{label}</label>
    {children(id, !!error)}
    {error ? <p className="mt-1.5 text-xs font-medium text-[#9A3A2D]">{error}</p> : hint && <p className="mt-1.5 text-xs text-[var(--muted-text)]">{hint}</p>}
  </div>;
}

function nextDay(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return new Date(date.getTime() + 86400000).toISOString().slice(0, 10);
}
function dayBefore(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return new Date(date.getTime() - 86400000).toISOString().slice(0, 10);
}
function nextFinancialYear(after?: string) {
  const now = new Date();
  let year = now.getUTCMonth() >= 3 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  while (after && `${year}-04-01` <= after.slice(0, 10)) year++;
  return `${year}-04-01`;
}
