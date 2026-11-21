"use client";
import { useState } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
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
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
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
      window.location.assign(destinations[result.nextStep] ?? "/login");
    } catch { setError("Password change is temporarily unavailable"); }
    finally { setBusy(false); }
  }
  return <AuthLayout><div className="pt-10"><p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--teal)] uppercase">Account security</p><h1 className="font-[family-name:var(--font-manrope)] text-[34px] leading-[1.15] font-semibold tracking-[-0.03em]">Change your temporary password</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">Choose a new password to continue.</p></div>
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="current-password">Current temporary password</label><input className="auth-input" id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="new-password">New password</label><input className="auth-input" id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
        <ul className="mt-3 space-y-1 text-sm" aria-label="Password requirements">{rules.map(([label, passes]) => <li key={label} className={passes(newPassword) ? "text-[var(--teal)]" : "text-[var(--muted-text)]"}><span aria-hidden="true">{passes(newPassword) ? "\u2713" : "\u25cb"}</span> {label}</li>)}</ul></div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="confirm-password">Confirm password</label><input className="auth-input" id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />{confirmPassword && newPassword !== confirmPassword && <p className="mt-2 text-sm text-red-600">Passwords do not match</p>}</div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="flex h-12 w-full items-center justify-center rounded-[10px] bg-[var(--deep-teal)] px-4 font-semibold text-white disabled:opacity-50" type="submit" disabled={!valid || busy}>{busy ? "Changing password?" : "Change password"}</button>
    </form></AuthLayout>;
}
