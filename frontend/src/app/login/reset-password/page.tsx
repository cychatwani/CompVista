import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
export default function ResetPasswordPage() {
  return <AuthLayout><div className="pt-10"><p className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-[var(--teal)] uppercase">Account recovery</p><h1 className="font-[family-name:var(--font-manrope)] text-[34px] leading-[1.15] font-semibold tracking-[-0.03em]">Reset your password</h1><p className="mt-3 text-sm leading-6 text-[var(--muted-text)]">Password reset is coming soon. Contact your administrator if you need access now.</p><Link className="mt-8 inline-block font-medium text-[var(--teal)] underline" href="/login">Back to sign in</Link></div></AuthLayout>;
}
