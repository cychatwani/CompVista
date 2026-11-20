"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthLayout } from "./auth-layout";
import { loginSchema, type LoginValues } from "./login-schema";

export function LoginFormShell() {
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const { register, handleSubmit, setValue, formState: { errors, touchedFields, isSubmitted, isValid, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onChange",
    defaultValues: { email: "", password: "" },
  });
  const emailField = register("email");
  const passwordField = register("password");
  const showEmailError = Boolean(errors.email && (touchedFields.email || isSubmitted));
  const showPasswordError = Boolean(errors.password && (touchedFields.password || isSubmitted));

  const onValidSubmit = async () => {
    // Integration point: send validated credentials to the auth provider in a later milestone.
  };

  return <AuthLayout>
    <div className="pt-10"><p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--teal)] uppercase">Your workspace</p><h1 className="font-[family-name:var(--font-manrope)] text-[34px] leading-[1.15] font-semibold tracking-[-0.03em]" id="login-title">Good to have you back.</h1>
    <p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">Access your compensation workspace securely.</p></div>
    <form className="mt-8 space-y-5" aria-labelledby="login-title" noValidate onSubmit={handleSubmit(onValidSubmit)}>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="work-email">Work email</label><input className="auth-input" id="work-email" type="email" autoComplete="username" placeholder="you@company.com" aria-invalid={showEmailError} aria-describedby={showEmailError ? "work-email-error" : undefined} {...emailField} onBlur={(event) => { emailField.onBlur(event); setValue("email", event.target.value.trim(), { shouldValidate: true }); }} />{showEmailError && <p className="mt-2 text-sm text-red-700" id="work-email-error" role="alert">{errors.email?.message}</p>}</div>
      <div><label className="mb-2 block text-sm font-medium" htmlFor="password">Password</label>
        <div className="relative"><input className="auth-input pr-14" id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" aria-invalid={showPasswordError} aria-describedby={showPasswordError ? "password-error" : undefined} {...passwordField} ref={(element) => { passwordField.ref(element); passwordInputRef.current = element; }} /><button type="button" className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-[var(--muted-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]" onClick={() => { setShowPassword(!showPassword); requestAnimationFrame(() => passwordInputRef.current?.focus()); }} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="3"/>{showPassword && <path d="M4 20 20 4"/>}</svg></button></div>
        {showPasswordError && <p className="mt-2 text-sm text-red-700" id="password-error" role="alert">{errors.password?.message}</p>}
        <p className="mt-2 text-right text-sm font-medium text-[var(--teal)]" aria-label="Password recovery is not yet available">Forgot password?</p>
      </div>
      <button className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--deep-teal)] px-4 font-semibold text-white transition-colors hover:bg-[var(--teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--deep-teal)]" type="submit" disabled={!isValid || isSubmitting}>Continue securely <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
    </form>
    <footer className="mt-10 border-t border-[#DCE5E3] pt-5"><p className="flex items-center gap-2 text-xs leading-5 text-[var(--muted-text)]"><svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>Protected with multi-factor authentication</p></footer>
  </AuthLayout>;
}
