'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconAlertCircle, IconCircleCheck, IconDownload, IconKey, IconLoader2, IconLock, IconUsers } from '@tabler/icons-react';

const minimum = 100;
const maximum = 20_000;
type Job = {
  id: string; status: 'running' | 'done' | 'failed'; error: string | null;
  progress: { phase: 'setup' | 'accounts' | 'verifying' | 'done'; done: number; total: number };
  organization: { id: string; slug: string; name: string } | null;
  request: { name: string; slug: string; admins: number; hrs: number; employees: number; emailDomain: string };
  elapsedSeconds: number; remainingSeconds: number | null; credentialsAvailable: boolean; expiresAt: string | null;
};

const field = 'h-11 w-full rounded-lg border border-[#B7CAC7] bg-white px-3 text-[15px] text-[var(--charcoal)] outline-none transition-colors focus-visible:border-[var(--deep-teal)] focus-visible:ring-2 focus-visible:ring-[var(--deep-teal)] aria-[invalid=true]:border-[#C8483A]';
const label = 'block text-sm font-medium text-[var(--charcoal)]';
const hint = 'mt-1.5 block text-[13px] font-normal leading-relaxed text-[var(--muted-text)]';
const keyStorage = 'compvista.provisioning-key';
const slugify = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const number = (value: string) => value.trim() === '' ? 0 : Number(value);
const format = (value: number) => value.toLocaleString('en-US');
const duration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;

