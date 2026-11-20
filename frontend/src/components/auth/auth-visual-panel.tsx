import Image from "next/image";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { AnimatedBrandMark } from "./animated-brand-mark";

export function AuthVisualPanel() {
  return <aside className="relative hidden min-h-dvh overflow-hidden bg-[var(--deep-teal)] text-white lg:block" aria-label="CompVista identity">
    <AuroraBackground />
    <div className="pointer-events-none absolute inset-0 bg-[#092F3B]/65" aria-hidden="true" />
    <div className="relative z-10 flex min-h-dvh flex-col justify-between px-10 py-10 xl:px-16 xl:py-14">
      <Image src="/brand/logos/svg/compvista-primary-light.svg" alt="CompVista" width={210} height={58} priority />
      <div className="max-w-[620px]"><AnimatedBrandMark /><h2 className="mt-12 max-w-[610px] text-4xl leading-[1.14] font-semibold tracking-[-0.025em] xl:text-5xl">Clarity in every compensation decision.</h2><p className="mt-5 text-lg text-[#E0F0EE]">One intelligent workspace for your people and pay.</p></div>
      <p className="text-sm font-medium tracking-[0.12em] text-[#D0E4E1] uppercase">Enterprise compensation intelligence</p>
    </div>
  </aside>;
}
