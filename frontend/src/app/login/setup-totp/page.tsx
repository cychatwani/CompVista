"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "react-qr-code";
import { OTPInput, REGEXP_ONLY_DIGITS } from "input-otp";
import { AuthLayout } from "@/components/auth/auth-layout";
import { AsyncSubmitButton } from "@/components/auth/async-submit-button";
import { forgetLoginPassword, loginPassword } from "@/components/auth/login-password-memory";

type Phase = "loading" | "choice" | "setup" | "recovery";

export default function SetupTotpPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [canSkip, setCanSkip] = useState(false);
  const [hasLoginPassword, setHasLoginPassword] = useState(false);
  const [uri, setUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/totp/status", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!active) return;
      if (response.status === 401) { window.location.replace("/login"); return; }
      if (!response.ok) throw new Error(result.error ?? "Could not check authenticator setup");
      if (result.nextStep !== "SETUP_TOTP") {
        const routes: Record<string, string> = { RESET_PASSWORD: "/login/reset-password", VERIFY_EMAIL: "/login/verify-email", AUTHENTICATED: "/app" };
        window.location.replace(routes[result.nextStep] ?? "/login");
        return;
      }
      setCanSkip(result.canSkip);
      setHasLoginPassword(!!loginPassword());
      setPhase("choice");
    }).catch((failure) => { if (active) { setError(failure.message); setPhase("choice"); } });
    return () => { active = false; };
  }, []);

  async function post(action: string, body: Record<string, string> = {}) {
    const response = await fetch(`/api/totp/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Authenticator request failed");
    return result;
  }

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const password = loginPassword();
    if (!password) { setError("Sign in again to continue authenticator setup."); return; }
    setBusy(true); setError("");
    try {
      const result = await post("begin", { password });
      setUri(result.totpURI); setBackupCodes(result.backupCodes); forgetLoginPassword(); setPhase("setup");
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true); setError("");
    try {
      const result = await post("verify", { code });
      if (result.decision !== "ENABLED") throw new Error("Enrollment was not saved");
      setPhase("recovery"); setCode(""); setUri("");
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function skip() {
    if (!canSkip || busy) return;
    setBusy(true); setError("");
    try {
      const result = await post("skip");
      if (result.decision !== "SKIPPED") throw new Error("Your choice was not saved");
      forgetLoginPassword();
      router.push("/app");
    } catch (failure) { setError((failure as Error).message); setBusy(false); }
  }

  const setupKey = uri ? new URL(uri).searchParams.get("secret") ?? "" : "";
  return <AuthLayout><div className="pt-10">
    <p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--teal)] uppercase">Account security</p>
    <h1 className="font-[family-name:var(--font-manrope)] text-[34px] leading-[1.15] font-semibold tracking-[-0.03em]">Set up your authenticator</h1>
    <p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">Choose whether to add an authenticator app to your account.</p>
  </div>
  {phase === "loading" && <p className="mt-8 text-sm text-[var(--muted-text)]">Checking your account…</p>}
  {phase === "choice" && <form className="mt-8 space-y-5" onSubmit={begin}>
    <p className="text-sm leading-6 text-[var(--muted-text)]">Your choice is saved only when you verify a code or select Skip for Now.</p>
    {hasLoginPassword ? <AsyncSubmitButton pending={busy} pendingLabel="Preparing…">Continue to setup</AsyncSubmitButton> : <div className="space-y-2"><p className="text-sm text-[var(--muted-text)]">Sign in again to continue setup after refreshing this page.</p><button type="button" className="w-full rounded-lg border border-[#9CACAE] px-4 py-3 text-sm font-semibold text-[var(--deep-teal)]" onClick={() => router.push("/login")}>Sign in again</button></div>}
    {canSkip && <button type="button" className="w-full rounded-lg border border-[#9CACAE] px-4 py-3 text-sm font-semibold text-[var(--deep-teal)] disabled:opacity-50" disabled={busy} onClick={skip}>Skip for Now</button>}
  </form>}
  {phase === "setup" && <form className="mt-8 space-y-5" onSubmit={verify}>
    <p className="text-sm leading-6 text-[var(--muted-text)]">Scan this QR code in your authenticator app, then enter its six-digit code.</p>
    <div className="relative mx-auto w-fit bg-[#F4FAF6] p-3">
      <QRCode value={uri} size={180} level="H" fgColor="#174F45" bgColor="#F4FAF6" />
      <Image src="/brand/favicon/favicon-light.svg" alt="" aria-hidden="true" width={30} height={30} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
    </div>
    <div><p className="mb-2 text-sm font-medium">Manual setup key</p><code className="block break-all rounded-lg bg-[#EDF3F1] p-3 text-sm select-all">{setupKey}</code></div>
    <div><label className="mb-2 block text-sm font-medium" htmlFor="totp-code">Authenticator code</label><OTPInput id="totp-code" value={code} onChange={setCode} maxLength={6} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code" containerClassName="w-full" render={({ slots }) => <div className="flex gap-2" aria-hidden="true">{slots.map((slot, index) => <div key={index} className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-[11px] border border-[#9CACAE] bg-white text-xl font-semibold">{slot.char ?? null}</div>)}</div>} /></div>
    <AsyncSubmitButton pending={busy} pendingLabel="Verifying…" disabled={code.length !== 6}>Verify authenticator</AsyncSubmitButton>
    {canSkip && <button type="button" className="w-full text-sm font-semibold text-[var(--teal)] underline disabled:opacity-50" disabled={busy} onClick={skip}>Skip for Now</button>}
  </form>}
  {phase === "recovery" && <div className="mt-8 space-y-5">
    <p className="text-sm leading-6 text-[var(--muted-text)]">Authenticator enabled. Save these recovery codes somewhere safe. Each code can be used once if you lose access to your authenticator.</p>
    <ul className="grid grid-cols-2 gap-2 rounded-xl bg-[#EDF3F1] p-4 font-mono text-sm">{backupCodes.map((item) => <li key={item}>{item}</li>)}</ul>
    <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I have saved my recovery codes.</label>
    <button className="flex h-12 w-full items-center justify-center rounded-[10px] bg-[var(--deep-teal)] px-4 font-semibold text-white disabled:opacity-50" type="button" disabled={!acknowledged} onClick={() => window.location.assign("/app")}>Continue to workspace</button>
  </div>}
  {error && <p role="alert" className="mt-4 text-sm font-medium text-red-600">{error}</p>}
  </AuthLayout>;
}
