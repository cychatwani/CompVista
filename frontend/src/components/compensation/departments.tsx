'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconAlertCircle, IconCircleCheck, IconPlus, IconX } from '@tabler/icons-react';
import SidebarDemo from '@/components/sidebar-demo';
import { domain } from './api';

type Department = { id: string; name: string; code: string; description: string | null; is_active: boolean; employees: number };
type Form = { id: string | null; name: string; code: string; description: string };

const field = 'h-10 w-full rounded-lg border border-[#B7CAC7] bg-white px-3 text-sm text-[var(--charcoal)] outline-none focus-visible:border-[var(--deep-teal)] focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)]';
const primary = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--deep-teal)] px-4 text-sm font-semibold text-white hover:bg-[var(--teal)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]';
const secondary = 'inline-flex h-9 items-center justify-center rounded-lg border border-[#B7CAC7] bg-white px-3 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)]';
const codeFrom = (name: string) => name.toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);

export function Departments() {
  const [rows, setRows] = useState<Department[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try { setRows(await domain<Department[]>('departments')); setError(''); }
    catch (reason) { setError((reason as Error).message); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function save() {
    if (!form) return;
    setSaving(true); setError('');
    try {
      if (form.id) await domain(`departments/${form.id}`, { method: 'PATCH', body: JSON.stringify({ name: form.name, description: form.description || null }) });
      else await domain('departments', { method: 'POST', body: JSON.stringify({ name: form.name, code: form.code, description: form.description || null }) });
      await load();
      setNotice(form.id ? `${form.name} updated.` : `${form.name} added.`);
      setForm(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }
  async function toggle(row: Department) {
    setError('');
    try {
      await domain(`departments/${row.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !row.is_active }) });
      await load();
      setNotice(row.is_active ? `${row.name} deactivated. Its ${row.employees.toLocaleString('en-US')} people keep the assignment; new assignments are blocked.` : `${row.name} reactivated.`);
    } catch (reason) { setError((reason as Error).message); }
  }

  return <SidebarDemo title="Departments" subtitle="Business units people belong to. Used in the directory, profiles, and analytics." back={{ href: '/app/compensation', label: 'All people' }}
    actions={!form && <button type="button" className={primary} onClick={() => { setNotice(''); setForm({ id: null, name: '', code: '', description: '' }); }}><IconPlus aria-hidden="true" size={18} stroke={1.75} />Add department</button>}>
    <div className="mt-8 w-full space-y-6">
      {error && <div role="alert" className="flex items-center gap-3 rounded-xl border border-[#F0C9C4] bg-[#FDF6F5] px-4 py-3 text-sm text-[#7A2A20]"><IconAlertCircle aria-hidden="true" size={18} stroke={1.75} />{error}</div>}
      {notice && <div role="status" className="flex items-center gap-3 rounded-xl border border-[#BFE0D9] bg-[#F0F8F6] px-4 py-3 text-sm text-[#1D5E55]"><IconCircleCheck aria-hidden="true" size={18} stroke={1.75} /><span className="flex-1">{notice}</span><button type="button" aria-label="Dismiss" onClick={() => setNotice('')}><IconX aria-hidden="true" size={16} /></button></div>}

      {form && <section aria-labelledby="department-form" className="rounded-2xl border border-[var(--rule)] bg-white p-6 shadow-[0_1px_2px_rgba(15,76,92,.04)]">
        <h2 id="department-form" className="font-[family-name:var(--font-manrope)] text-base font-semibold">{form.id ? 'Edit department' : 'New department'}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_14rem_1.5fr]">
          <label className="text-sm font-medium">Name<input autoFocus value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value, code: form.id ? form.code : codeFrom(event.target.value) })} className={`${field} mt-1.5`} /></label>
          <label className="text-sm font-medium">Code<input value={form.code} disabled={!!form.id} maxLength={32} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className={`${field} mt-1.5 font-mono disabled:bg-[#F4F8F7] disabled:text-[var(--muted-text)]`} />
            <span className="mt-1 block text-xs font-normal text-[var(--muted-text)]">{form.id ? 'Codes never change.' : 'Capital letters, numbers, underscores.'}</span></label>
          <label className="text-sm font-medium">Description <span className="font-normal text-[var(--muted-text)]">(optional)</span><input value={form.description} maxLength={500} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${field} mt-1.5`} /></label>
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" className={secondary} onClick={() => { setForm(null); setError(''); }}>Cancel</button>
          <button type="button" className={primary} disabled={saving || !form.name.trim() || !form.code} onClick={() => void save()}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Add department'}</button>
        </div>
      </section>}

      <div className="overflow-hidden rounded-2xl border border-[var(--rule)] bg-white shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-12px_rgba(15,76,92,.12)]">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Departments</caption>
          <thead><tr className="border-b border-[var(--rule)] bg-[#F7FAF9] text-xs text-[var(--muted-text)]">
            <th scope="col" className="px-5 py-3 font-medium">Department</th><th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Code</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">People</th><th scope="col" className="px-3 py-3 font-medium">Status</th><th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody className="divide-y divide-[var(--rule)]">
            {!rows && !error && [0, 1, 2].map((index) => <tr key={index}><td colSpan={5} className="px-5 py-4"><div className="h-7 rounded-md bg-[#EDF3F2] motion-safe:animate-pulse" /></td></tr>)}
            {rows?.map((row) => <tr key={row.id} className={row.is_active ? '' : 'text-[var(--muted-text)]'}>
              <td className="px-5 py-3"><span className="block font-medium text-[var(--charcoal)]">{row.name}</span>{row.description && <span className="block text-xs text-[var(--muted-text)]">{row.description}</span>}</td>
              <td className="hidden px-3 py-3 font-mono text-xs md:table-cell">{row.code}</td>
              <td className="px-3 py-3 text-right tabular-nums">{row.employees.toLocaleString('en-US')}</td>
              <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.is_active ? 'bg-[#E3F2EF] text-[var(--jade-text)]' : 'bg-[#EDF1F2] text-[var(--muted-text)]'}`}>{row.is_active ? 'Active' : 'Inactive'}</span></td>
              <td className="px-5 py-3"><span className="flex justify-end gap-2">
                <button type="button" className={secondary} onClick={() => { setNotice(''); setForm({ id: row.id, name: row.name, code: row.code, description: row.description ?? '' }); }}>Edit</button>
                <button type="button" className={secondary} onClick={() => void toggle(row)}>{row.is_active ? 'Deactivate' : 'Reactivate'}</button>
              </span></td>
            </tr>)}
            {rows && !rows.length && <tr><td colSpan={5} className="px-5 py-10 text-center text-[var(--muted-text)]">No departments yet. Add the first one.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </SidebarDemo>;
}