async function call<T>(path: string, key: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/domain/provisioning/${path}`, { ...init, cache: 'no-store', headers: { 'x-provisioning-key': key, ...(init?.body ? { 'content-type': 'application/json' } : {}) } });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'The request failed');
  return result as T;
}

async function downloadCredentials(job: Job, key: string) {
  const response = await fetch(`/api/domain/provisioning/jobs/${job.id}/credentials`, { cache: 'no-store', headers: { 'x-provisioning-key': key } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? 'Download failed');
  const url = URL.createObjectURL(new Blob([await response.text()], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `${job.organization?.slug ?? 'organization'}-credentials.csv` });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProvisionForm() {
  const [form, setForm] = useState({ name: '', admins: '2', hrs: '10', employees: '988', emailDomain: 'yopmail.com', adminName: '', adminEmail: '' });
  const [key, setKey] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => { queueMicrotask(() => setKey(sessionStorage.getItem(keyStorage) ?? '')); }, []);

  const counts = { admins: number(form.admins), hrs: number(form.hrs), employees: number(form.employees) };
  const total = counts.admins + counts.hrs + counts.employees;
  const slug = slugify(form.name);
  const errors = (() => {
    const result: Record<string, string> = {};
    if (form.name.trim().length < 2) result.name = 'Enter the organization name';
    for (const [name, value] of Object.entries(counts)) if (!Number.isInteger(value) || value < 0) result[name] = 'Whole numbers only';
    if (!result.admins && counts.admins < 1) result.admins = 'At least one admin';
    if (Number.isInteger(total) && (total < minimum || total > maximum)) result.total = `Total must be ${format(minimum)}–${format(maximum)}`;
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(form.emailDomain.trim())) result.emailDomain = 'Enter a domain like yopmail.com';
    if (form.adminEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.adminEmail.trim())) result.adminEmail = 'Enter a valid email';
    if (key.trim().length < 12) result.key = 'Enter the provisioning key';
    return result;
  })();
  const show = (name: string) => touched ? errors[name] : undefined;

  async function submit() {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSubmitting(true); setError('');
    try {
      sessionStorage.setItem(keyStorage, key.trim());
      setJob(await call<Job>('organizations', key.trim(), { method: 'POST', body: JSON.stringify({ name: form.name, admins: counts.admins, hrs: counts.hrs, employees: counts.employees, emailDomain: form.emailDomain.trim(), adminEmail: form.adminEmail.trim() || undefined, adminName: form.adminName.trim() || undefined }) }));
    } catch (reason) { setError((reason as Error).message); }
    finally { setSubmitting(false); }
  }

  const share = (value: number) => total > 0 ? `${(value / total) * 100}%` : '0%';

  return <main className="min-h-dvh bg-[var(--mist)] px-5 py-10 sm:py-16">
    <div className="mx-auto w-full max-w-3xl">
      <Image src="/brand/logos/svg/compvista-primary-dark.svg" alt="CompVista" width={922} height={176} className="h-auto w-[220px]" priority />
      <h1 className="mt-10 text-balance font-[family-name:var(--font-manrope)] text-[32px] font-semibold leading-tight tracking-[-0.025em] text-[var(--charcoal)]">Create an organization</h1>
      <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[var(--muted-text)]">Every person gets a login. Admins and HR manage compensation; employees see only their own. You download a CSV of temporary passwords. Each person changes theirs and verifies their email at first sign-in.</p>

      {job ? <JobView job={job} providedKey={key.trim()} onUpdate={setJob} onReset={() => { setJob(null); setTouched(false); }} /> :
      <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="mt-8 space-y-6">
        <Section title="Organization">
          <label className={label}>Name
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} aria-invalid={!!show('name')} className={`${field} mt-1.5`} placeholder="Acme Labs" />
            <span className={hint}>{show('name') ? <span className="font-medium text-[#9A3A2D]">{show('name')}</span> : slug ? <>Identifier <code className="rounded bg-[#EEF4F3] px-1 text-[var(--charcoal)]">{slug}</code></> : 'Shown on every page.'}</span>
          </label>
        </Section>

        <Section title="People" description={`${format(minimum)} to ${format(maximum)} in total. Departments, countries, titles, and packages are generated for everyone.`}>
          <div className="grid gap-4 sm:grid-cols-3">
            {([['admins', 'Admins', 'Manage and approve all compensation'], ['hrs', 'HR', 'Propose changes; need approval'], ['employees', 'Employees', 'See only their own compensation']] as const).map(([name, title, note]) => <label key={name} className={label}>{title}
              <input inputMode="numeric" value={form[name]} onChange={(event) => setForm({ ...form, [name]: event.target.value.replace(/[^\d]/g, '') })} aria-invalid={!!show(name)} className={`${field} mt-1.5 tabular-nums`} />
              <span className={hint}>{show(name) ? <span className="font-medium text-[#9A3A2D]">{show(name)}</span> : note}</span>
            </label>)}
          </div>
          <div className="mt-5 rounded-xl border border-[var(--rule)] bg-[#FAFCFB] p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-[var(--muted-text)]">Total</span>
              <span className={`font-[family-name:var(--font-manrope)] text-2xl font-semibold tabular-nums ${errors.total ? 'text-[#9A3A2D]' : 'text-[var(--charcoal)]'}`}>{format(total)} <span className="text-sm font-normal text-[var(--muted-text)]">people</span></span>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#E3ECEA]" aria-hidden="true">
              <span className="bg-[var(--deep-teal)]" style={{ width: share(counts.admins) }} /><span className="bg-[var(--jade)]" style={{ width: share(counts.hrs) }} /><span className="bg-[#A9CBC4]" style={{ width: share(counts.employees) }} />
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-[var(--muted-text)]"><Legend color="bg-[var(--deep-teal)]">Admins {format(counts.admins)}</Legend><Legend color="bg-[var(--jade)]">HR {format(counts.hrs)}</Legend><Legend color="bg-[#A9CBC4]">Employees {format(counts.employees)}</Legend></p>
            {errors.total && <p role="alert" className="mt-2 text-sm font-medium text-[#9A3A2D]">{errors.total}</p>}
            {total > 2000 && !errors.total && <p className="mt-2 text-[13px] text-[var(--muted-text)]">Large organizations take a few minutes: each password is hashed securely. About {Math.max(1, Math.round(total / 3500))} min for {format(total)} people.</p>}
          </div>
        </Section>

        <Section title="Sign-in emails" description="People verify their email with a code at first sign-in, so use a domain whose inboxes you can read.">
          <label className={label}>Email domain
            <span className="mt-1.5 flex items-center rounded-lg border border-[#B7CAC7] bg-white focus-within:border-[var(--deep-teal)] focus-within:ring-2 focus-within:ring-[var(--deep-teal)]">
              <span className="pl-3 text-[15px] text-[var(--muted-text)]">{slug ? slug.replace(/-/g, '').slice(0, 16) : 'org'}.firstname.lastname.00001@</span>
              <input value={form.emailDomain} onChange={(event) => setForm({ ...form, emailDomain: event.target.value })} aria-invalid={!!show('emailDomain')} className="h-11 min-w-0 flex-1 rounded-r-lg bg-transparent pr-3 text-[15px] outline-none" />
            </span>
            <span className={hint}>{show('emailDomain') ? <span className="font-medium text-[#9A3A2D]">{show('emailDomain')}</span> : 'yopmail.com inboxes are public and need no setup, which suits a demo.'}</span>
          </label>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className={label}>First admin name <span className="font-normal text-[var(--muted-text)]">(optional)</span><input value={form.adminName} maxLength={80} onChange={(event) => setForm({ ...form, adminName: event.target.value })} className={`${field} mt-1.5`} /></label>
            <label className={label}>First admin email <span className="font-normal text-[var(--muted-text)]">(optional)</span><input type="email" value={form.adminEmail} onChange={(event) => setForm({ ...form, adminEmail: event.target.value })} aria-invalid={!!show('adminEmail')} className={`${field} mt-1.5`} />
              <span className={hint}>{show('adminEmail') ? <span className="font-medium text-[#9A3A2D]">{show('adminEmail')}</span> : 'Use your own address to sign in as the first admin.'}</span></label>
          </div>
        </Section>

        <Section title="Authorization">
          <label className={label}><span className="inline-flex items-center gap-1.5"><IconKey aria-hidden="true" size={16} stroke={1.75} />Provisioning key</span>
            <input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} aria-invalid={!!show('key')} className={`${field} mt-1.5`} />
            <span className={hint}>{show('key') ? <span className="font-medium text-[#9A3A2D]">{show('key')}</span> : <>The server&apos;s <code className="rounded bg-[#EEF4F3] px-1">COMPVISTA_PROVISIONING_KEY</code>. Kept in this tab only.</>}</span>
          </label>
        </Section>

        {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-[#F0C9C4] bg-[#FDF6F5] px-4 py-3 text-sm text-[#7A2A20]"><IconAlertCircle aria-hidden="true" size={18} stroke={1.75} className="mt-0.5 shrink-0" />{error}</div>}
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={submitting} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--deep-teal)] px-6 text-[15px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(15,76,92,.7)] hover:bg-[var(--teal)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]">
            {submitting ? <IconLoader2 aria-hidden="true" size={18} className="motion-safe:animate-spin" /> : <IconUsers aria-hidden="true" size={18} stroke={1.75} />}Create organization with {format(total)} logins
          </button>
          <Link href="/login" className="text-sm font-semibold text-[var(--deep-teal)] underline-offset-4 hover:underline">Back to sign in</Link>
        </div>
      </form>}
    </div>
  </main>;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-2xl border border-[var(--rule)] bg-white p-6 shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-14px_rgba(15,76,92,.14)]">
    <h2 className="font-[family-name:var(--font-manrope)] text-base font-semibold text-[var(--charcoal)]">{title}</h2>
    {description && <p className="mt-0.5 text-[13px] leading-relaxed text-[var(--muted-text)]">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>;
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-sm ${color}`} />{children}</span>;
}

