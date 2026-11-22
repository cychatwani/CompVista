'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { IconAlertCircle, IconCircleCheck, IconLock, IconPencil, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import SidebarDemo from '@/components/sidebar-demo';
import { domain, frequencyOptions, frequencyShort, type Definition, type Frequency } from './api';

type Category = Definition['category'];
type Form = { id: string | null; name: string; code: string; codeEdited: boolean; category: Category; defaultFrequency: Frequency; isBasic: boolean };

const categoryLabel: Record<Category, string> = { EARNING: 'Earning', EMPLOYER_CONTRIBUTION: 'Employer contribution', EMPLOYEE_DEDUCTION: 'Employee deduction' };
const categoryHelp: Record<Category, string> = {
  EARNING: 'Paid to the employee. Counts toward gross pay and CTC.',
  EMPLOYER_CONTRIBUTION: 'Paid by the company on the employee’s behalf, such as Employer PF. Counts toward CTC.',
  EMPLOYEE_DEDUCTION: 'Withheld from the employee’s pay, such as Employee PF. Does not reduce CTC.',
};
const field = 'h-10 w-full rounded-lg border bg-white px-3 text-sm text-[var(--charcoal)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)] disabled:bg-[#F4F8F7] disabled:text-[var(--muted-text)]';
const okBorder = 'border-[#B7CAC7] focus-visible:border-[var(--deep-teal)]';
const badBorder = 'border-[#C8483A]';
const primary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--deep-teal)] px-4 text-sm font-semibold text-white hover:bg-[var(--teal)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';
const secondary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#B7CAC7] bg-white px-4 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';
const iconButton = 'grid size-9 place-items-center rounded-lg text-[var(--muted-text)] focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)] disabled:cursor-not-allowed disabled:opacity-40';
const panel = 'rounded-2xl border border-[var(--rule)] bg-white shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-12px_rgba(15,76,92,.12)]';

const codeFrom = (name: string) => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'C_$1').slice(0, 40);
const emptyForm = (): Form => ({ id: null, name: '', code: '', codeEdited: false, category: 'EARNING', defaultFrequency: 'MONTHLY', isBasic: false });

