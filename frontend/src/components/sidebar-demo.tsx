"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { Sidebar, SidebarBody } from "@/components/ui/sidebar";

export default function SidebarDemo({ title = 'Dashboard', subtitle = 'Your compensation workspace', children }: { title?: string; subtitle?: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--mist)] md:flex-row">
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="border-r border-[#DAE5E3] bg-[#F4F8F7] px-4 py-6 md:py-8">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex min-h-9 items-center">
              <Image src="/brand/symbol/svg/compvista-symbol-color.svg" alt="" width={28} height={28} className="shrink-0" priority />
              {open && <span className="ml-3 whitespace-nowrap font-[family-name:var(--font-manrope)] text-base font-semibold tracking-[-0.02em] text-[var(--deep-teal)]">CompVista</span>}
            </div>
            <nav aria-label="Workspace navigation" className="flex-1" />
          </div>
        </SidebarBody>
      </Sidebar>

      <section className="flex min-h-[calc(100dvh-2.5rem)] min-w-0 flex-1 flex-col bg-[#FAFCFB] px-6 py-8 sm:px-10 md:min-h-dvh md:px-12 md:py-10">
        <header className="border-b border-[#DAE5E3] pb-7">
          <h1 className="font-[family-name:var(--font-manrope)] text-3xl font-semibold tracking-[-0.03em] text-[var(--charcoal)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--muted-text)]">{subtitle}</p>
        </header>
        {children ?? <div className="mt-8 flex flex-1 flex-col gap-4">
          <Link href="/app/compensation" className="w-fit rounded-lg bg-[var(--deep-teal)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--teal)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]">Manage compensation</Link>
          <div className="mt-4 flex flex-1 flex-col gap-4" aria-hidden="true">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-[#E8F1EF] motion-reduce:animate-none" />)}
          </div>
          <div className="grid flex-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => <div key={index} className="min-h-48 animate-pulse rounded-xl bg-[#E8F1EF] motion-reduce:animate-none" />)}
          </div>
          </div>
        </div>}
      </section>
    </div>
  );
}