const phaseLabel = { setup: 'Setting up roles, departments, and components', accounts: 'Creating logins, profiles, and packages', verifying: 'Checking every account', done: 'Done' } as const;

function JobView({ job, providedKey, onUpdate, onReset }: { job: Job; providedKey: string; onUpdate: (job: Job) => void; onReset: () => void }) {
  const [error, setError] = useState('');
  const downloaded = useRef(false);
  useEffect(() => {
    if (job.status !== 'running') return;
    const timer = setTimeout(() => { call<Job>(`jobs/${job.id}`, providedKey).then(onUpdate).catch((reason: Error) => setError(reason.message)); }, 1000);
    return () => clearTimeout(timer);
  }, [job, providedKey, onUpdate]);
  useEffect(() => {
    if (job.status !== 'done' || downloaded.current) return;
    downloaded.current = true;
    downloadCredentials(job, providedKey).catch((reason: Error) => setError(reason.message));
  }, [job, providedKey]);

  const percent = job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : 0;
  const { request } = job;
  return <section aria-live="polite" className="mt-8 rounded-2xl border border-[var(--rule)] bg-white p-6 shadow-[0_1px_2px_rgba(15,76,92,.04),0_8px_24px_-14px_rgba(15,76,92,.14)] sm:p-8">
    {job.status === 'running' && <>
      <h2 className="flex items-center gap-2 font-[family-name:var(--font-manrope)] text-lg font-semibold"><IconLoader2 aria-hidden="true" size={20} className="text-[var(--teal)] motion-safe:animate-spin" />Creating {request.name}</h2>
      <p className="mt-1 text-sm text-[var(--muted-text)]">{phaseLabel[job.progress.phase]}. Keep this tab open.</p>
      <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-[#E3ECEA]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Progress">
        <div className="h-full rounded-full bg-[var(--jade)] transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, percent)}%` }} />
      </div>
      <p className="mt-3 flex flex-wrap justify-between gap-2 text-sm tabular-nums text-[var(--muted-text)]">
        <span><strong className="font-semibold text-[var(--charcoal)]">{format(job.progress.done)}</strong> of {format(job.progress.total)} people</span>
        <span>{duration(job.elapsedSeconds)} elapsed{job.remainingSeconds != null ? ` · about ${duration(job.remainingSeconds)} left` : ''}</span>
      </p>
    </>}
    {job.status === 'done' && job.organization && <>
      <h2 className="flex items-center gap-2 font-[family-name:var(--font-manrope)] text-lg font-semibold text-[var(--charcoal)]"><IconCircleCheck aria-hidden="true" size={22} stroke={1.75} className="text-[var(--jade)]" />{job.organization.name} is ready</h2>
      <p className="mt-1 text-sm text-[var(--muted-text)]">{format(job.progress.total)} logins created in {duration(job.elapsedSeconds)}: {format(request.admins)} admin{request.admins === 1 ? '' : 's'}, {format(request.hrs)} HR, {format(request.employees)} employees.</p>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#EBD9B4] bg-[#FDF8EE] px-4 py-3 text-sm text-[#6B4E16]"><IconLock aria-hidden="true" size={18} stroke={1.75} className="mt-0.5 shrink-0" /><span>The credentials CSV has downloaded. Temporary passwords are not stored anywhere else; you can download them again until {job.expiresAt ? new Date(job.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'the job expires'}. Share each row only with that person.</span></div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={() => void downloadCredentials(job, providedKey).catch((reason: Error) => setError(reason.message))} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#B7CAC7] bg-white px-4 text-sm font-semibold text-[var(--deep-teal)] hover:bg-[#EEF4F3]"><IconDownload aria-hidden="true" size={18} stroke={1.75} />Download credentials again</button>
        <Link href="/login" className="inline-flex h-11 items-center rounded-lg bg-[var(--deep-teal)] px-5 text-sm font-semibold text-white hover:bg-[var(--teal)]">Go to sign in</Link>
        <button type="button" onClick={onReset} className="inline-flex h-11 items-center px-2 text-sm font-semibold text-[var(--deep-teal)] underline-offset-4 hover:underline">Create another</button>
      </div>
    </>}
    {job.status === 'failed' && <>
      <h2 className="flex items-center gap-2 font-[family-name:var(--font-manrope)] text-lg font-semibold text-[#7A2A20]"><IconAlertCircle aria-hidden="true" size={22} stroke={1.75} />{request.name} was not created</h2>
      <p className="mt-2 text-sm text-[var(--charcoal)]">{job.error}</p>
      <p className="mt-1 text-sm text-[var(--muted-text)]">Anything partly created was removed.</p>
      <button type="button" onClick={onReset} className="mt-5 inline-flex h-11 items-center rounded-lg bg-[var(--deep-teal)] px-5 text-sm font-semibold text-white hover:bg-[var(--teal)]">Back to the form</button>
    </>}
    {error && <p role="alert" className="mt-4 text-sm font-medium text-[#9A3A2D]">{error}</p>}
  </section>;
}
