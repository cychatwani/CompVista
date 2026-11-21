import type { ReactNode } from "react";

type Props = { pending: boolean; disabled?: boolean; pendingLabel: string; children: ReactNode };
export function AsyncSubmitButton({ pending, disabled, pendingLabel, children }: Props) {
  return <button className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--deep-teal)] px-4 font-semibold text-white transition-colors hover:bg-[var(--teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--deep-teal)]" type="submit" disabled={disabled || pending} aria-busy={pending}>
    {pending ? <><svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-30"/><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg><span>{pendingLabel}</span></> : children}
  </button>;
}
