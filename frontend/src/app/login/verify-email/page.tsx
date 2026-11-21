import Link from "next/link";
import { AuthLayout } from "@/components/auth/auth-layout";
export default function Page() { return <AuthLayout><div className="pt-10"><h1 className="font-[family-name:var(--font-manrope)] text-[34px] font-semibold">Verify your email</h1><p className="mt-3 text-sm text-[var(--muted-text)]">Email verification is not available yet. Contact your administrator.</p><Link className="mt-8 inline-block font-medium text-[var(--teal)] underline" href="/login">Back to sign in</Link></div></AuthLayout>; }
