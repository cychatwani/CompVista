"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AsyncSubmitButton } from "@/components/auth/async-submit-button";

const destinations: Record<string, string> = { RESET_PASSWORD: "/login/reset-password", SETUP_TOTP: "/login/setup-totp", VERIFY_TOTP: "/login/verify", AUTHENTICATED: "/app" };

export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeAvailable, setCodeAvailable] = useState(true);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/email-otp/status").then(async (response) => {
      const result = await response.json();
      if (!active) return;
      if (response.status === 403) {
        const state = await fetch("/api/auth-state").then((value) => value.json());
        window.location.replace(destinations[state.nextStep] ?? "/login");
        return;
      }
      if (!response.ok) throw new Error(result.error ?? "Could not check verification status");
      setEmail(result.email);
      setCooldown(result.retryAfterSeconds);
      setCodeAvailable(result.hasActiveCode);
      if (result.hasIssuedCode) return;
      const delivery = await fetch("/api/email-otp/send", { method: "POST" });
      const sent = await delivery.json();
      if (!active) return;
      if (!delivery.ok) {
        const status = await fetch("/api/email-otp/status").then((value) => value.json());
        if (active) { setCooldown(status.retryAfterSeconds ?? 0); setCodeAvailable(false); }
        throw new Error(sent.error ?? "Could not send code");
      }
      setCodeAvailable(true);
      setCooldown(sent.retryAfterSeconds);
    }).catch((failure) => { if (active) setError(failure.message ?? "Could not send code"); })
      .finally(() => { if (active) setSending(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 6 || verifying) return;
    setVerifying(true); setError("");
    try {
      const response = await fetch("/api/email-otp/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Invalid code"); return; }
      router.push(destinations[result.nextStep] ?? "/login");
    } catch { setError("Verification is temporarily unavailable"); }
    finally { setVerifying(false); }
  }

  async function resend() {
    if (sending || cooldown > 0) return;
    setSending(true); setError("");
    try {
      const response = await fetch("/api/email-otp/resend", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        const status = await fetch("/api/email-otp/status").then((value) => value.json());
        setCooldown(status.retryAfterSeconds ?? 0);
        setCodeAvailable(status.hasActiveCode ?? false);
        setError(result.error ?? "Could not resend code"); return;
      }
      setCode(""); setCodeAvailable(true); setCooldown(result.retryAfterSeconds);
    } catch { setError("Could not resend code"); }
    finally { setSending(false); }
  }

  return <AuthLayout>
    <div className="pt-10"><p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--teal)] uppercase">Secure verification</p><h1 className="font-[family-name:var(--font-manrope)] text-[34px] leading-[1.15] font-semibold tracking-[-0.03em]">Verify your email</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">Enter the six-digit code sent to <strong>{email || "your email"}</strong>.</p></div>
    <form className="mt-8 space-y-5" onSubmit={verify}>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="email-code">Verification code</label><OTPInput id="email-code" value={code} onChange={setCode} maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" pasteTransformer={(text) => text.replace(/\D/g, "")} containerClassName="w-full" render={({ slots }) => <div className="flex w-full gap-2 sm:gap-3" aria-hidden="true">{slots.map((slot, index) => <div key={index} className={`flex h-12 min-w-0 flex-1 items-center justify-center rounded-[11px] border bg-white text-xl font-semibold tabular-nums ${slot.isActive ? "border-[var(--deep-teal)] ring-2 ring-[var(--deep-teal)]/30" : "border-[#9CACAE]"}`}>{slot.char ?? (slot.hasFakeCaret ? <span className="h-5 w-px bg-[var(--deep-teal)]" /> : null)}</div>)}</div>} /></div>
      {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
      {!codeAvailable && !error && <p className="text-sm text-[var(--muted-text)]">Your code is unavailable. Request a new one below.</p>}
      <AsyncSubmitButton pending={verifying} pendingLabel="Verifying…" disabled={!codeAvailable || code.length !== 6}>Verify &amp; continue</AsyncSubmitButton>
    </form>
    <p className="mt-6 text-sm text-[var(--muted-text)]">Didn’t get the code? <button type="button" className="inline-flex items-center gap-1 font-medium text-[var(--teal)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)] disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60" disabled={sending || cooldown > 0} aria-busy={sending} onClick={resend}>{sending && <svg className="size-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-30"/><path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>}{sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}</button></p>
  </AuthLayout>;
}
