import Image from "next/image";
import type { ReactNode } from "react";
import { AuthVisualPanel } from "./auth-visual-panel";

export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="grid min-h-dvh bg-[#FAFCFB] text-[var(--charcoal)] lg:grid-cols-[3fr_2fr]">
    <AuthVisualPanel />
    <section className="flex min-h-dvh items-center justify-center px-6 py-12 sm:px-10 lg:px-8">
      <div className="w-full max-w-[400px]">
        <Image className="mb-12 lg:hidden" src="/brand/logos/svg/compvista-primary-dark.svg" alt="CompVista" width={168} height={46} priority />
        {children}
      </div>
    </section>
  </main>;
}
