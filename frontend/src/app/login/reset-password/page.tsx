"use client";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { loginPassword, forgetLoginPassword } from "@/components/auth/login-password-memory";
const rules = [
  ["At least 10 characters", (value: string) => value.length >= 10],
  ["One uppercase letter", (value: string) => /[A-Z]/.test(value)],
  ["One lowercase letter", (value: string) => /[a-z]/.test(value)],
  ["One number", (value: string) => /[0-9]/.test(value)],
  ["One special character", (value: string) => /[^A-Za-z0-9]/.test(value)],
] as const;
const destinations: Record<string, string> = { VERIFY_EMAIL: "/login/verify-email", SETUP_TOTP: "/login/setup-totp", VERIFY_TOTP: "/login/verify", AUTHENTICATED: "/app" };
export default function ResetPasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  useEffect(() => { const password = loginPassword(); if (password) queueMicrotask(() => setCurrentPassword(password)); else window.location.replace("/login"); }, []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  function passwordField(id: string, label: string, value: string, onChange: (value: string) => void, autoComplete: string) {
    return <div><label className="mb-2 block text-sm font-medium" htmlFor={id}>{label}</label><div className="relative"><input className="auth-input pr-14" id={id} type={visible[id] ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} required /><button type="button" className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-[var(--muted-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]" aria-label={`${visible[id] ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={!!visible[id]} onClick={() => setVisible((previous) => ({ ...previous, [id]: !previous[id] }))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/>{visible[id] && <path d="M4 20 20 4"/>}</svg></button></div></div>;
  }
  const [error, setError] = useState("");
  const valid = rules.every(([, passes]) => passes(newPassword)) && newPassword === confirmPassword && !!currentPassword;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/mandatory-password-change", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Password change failed"); return; }
      forgetLoginPassword();
      window.location.assign(destinations[result.nextStep] ?? "/login");
    } catch { setError("Password change is temporarily unavailable"); }
    finally { setBusy(false); }
  }
  return <AuthLayout><div className="pt-10"><p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--teal)] uppercase">Account security</p><h1 className="font-[family-name:var(--font-manrope)] text-[34px] leading-[1.15] font-semibold tracking-[-0.03em]">Set a new password</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">Choose a new password to continue.</p></div>
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <div>{passwordField("new-password", "New password", newPassword, setNewPassword, "new-password")}
        <ul className="mt-3 space-y-1 text-sm" aria-label="Password requirements">{rules.map(([label, passes]) => <li key={label} className={passes(newPassword) ? "text-[var(--teal)]" : "text-[var(--muted-text)]"}><span aria-hidden="true">{passes(newPassword) ? "\u2713" : "\u25cb"}</span> {label}</li>)}</ul></div>
      <div>{passwordField("confirm-password", "Confirm password", confirmPassword, setConfirmPassword, "new-password")}{confirmPassword && newPassword !== confirmPassword && <p className="mt-2 text-sm text-red-600">Passwords do not match</p>}</div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="flex h-12 w-full items-center justify-center rounded-[10px] bg-[var(--deep-teal)] px-4 font-semibold text-white disabled:opacity-50" type="submit" disabled={!valid || busy}>{busy ? "Changing password?" : "Change password"}</button>
    </form></AuthLayout>;
}
