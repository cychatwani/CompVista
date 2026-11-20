"use client";

import { useState } from "react";
import { AuthLayout } from "./auth-layout";

export function LoginFormShell() {
  const [showPassword, setShowPassword] = useState(false);
  return <AuthLayout>
    <h1 className="font-[family-name:var(--font-manrope)] text-[32px] font-semibold tracking-[-0.03em]" id="login-title">Welcome back</h1>
    <p className="mt-3 text-[var(--muted-text)]">Sign in to your CompVista workspace.</p>
    <form className="mt-10 space-y-5" aria-labelledby="login-title" onSubmit={(event) => event.preventDefault()}>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="work-email">Work email</label><input className="auth-input" id="work-email" name="email" type="email" autoComplete="username" placeholder="you@company.com" required /></div>
      <div><div className="mb-2 flex items-center justify-between gap-4"><label className="text-sm font-medium" htmlFor="password">Password</label><span className="text-sm font-medium text-[var(--teal)]" aria-label="Password recovery is not yet available">Forgot password?</span></div>
        <div className="relative"><input className="auth-input pr-14" id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required /><button type="button" className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-[var(--muted-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/>{showPassword && <path d="M4 20 20 4"/>}</svg></button></div>
      </div>
      <button className="min-h-12 w-full rounded-lg bg-[var(--deep-teal)] px-4 py-3 font-semibold text-white transition-colors hover:bg-[var(--teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]" type="submit">Sign in</button>
    </form>
    <p className="mt-8 text-center text-sm leading-6 text-[var(--muted-text)]">Your account may require two-factor authentication.</p>
  </AuthLayout>;
}