export function ComponentDefinitions() {
  const [definitions, setDefinitions] = useState<Definition[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('active');

  const refresh = useCallback(async () => {
    try { setDefinitions(await domain<Definition[]>('compensation/components')); setLoadError(''); }
    catch (reason) { setLoadError((reason as Error).message); }
  }, []);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  // Reload first so the list never shows the old value next to a success message.
  async function done(message: string) { await refresh(); setForm(null); setNotice(message); }
  const shown = (definitions ?? []).filter((item) => filter === 'all' || (filter === 'active' ? item.is_active : !item.is_active));
  const counts = { all: definitions?.length ?? 0, active: definitions?.filter((item) => item.is_active).length ?? 0, inactive: definitions?.filter((item) => !item.is_active).length ?? 0 };

  return <SidebarDemo title="Component definitions" subtitle="The building blocks of every package: what each component is, and how it is normally paid." back={{ href: '/app/compensation', label: 'All people' }}>
    <div className="mt-8 w-full space-y-6">
      {loadError && <Banner tone="error">{loadError}</Banner>}
      {notice && <Banner tone="success" onClose={() => setNotice('')}>{notice}</Banner>}

      {form ? <Editor form={form} definitions={definitions ?? []} onChange={setForm} onCancel={() => setForm(null)} onDone={done} /> : <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter components" className="flex gap-1 rounded-xl bg-[#E8F0EE] p-1">
          {(['active', 'inactive', 'all'] as const).map((value) => <button key={value} role="tab" aria-selected={filter === value} type="button" onClick={() => setFilter(value)} className={`flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium capitalize focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)] ${filter === value ? 'bg-white text-[var(--deep-teal)] shadow-[0_1px_2px_rgba(15,76,92,.12)]' : 'text-[var(--muted-text)] hover:text-[var(--deep-teal)]'}`}>{value}<span className="rounded-full bg-white/70 px-1.5 text-xs">{counts[value]}</span></button>)}
        </div>
        <button type="button" className={primary} onClick={() => { setNotice(''); setForm(emptyForm()); }}><IconPlus aria-hidden="true" size={18} stroke={1.75} />Add component</button>
      </div>}

      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-left text-sm tabular-nums">
          <caption className="sr-only">Compensation components</caption>
          <thead><tr className="border-b border-[var(--rule)] bg-[#F7FAF9] text-xs text-[var(--muted-text)]">
            <th scope="col" className="px-5 py-3 font-medium">Component</th><th scope="col" className="px-3 py-3 font-medium">Category</th><th scope="col" className="px-3 py-3 font-medium">Usually paid</th><th scope="col" className="px-3 py-3 font-medium">Usage</th><th scope="col" className="px-3 py-3 font-medium">Status</th><th scope="col" className="py-3 pl-3 pr-5 text-right font-medium">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {!definitions && !loadError && Array.from({ length: 5 }, (_, index) => <tr key={index}><td colSpan={6} className="px-5 py-3.5"><div className="h-6 rounded bg-[#EDF3F2] motion-safe:animate-pulse" /></td></tr>)}
            {shown.map((item) => <Row key={item.id} item={item} onEdit={() => { setNotice(''); setForm({ id: item.id, name: item.name, code: item.code, codeEdited: true, category: item.category, defaultFrequency: item.default_frequency ?? 'MONTHLY', isBasic: item.is_basic }); }} onDone={done} />)}
            {definitions && !shown.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--muted-text)]">{filter === 'inactive' ? 'No inactive components.' : 'No components yet. Add the first one.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted-text)]">“Usually paid” is the starting frequency when this component is added to a package; it can be changed per package. A component can be deactivated when no active or pending package uses it, and deleted once it is inactive.</p>
    </div>
  </SidebarDemo>;
}

function Row({ item, onEdit, onDone }: { item: Definition; onEdit: () => void; onDone: (message: string) => Promise<void> }) {
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const used = item.usage ?? 0;
  const live = item.liveUsage ?? 0;
  async function run(path: string, init: RequestInit, message: string) {
    setWorking(true); setError('');
    try { await domain(path, init); await onDone(message); }
    catch (reason) { setError((reason as Error).message); setWorking(false); setConfirm(null); }
  }
  const lockedReason = `In use by ${live} active or pending package${live === 1 ? '' : 's'}. It can be deactivated once those packages are revised without it.`;

  return <>
    <tr className={item.is_active ? 'hover:bg-[#F7FAF9]' : 'bg-[#FAFCFB] text-[var(--muted-text)]'}>
      <td className="px-5 py-3.5"><p className={`font-medium ${item.is_active ? 'text-[var(--charcoal)]' : ''}`}>{item.name}{item.is_basic && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[#E3F2EF] px-2 py-0.5 text-xs font-semibold text-[var(--jade-text)]"><IconLock aria-hidden="true" size={12} stroke={2} />Basic</span>}</p><p className="mt-0.5 font-mono text-xs text-[var(--muted-text)]">{item.code}</p></td>
      <td className="px-3 py-3.5">{categoryLabel[item.category]}</td>
      <td className="px-3 py-3.5">{frequencyShort(item.default_frequency)}</td>
      <td className="px-3 py-3.5">{live ? <span className="font-medium text-[var(--charcoal)]">In use · {live}</span> : used ? <span>Past packages only</span> : <span className="text-[var(--muted-text)]">Not used</span>}</td>
      <td className="px-3 py-3.5">{item.is_active ? <span className="rounded-full bg-[#E3F2EF] px-2 py-0.5 text-xs font-semibold text-[var(--jade-text)]">Active</span> : <span className="rounded-full bg-[#EDF1F2] px-2 py-0.5 text-xs font-semibold text-[var(--muted-text)]">Inactive</span>}</td>
      <td className="py-3.5 pl-3 pr-5"><div className="flex items-center justify-end gap-1">
        {item.is_active && <button type="button" aria-label={`Edit ${item.name}`} title="Edit" className={`${iconButton} hover:bg-[#EEF4F3] hover:text-[var(--deep-teal)]`} onClick={onEdit}><IconPencil aria-hidden="true" size={18} stroke={1.75} /></button>}
        {item.is_active && !item.is_basic && <button type="button" disabled={live > 0} title={live > 0 ? lockedReason : undefined} aria-describedby={live > 0 ? `locked-${item.id}` : undefined} className="h-9 rounded-lg px-3 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] disabled:cursor-not-allowed disabled:text-[var(--muted-text)] disabled:hover:bg-transparent" onClick={() => setConfirm('deactivate')}>Deactivate</button>}
        {!item.is_active && <button type="button" disabled={working} className="h-9 rounded-lg px-3 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3]" onClick={() => void run(`compensation/components/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, `${item.name} is active again.`)}>Activate</button>}
        {!item.is_active && <button type="button" aria-label={`Delete ${item.name}`} title="Delete" className={`${iconButton} hover:bg-[#FBEDEB] hover:text-[#9A3A2D]`} onClick={() => setConfirm('delete')}><IconTrash aria-hidden="true" size={18} stroke={1.75} /></button>}
      </div>{live > 0 && item.is_active && !item.is_basic && <span id={`locked-${item.id}`} className="sr-only">{lockedReason}</span>}</td>
    </tr>

    {confirm && <tr className="bg-[#F7FAF9]"><td colSpan={6} className="px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-[var(--charcoal)]">{confirm === 'delete'
          ? <>Delete <strong>{item.name}</strong>?{used ? ' Past packages that used it keep their history.' : ''} This can’t be undone.</>
          : <>Deactivate <strong>{item.name}</strong>? It won’t be offered for new packages.</>}</p>
        <div className="flex gap-2">
          <button type="button" className="h-9 rounded-lg px-3 text-sm font-semibold text-[var(--muted-text)] hover:bg-[#EEF4F3]" onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" disabled={working} className={`h-9 rounded-lg px-3 text-sm font-semibold text-white ${confirm === 'delete' ? 'bg-[#B23A2C] hover:bg-[#962F23]' : 'bg-[var(--deep-teal)] hover:bg-[var(--teal)]'}`} onClick={() => void (confirm === 'delete'
            ? run(`compensation/components/${item.id}`, { method: 'DELETE' }, `${item.name} was deleted.`)
            : run(`compensation/components/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: false }) }, `${item.name} was deactivated.`))}>{working ? 'Working…' : confirm === 'delete' ? 'Delete' : 'Deactivate'}</button>
        </div>
      </div>
    </td></tr>}

    {error && <tr><td colSpan={6} className="px-5 pb-3"><p role="alert" className="text-sm font-medium text-[#9A3A2D]">{error}</p></td></tr>}
  </>;
}

function Editor({ form, definitions, onChange, onCancel, onDone }: { form: Form; definitions: Definition[]; onChange: (form: Form) => void; onCancel: () => void; onDone: (message: string) => Promise<void> }) {
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const editing = !!form.id;
  const errors: Partial<Record<'name' | 'code', string>> = {};
  if (!form.name.trim()) errors.name = 'Enter a name, for example “Diwali Bonus”.';
  if (!editing) {
    if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(form.code)) errors.code = 'Start with a letter; use capital letters, numbers, and underscores.';
    else if (definitions.some((item) => item.code === form.code)) errors.code = `${form.code} is already used by another component.`;
  }
  const options = frequencyOptions.filter((option) => (form.isBasic ? option.value === 'MONTHLY' : option.value !== 'ONE_TIME' || form.category !== 'EMPLOYEE_DEDUCTION'));

  async function save() {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSaving(true); setServerError('');
    try {
      if (editing) await domain(`compensation/components/${form.id}`, { method: 'PATCH', body: JSON.stringify({ name: form.name.trim(), defaultFrequency: form.defaultFrequency }) });
      else await domain('compensation/components', { method: 'POST', body: JSON.stringify({ name: form.name.trim(), code: form.code, category: form.category, defaultFrequency: form.defaultFrequency }) });
      await onDone(editing ? `${form.name.trim()} was updated.` : `${form.name.trim()} was added. It's now available in the package wizard.`);
    } catch (reason) { setServerError((reason as Error).message); setSaving(false); }
  }
  const show = (key: 'name' | 'code') => touched && errors[key];

  return <section className={`${panel} p-6`} aria-labelledby="editor-heading">
    <div className="flex items-start justify-between gap-3">
      <div><h2 id="editor-heading" className="font-[family-name:var(--font-manrope)] text-lg font-semibold text-[var(--charcoal)]">{editing ? `Edit ${form.name || 'component'}` : 'Add component'}</h2>
        <p className="mt-0.5 text-sm text-[var(--muted-text)]">{editing ? 'Code and category are fixed once a component exists, so past packages stay consistent.' : 'Available in every new package once added.'}</p></div>
      <button type="button" aria-label="Close" onClick={onCancel} className={`${iconButton} hover:bg-[#EEF4F3]`}><IconX aria-hidden="true" size={18} /></button>
    </div>
    {serverError && <div className="mt-4"><Banner tone="error">{serverError}</Banner></div>}
    <form className="mt-5 grid gap-5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }} noValidate>
      <Field id="component-name" label="Name" error={show('name')}>
        <input id="component-name" autoFocus value={form.name} maxLength={80} onChange={(event) => onChange({ ...form, name: event.target.value, code: editing || form.codeEdited ? form.code : codeFrom(event.target.value) })} placeholder="Diwali Bonus" aria-invalid={!!show('name')} className={`${field} ${show('name') ? badBorder : okBorder}`} />
      </Field>
      <Field id="component-code" label="Code" error={show('code')} hint={editing ? 'Fixed after creation' : 'Generated from the name; you can change it'}>
        <input id="component-code" value={form.code} disabled={editing} maxLength={40} onChange={(event) => onChange({ ...form, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''), codeEdited: true })} aria-invalid={!!show('code')} className={`${field} font-mono ${show('code') ? badBorder : okBorder}`} />
      </Field>
      <Field id="component-category" label="Category" hint={categoryHelp[form.category]}>
        <select id="component-category" value={form.category} disabled={editing} onChange={(event) => { const category = event.target.value as Category; onChange({ ...form, category, defaultFrequency: category === 'EMPLOYEE_DEDUCTION' && form.defaultFrequency === 'ONE_TIME' ? 'MONTHLY' : form.defaultFrequency }); }} className={`${field} ${okBorder}`}>
          {(Object.keys(categoryLabel) as Category[]).map((value) => <option key={value} value={value}>{categoryLabel[value]}</option>)}
        </select>
      </Field>
      <Field id="component-frequency" label="Usually paid" hint={form.isBasic ? 'Basic Salary is always monthly.' : form.defaultFrequency === 'ONE_TIME' ? 'Paid once; shown outside CTC.' : 'Starting frequency in the package wizard; can be changed per package.'}>
        <select id="component-frequency" value={form.defaultFrequency} disabled={form.isBasic} onChange={(event) => onChange({ ...form, defaultFrequency: event.target.value as Frequency })} className={`${field} ${okBorder}`}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className={primary} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add component'}</button>
        <button type="button" className={secondary} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  </section>;
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string | false; hint?: string; children: ReactNode }) {
  return <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--charcoal)]">{label}</label>
    {children}
    {error ? <p className="mt-1.5 text-xs font-medium text-[#9A3A2D]">{error}</p> : hint && <p className="mt-1.5 text-xs text-[var(--muted-text)]">{hint}</p>}
  </div>;
}

function Banner({ tone, children, onClose }: { tone: 'error' | 'success'; children: ReactNode; onClose?: () => void }) {
  const Icon = tone === 'error' ? IconAlertCircle : IconCircleCheck;
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-[#F0C9C4] bg-[#FDF6F5] text-[#7A2A20]' : 'border-[#BFE0D9] bg-[#F0F8F6] text-[#1D5E55]'}`}>
    <Icon aria-hidden="true" size={18} stroke={1.75} className="mt-0.5 shrink-0" /><div className="flex-1">{children}</div>
    {onClose && <button type="button" aria-label="Dismiss" onClick={onClose} className="rounded p-0.5 opacity-70 hover:opacity-100"><IconX aria-hidden="true" size={16} /></button>}
  </div>;
}
