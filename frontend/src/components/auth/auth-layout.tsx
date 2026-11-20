import Image from "next/image";
import type { ReactNode } from "react";
import { AuthVisualPanel } from "./auth-visual-panel";
import { AuroraBackground } from "@/components/ui/aurora-background";

export function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="grid min-h-dvh bg-[#FBFCFB] text-[var(--charcoal)] lg:grid-cols-[3fr_2fr]">
    <AuthVisualPanel />
    <section className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#FBFCFB] px-6 py-12 sm:px-10 lg:px-8">
      <AuroraBackground variant="subtle" />
      <div className="relative z-10 w-full max-w-[420px] lg:-translate-y-6">
        <header className="flex justify-center pb-6">
          <Image className="h-auto w-[264px] max-w-full sm:w-[312px]" src="/brand/logos/svg/compvista-primary-dark.svg" alt="CompVista" width={922} height={176} priority />
        </header>
        {children}
      </div>
    </section>
  </main>;
}
