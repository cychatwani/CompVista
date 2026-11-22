'use client';

import { useEffect, useState } from 'react';
import { IconPencil } from '@tabler/icons-react';
import { Flag } from '@/components/flag';
import { Picker } from '@/components/analytics/ui';
import { domain, type EmployeeRecord } from './api';

export const levelLabel: Record<string, string> = { JUNIOR: 'Junior', MID: 'Mid', SENIOR: 'Senior', LEAD: 'Lead', MANAGER: 'Manager', DIRECTOR: 'Director' };
export const statusLabel: Record<string, string> = { ACTIVE: 'Active', PROBATION: 'Probation', ON_LEAVE: 'On leave', NOTICE_PERIOD: 'Notice period' };
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const field = 'h-10 w-full rounded-lg border border-[#B7CAC7] bg-white px-3 text-sm text-[var(--charcoal)] outline-none focus-visible:border-[var(--deep-teal)] focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)]';

type Options = { departments: { id: string; name: string; is_active: boolean }[]; countries: { code: string; name: string; currency_code: string }[] };

/** Organization profile: department, country, role in the business. Editable by people who manage compensation. */
export function ProfileCard({ employee, canEdit, packageCurrency, onSaved }: { employee: EmployeeRecord; canEdit: boolean; packageCurrency?: string; onSaved: (employee: EmployeeRecord) => void }) {
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [draft, setDraft] = useState({ departmentId: employee.departmentId ?? '', countryCode: employee.countryCode, jobTitle: employee.jobTitle ?? '', jobLevel: employee.jobLevel ?? '', employmentStatus: employee.employmentStatus ?? 'ACTIVE' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!editing || options) return;
    Promise.all([domain<Options['departments']>('departments'), domain<Options['countries']>('countries')]).then(([departments, countries]) => setOptions({ departments, countries })).catch((reason: Error) => setError(reason.message));
  }, [editing, options]);

  async function save() {
    setSaving(true); setError('');
    try {
      const updated = await domain<EmployeeRecord>(`employees/${employee.id}/profile`, { method: 'PATCH', body: JSON.stringify({ departmentId: draft.departmentId || null, countryCode: draft.countryCode, jobTitle: draft.jobTitle.trim() || null, jobLevel: draft.jobLevel || null, employmentStatus: draft.employmentStatus }) });
      onSaved({ ...employee, ...updated });
      setEditing(false);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }

  const facts = [
    { label: 'Department', value: employee.department?.name ?? 'Unassigned' },
    { label: 'Country', value: <span className="inline-flex items-center gap-1.5"><Flag code={employee.countryCode} />{employee.country?.name ?? employee.countryCode}</span> },
    { label: 'Role', value: [employee.jobTitle, employee.jobLevel ? levelLabel[employee.jobLevel] : null].filter(Boolean).join(' · ') || '—' },
    { label: 'Employee code', value: employee.employeeCode ?? '—' },
    { label: 'Status', value: statusLabel[employee.employmentStatus ?? 'ACTIVE'] ?? employee.employmentStatus },
    { label: 'Hired', value: employee.hireDate ? dateFormat.format(new Date(employee.hireDate)) : '—' },
  ];
  const newCountry = options?.countries.find((item) => item.code === draft.countryCode);

  return <section aria-labelledby="profile-heading" className="rounded-2xl border border-[var(--rule)] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(15,76,92,.04)]">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="profile-heading" className="font-[family-name:var(--font-manrope)] text-base font-semibold text-[var(--charcoal)]">Profile{employee.email && <span className="ml-2 text-sm font-normal text-[var(--muted-text)]">{employee.email}</span>}</h2>
      {canEdit && !editing && <button type="button" onClick={() => setEditing(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3] focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)]"><IconPencil aria-hidden="true" size={16} stroke={1.75} />Edit profile</button>}
    </div>
    {!editing ? <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
      {facts.map((fact) => <div key={fact.label} className="min-w-0"><dt className="text-xs text-[var(--muted-text)]">{fact.label}</dt><dd className="mt-1 truncate text-sm font-medium text-[var(--charcoal)]">{fact.value}</dd></div>)}
    </dl> : <div className="mt-4">
      {!options && !error ? <div aria-busy="true" className="h-24 rounded-xl bg-[#EEF4F3] motion-safe:animate-pulse" /> : options && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm font-medium text-[var(--charcoal)]">Department
          <select value={draft.departmentId} onChange={(event) => setDraft({ ...draft, departmentId: event.target.value })} className={`${field} mt-1.5`}>
            <option value="">Unassigned</option>
            {options.departments.filter((item) => item.is_active || item.id === employee.departmentId).map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? '' : ' (inactive)'}</option>)}
          </select>
        </label>
        <div className="text-sm font-medium text-[var(--charcoal)]"><span id="country-label">Country</span>
          <div className="mt-1.5" aria-labelledby="country-label"><Picker label="" allLabel="Choose" value={draft.countryCode} onChange={(countryCode) => countryCode && setDraft({ ...draft, countryCode })} options={options.countries.map((item) => ({ value: item.code, label: item.name, flag: item.code, hint: item.currency_code }))} /></div>
        </div>
        <label className="text-sm font-medium text-[var(--charcoal)]">Job title
          <input value={draft.jobTitle} maxLength={120} onChange={(event) => setDraft({ ...draft, jobTitle: event.target.value })} className={`${field} mt-1.5`} />
        </label>
        <label className="text-sm font-medium text-[var(--charcoal)]">Level
          <select value={draft.jobLevel} onChange={(event) => setDraft({ ...draft, jobLevel: event.target.value })} className={`${field} mt-1.5`}>
            <option value="">Not set</option>{Object.entries(levelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-[var(--charcoal)]">Status
          <select value={draft.employmentStatus} onChange={(event) => setDraft({ ...draft, employmentStatus: event.target.value })} className={`${field} mt-1.5`}>
            {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>}
      {newCountry && draft.countryCode !== employee.countryCode && <p className="mt-3 text-[13px] text-[var(--muted-text)]">New packages for {newCountry.name} default to {newCountry.currency_code}.{packageCurrency ? ` The current package stays in ${packageCurrency}; nothing is converted.` : ''}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-[#9A3A2D]">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => { setEditing(false); setError(''); }} className="inline-flex h-10 items-center rounded-lg border border-[#B7CAC7] bg-white px-4 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3]">Cancel</button>
        <button type="button" disabled={saving || !options} onClick={() => void save()} className="inline-flex h-10 items-center rounded-lg bg-[var(--deep-teal)] px-4 text-sm font-semibold text-white hover:bg-[var(--teal)] disabled:opacity-50">{saving ? 'Saving…' : 'Save profile'}</button>
      </div>
    </div>}
  </section>;
}
