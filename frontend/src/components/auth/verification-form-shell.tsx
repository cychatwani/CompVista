"use client";

import { useState } from "react";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";
import { AuthLayout } from "./auth-layout";

export function VerificationFormShell() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 6 || pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/totp/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Invalid code"); return; }
      window.location.assign("/app");
    } catch { setError("Verification is temporarily unavailable"); }
    finally { setPending(false); }
  }

  return (
    <AuthLayout>
      <div className="pt-10">
        <p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--teal)] uppercase">Secure verification</p>
        <h1 className="font-[family-name:var(--font-manrope)] text-[34px] leading-[1.15] font-semibold tracking-[-0.03em]" id="verification-title">Verify your identity</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-text)]" id="verification-description">Open your authenticator app and enter the 6-digit code to continue.</p>
      </div>

      <form className="mt-8 space-y-5" aria-labelledby="verification-title" onSubmit={verify}>
        <div>
          <label className="mb-2 block text-sm font-medium" htmlFor="authenticator-code">Authenticator code</label>
          <OTPInput
            id="authenticator-code"
            name="authenticator-code"
            value={code}
            onChange={setCode}
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-describedby="verification-description"
            pasteTransformer={(pasted) => pasted.replace(/\D/g, "")}
            containerClassName="w-full"
            render={({ slots }) => (
              <div className="flex w-full gap-2 sm:gap-3" aria-hidden="true">
                {slots.map((slot, index) => (
                  <div key={index} className={`flex h-12 min-w-0 flex-1 items-center justify-center rounded-[11px] border bg-white text-xl font-semibold tabular-nums ${slot.isActive ? "border-[var(--deep-teal)] ring-2 ring-[var(--deep-teal)]/30" : "border-[#9CACAE]"}`}>
                    {slot.char ?? (slot.hasFakeCaret ? <span className="h-5 w-px bg-[var(--deep-teal)]" /> : null)}
                  </div>
                ))}
              </div>
            )}
          />
        </div>

        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--deep-teal)] px-4 font-semibold text-white transition-colors hover:bg-[var(--teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--deep-teal)]" type="submit" disabled={code.length !== 6 || pending}>
          Verify &amp; continue
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </button>
      </form>

      <footer className="mt-10 border-t border-[#DCE5E3] pt-5">
        <p className="text-xs leading-5 text-[var(--muted-text)]">Having trouble? <button className="font-medium text-[var(--teal)] underline underline-offset-2 disabled:cursor-not-allowed" type="button" disabled aria-label="Use a backup code, coming soon">Use a backup code</button></p>
      </footer>
    </AuthLayout>
  );
}
