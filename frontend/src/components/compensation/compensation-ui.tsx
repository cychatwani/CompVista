'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import SidebarDemo from '@/components/sidebar-demo';
import { domain, formatMoney, type Currency, type Definition, type EmployeeRecord, type Package, type Summary } from './api';

const field = 'w-full rounded-lg border border-[#B7CAC7] bg-white px-3 py-2.5 text-sm text-[var(--charcoal)] outline-none focus-visible:border-[var(--deep-teal)] focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)]';
const primary = 'rounded-lg bg-[var(--deep-teal)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--teal)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';
const secondary = 'rounded-lg border border-[#B7CAC7] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';

export function CompensationDirectory() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void domain<EmployeeRecord[]>('employees').then(setEmployees).catch((reason) => setError(reason.message)); }, []);
  return <SidebarDemo title="Compensation" subtitle="Manage employee packages and component definitions.">
    <div className="mt-8 max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Employees</h2><Link className={secondary} href="/app/compensation/components">Component definitions</Link></div>
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      <div className="divide-y divide-[#DAE5E3] border-y border-[#DAE5E3]">
        {employees.map((employee) => <Link key={employee.id} href={`/app/employees/${employee.id}/compensation`} className="flex items-center justify-between gap-4 py-4 text-sm hover:text-[var(--deep-teal)] focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)]"><span className="font-medium">{employee.displayName}</span><span aria-hidden="true">View compensation →</span></Link>)}
        {!error && employees.length === 0 && <p className="py-6 text-sm text-[var(--muted-text)]">No employees are available.</p>}
      </div>
    </div>
  </SidebarDemo>;
}

const componentSchema = z.object({ code: z.string().regex(/^[A-Z][A-Z0-9_]*$/, 'Use uppercase letters, numbers, and underscores'), name: z.string().trim().min(1), category: z.enum(['EARNING', 'EMPLOYER_CONTRIBUTION', 'EMPLOYEE_DEDUCTION']) });
type ComponentForm = z.infer<typeof componentSchema>;
const categoryLabel: Record<Definition['category'], string> = { EARNING: 'Earning', EMPLOYER_CONTRIBUTION: 'Employer contribution', EMPLOYEE_DEDUCTION: 'Employee deduction' };

export function ComponentDefinitions() {
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const form = useForm<ComponentForm>({ resolver: zodResolver(componentSchema), defaultValues: { code: '', name: '', category: 'EARNING' } });
  const refresh = useCallback(() => domain<Definition[]>('compensation/components').then(setDefinitions).catch((reason) => setError(reason.message)), []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function create(values: ComponentForm) {
    setError('');
    try { await domain('compensation/components', { method: 'POST', body: JSON.stringify(values) }); form.reset(); await refresh(); }
    catch (reason) { setError((reason as Error).message); }
  }
  async function update(id: string, change: { name?: string; isActive?: boolean }) {
    setError('');
    try { await domain(`compensation/components/${id}`, { method: 'PATCH', body: JSON.stringify(change) }); setEditing(null); await refresh(); }
    catch (reason) { setError((reason as Error).message); }
  }
  return <SidebarDemo title="Component definitions" subtitle="Reusable components for your organization.">
    <div className="mt-8 max-w-5xl space-y-8">
      <Link href="/app/compensation" className="text-sm font-semibold text-[var(--deep-teal)] underline underline-offset-4">← All compensation</Link>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="border-b border-[#DAE5E3] text-[var(--muted-text)]"><tr><th className="py-3 font-medium">Component</th><th className="py-3 font-medium">Code</th><th className="py-3 font-medium">Category</th><th className="py-3 font-medium">Status</th><th className="py-3 font-medium">Actions</th></tr></thead><tbody className="divide-y divide-[#DAE5E3]">{definitions.map((definition) => <tr key={definition.id}><td className="py-4 font-medium">{editing === definition.id ? <input aria-label="Component name" className={field} value={name} onChange={(event) => setName(event.target.value)} /> : definition.name}{definition.is_basic && <span className="ml-2 text-xs text-[var(--teal)]">Basic</span>}</td><td className="py-4">{definition.code}</td><td className="py-4">{categoryLabel[definition.category]}</td><td className="py-4">{definition.is_active ? 'Active' : 'Inactive'}</td><td className="py-4"><div className="flex gap-3">{editing === definition.id ? <button className="font-semibold text-[var(--deep-teal)]" onClick={() => void update(definition.id, { name })}>Save</button> : <button className="font-semibold text-[var(--deep-teal)]" onClick={() => { setEditing(definition.id); setName(definition.name); }}>Rename</button>}{!definition.is_basic && <button className="font-semibold text-[var(--deep-teal)]" onClick={() => void update(definition.id, { isActive: !definition.is_active })}>{definition.is_active ? 'Deactivate' : 'Reactivate'}</button>}</div></td></tr>)}</tbody></table></div>
      <form onSubmit={form.handleSubmit(create)} className="grid gap-4 border-t border-[#DAE5E3] pt-6 sm:grid-cols-3"><h2 className="sm:col-span-3 text-lg font-semibold">Add component</h2><label className="text-sm font-medium">Code<input className={`${field} mt-2`} {...form.register('code')} placeholder="BONUS" />{form.formState.errors.code && <span className="text-red-700">{form.formState.errors.code.message}</span>}</label><label className="text-sm font-medium">Name<input className={`${field} mt-2`} {...form.register('name')} placeholder="Bonus" />{form.formState.errors.name && <span className="text-red-700">Name is required</span>}</label><label className="text-sm font-medium">Category<select className={`${field} mt-2`} {...form.register('category')}><option value="EARNING">Earning</option><option value="EMPLOYER_CONTRIBUTION">Employer contribution</option><option value="EMPLOYEE_DEDUCTION">Employee deduction</option></select></label><div className="sm:col-span-3"><button type="submit" disabled={form.formState.isSubmitting} className={primary}>Add component</button></div></form>
    </div>
  </SidebarDemo>;
}

const editorSchema = z.object({ currencyCode: z.string().length(3), effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), items: z.array(z.object({ componentDefinitionId: z.string().min(1), calculationType: z.enum(['FIXED', 'PERCENTAGE_OF_BASE']), fixedAmount: z.string().optional(), percentage: z.string().optional() })).min(1) });
type EditorForm = z.infer<typeof editorSchema>;
type Preview = Summary & { items: { componentDefinitionId: string; resolvedMonthlyAmount: string }[] };

export function EmployeeCompensation({ employeeId }: { employeeId: string }) {
  const [record, setRecord] = useState<{ employee: EmployeeRecord; active: Package | null; drafts: Package[] } | null>(null);
  const [history, setHistory] = useState<Package[]>([]);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [editingDraft, setEditingDraft] = useState<Package | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const form = useForm<EditorForm>({ resolver: zodResolver(editorSchema), defaultValues: { currencyCode: 'INR', effectiveFrom: new Date().toISOString().slice(0, 10), items: [] } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  const values = useWatch({ control: form.control });
  const refresh = useCallback(async () => {
    try {
      const [current, past, componentList, currencyList] = await Promise.all([
        domain<{ employee: EmployeeRecord; active: Package | null; drafts: Package[] }>(`employees/${employeeId}/compensation`),
        domain<Package[]>(`employees/${employeeId}/compensation/history`),
        domain<Definition[]>('compensation/components'), domain<Currency[]>('currencies'),
      ]);
      setRecord(current); setHistory(past); setDefinitions(componentList); setCurrencies(currencyList); setError('');
    } catch (reason) { setError((reason as Error).message); }
  }, [employeeId]);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);
  useEffect(() => {
    if (!editorOpen || !values.items?.length) { queueMicrotask(() => setPreview(null)); return; }
    let active = true;
    queueMicrotask(() => { if (active) setPreview(null); });
    const timeout = setTimeout(() => {
      void domain<Preview>('compensation/preview', { method: 'POST', body: JSON.stringify(values) }).then((result) => { if (active) { setPreview(result); setPreviewError(''); } }).catch((reason) => { if (active) { setPreview(null); setPreviewError(reason.message); } });
    }, 250);
    return () => { active = false; clearTimeout(timeout); };
  }, [editorOpen, values]);
  function begin(draft?: Package) {
    setEditingDraft(draft ?? null); setPreview(null); setPreviewError(''); setError('');
    form.reset(draft ? { currencyCode: draft.currency_code, effectiveFrom: draft.effective_from.slice(0, 10), items: draft.items.map((item) => ({ componentDefinitionId: item.component_definition_id, calculationType: item.calculation_type, fixedAmount: item.fixed_amount ?? '', percentage: item.percentage ?? '' })) } : { currencyCode: 'INR', effectiveFrom: new Date().toISOString().slice(0, 10), items: definitions.filter((item) => item.is_basic).map((item) => ({ componentDefinitionId: item.id, calculationType: 'FIXED', fixedAmount: '', percentage: '' })) });
    setEditorOpen(true);
  }
  async function save(valuesToSave: EditorForm, status: 'DRAFT' | 'ACTIVE') {
    setError('');
    const body = { currencyCode: valuesToSave.currencyCode, effectiveFrom: valuesToSave.effectiveFrom, items: valuesToSave.items.map((item) => ({ componentDefinitionId: item.componentDefinitionId, calculationType: item.calculationType, fixedAmount: item.calculationType === 'FIXED' ? item.fixedAmount : null, percentage: item.calculationType === 'PERCENTAGE_OF_BASE' ? item.percentage : null })) };
    try {
      if (editingDraft) await domain(`compensation/${editingDraft.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, version: editingDraft.version }) });
      else await domain(`employees/${employeeId}/compensation`, { method: 'POST', body: JSON.stringify({ ...body, status }) });
      setEditorOpen(false); setEditingDraft(null); await refresh();
    } catch (reason) { setError((reason as Error).message); }
  }
  async function deleteDraft(draft: Package) {
    try { await domain(`compensation/${draft.id}`, { method: 'DELETE', body: JSON.stringify({ version: draft.version }) }); await refresh(); }
    catch (reason) { setError((reason as Error).message); }
  }
  const activeDefinitions = definitions.filter((item) => item.is_active);
  return <SidebarDemo title={record?.employee.displayName ?? 'Employee compensation'} subtitle={record?.employee.organization?.name ?? 'Compensation package'}>
    <div className="mt-8 max-w-6xl space-y-8">
      <Link href="/app/compensation" className="text-sm font-semibold text-[var(--deep-teal)] underline underline-offset-4">← All employees</Link>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {record?.active ? <section><h2 className="mb-4 text-lg font-semibold">Current compensation</h2><PackageView row={record.active} currency={currencies.find((item) => item.code === record.active?.currency_code)} /></section> : <p className="text-sm text-[var(--muted-text)]">No active compensation package yet.</p>}
      <section><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Drafts</h2><button className={primary} onClick={() => begin()}>New package</button></div>{record?.drafts.length ? <div className="space-y-3">{record.drafts.map((draft) => <div key={draft.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DAE5E3] py-3 text-sm"><span>Draft · {draft.currency_code} · effective {draft.effective_from.slice(0, 10)} · version {draft.version}</span><div className="flex gap-3"><button className="font-semibold text-[var(--deep-teal)]" onClick={() => begin(draft)}>Edit</button><button className="font-semibold text-red-700" onClick={() => void deleteDraft(draft)}>Delete</button></div></div>)}</div> : <p className="text-sm text-[var(--muted-text)]">No drafts saved.</p>}</section>
      {editorOpen && <section className="border-t border-[#DAE5E3] pt-7"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-semibold">{editingDraft ? 'Edit draft' : 'New package'}</h2><button className={secondary} onClick={() => setEditorOpen(false)}>Close editor</button></div><form className="space-y-6" onSubmit={form.handleSubmit((data) => save(data, 'DRAFT'))}><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Currency<select className={`${field} mt-2`} {...form.register('currencyCode')}>{currencies.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label><label className="text-sm font-medium">Effective from<input type="date" className={`${field} mt-2`} {...form.register('effectiveFrom')} /></label></div><div className="space-y-3"><h3 className="font-semibold">Components</h3>{fields.map((row, index) => { const selected = definitions.find((item) => item.id === values.items?.[index]?.componentDefinitionId); return <div key={row.id} className="grid gap-3 border-b border-[#DAE5E3] pb-4 sm:grid-cols-[2fr_1fr_1fr_auto]"><label className="text-sm">Component<select className={`${field} mt-1`} {...form.register(`items.${index}.componentDefinitionId`)}>{activeDefinitions.filter((item) => item.id === selected?.id || !values.items?.some((chosen, position) => position !== index && chosen.componentDefinitionId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}{selected && !selected.is_active && <option value={selected.id}>{selected.name} (inactive)</option>}</select></label><label className="text-sm">Calculation<select className={`${field} mt-1`} {...form.register(`items.${index}.calculationType`)}><option value="FIXED">Fixed monthly</option><option value="PERCENTAGE_OF_BASE">% of Basic</option></select></label><label className="text-sm">{values.items?.[index]?.calculationType === 'PERCENTAGE_OF_BASE' ? 'Percentage (0–1000)' : 'Monthly amount'}<input inputMode="decimal" className={`${field} mt-1`} {...form.register(values.items?.[index]?.calculationType === 'PERCENTAGE_OF_BASE' ? `items.${index}.percentage` : `items.${index}.fixedAmount`)} /></label><button type="button" className="self-end py-2 text-sm font-semibold text-red-700 disabled:opacity-50" disabled={selected?.is_basic} onClick={() => remove(index)}>Remove</button></div>; })}<button type="button" className={secondary} onClick={() => { const next = activeDefinitions.find((item) => !values.items?.some((row) => row.componentDefinitionId === item.id)); if (next) append({ componentDefinitionId: next.id, calculationType: 'FIXED', fixedAmount: '', percentage: '' }); }} disabled={activeDefinitions.every((item) => values.items?.some((row) => row.componentDefinitionId === item.id))}>Add component</button></div>{previewError && <p role="status" className="text-sm text-red-700">{previewError}</p>}{preview && <div className="border-y border-[#DAE5E3] py-5"><h3 className="mb-3 font-semibold">Live preview</h3><div className="grid gap-2 text-sm sm:grid-cols-2">{preview.items.map((item) => <p key={item.componentDefinitionId}>{definitions.find((definition) => definition.id === item.componentDefinitionId)?.name}: <strong>{formatMoney(item.resolvedMonthlyAmount, currencies.find((entry) => entry.code === values.currencyCode))}</strong></p>)}</div><p className="mt-4 font-semibold">Monthly gross {formatMoney(preview.monthlyGross, currencies.find((entry) => entry.code === values.currencyCode))} · Annual CTC {formatMoney(preview.annualCtc, currencies.find((entry) => entry.code === values.currencyCode))}</p></div>}<div className="flex flex-wrap gap-3"><button type="submit" className={primary} disabled={form.formState.isSubmitting || !preview}>{editingDraft ? 'Save draft changes' : 'Save draft'}</button>{!editingDraft && !record?.active && history.length === 0 && <button type="button" className={secondary} disabled={form.formState.isSubmitting || !preview} onClick={() => void form.handleSubmit((data) => save(data, 'ACTIVE'))()}>Create initial active package</button>}</div></form></section>}
      <section className="border-t border-[#DAE5E3] pt-7"><h2 className="mb-4 text-lg font-semibold">Applied history</h2>{history.length ? <div className="space-y-5">{history.map((row) => <PackageView key={row.id} row={row} currency={currencies.find((item) => item.code === row.currency_code)} />)}</div> : <p className="text-sm text-[var(--muted-text)]">No applied packages yet.</p>}</section>
    </div>
  </SidebarDemo>;
}

function PackageView({ row, currency }: { row: Package; currency: Currency | undefined }) {
  return <div className="border-y border-[#DAE5E3] py-5"><p className="mb-4 text-sm text-[var(--muted-text)]">{row.status} · {row.currency_code} · effective {row.effective_from.slice(0, 10)} · version {row.version}</p><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-[var(--muted-text)]">Monthly gross</p><p className="mt-1 text-xl font-semibold">{formatMoney(row.summary.monthlyGross, currency)}</p></div><div><p className="text-sm text-[var(--muted-text)]">Monthly CTC</p><p className="mt-1 text-xl font-semibold">{formatMoney(row.summary.monthlyCtc, currency)}</p></div><div><p className="text-sm text-[var(--muted-text)]">Annualized CTC</p><p className="mt-1 text-xl font-semibold">{formatMoney(row.summary.annualCtc, currency)}</p></div></div><div className="mt-5 divide-y divide-[#DAE5E3]">{row.items.map((item) => <div key={item.id} className="flex justify-between gap-4 py-2 text-sm"><span>{item.definition.name} <span className="text-[var(--muted-text)]">({categoryLabel[item.definition.category]})</span></span><span className="font-medium">{formatMoney(item.resolved_monthly_amount, currency)}</span></div>)}</div><p className="mt-3 text-sm text-[var(--muted-text)]">Employer contributions {formatMoney(row.summary.monthlyEmployerContributions, currency)} · Employee deductions {formatMoney(row.summary.monthlyEmployeeDeductions, currency)}</p></div>;
}
