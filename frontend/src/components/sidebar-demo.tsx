"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { IconArrowLeft, IconChartBar, IconChecklist, IconLogout, IconUsersGroup, IconWallet } from "@tabler/icons-react";
import { Sidebar, SidebarBody } from "@/components/ui/sidebar";

type Capabilities = { canViewOthers: boolean; canManageOthers: boolean; canViewOwn: boolean; canApprove?: boolean; pendingApprovals?: number };
function loadCapabilities() {
  return fetch("/api/domain/me/capabilities", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<Capabilities> : null).catch(() => null);
}
// Pages call this after approving or submitting so the Approvals badge updates without a reload.
export function refreshSidebar() { window.dispatchEvent(new Event("compvista:capabilities")); }

const navigation = [
  { href: "/app/my-compensation", label: "My compensation", icon: IconWallet, management: false, exact: true },
  { href: "/app/compensation", label: "Manage compensation", icon: IconUsersGroup, management: true, exact: false },
  { href: "/app/approvals", label: "Approvals", icon: IconChecklist, management: false, approver: true, exact: true },
  { href: "/app", label: "Dashboard", icon: IconChartBar, management: true, exact: true },
] as { href: string; label: string; icon: typeof IconWallet; management: boolean; approver?: boolean; exact: boolean }[];

export default function SidebarDemo({ title = 'Dashboard', subtitle = 'Your compensation workspace', back, actions, children, background = 'bg-[#FAFCFB]' }: { title?: string; subtitle?: string; back?: { href: string; label: string }; actions?: ReactNode; children?: ReactNode; background?: string }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    const load = () => void loadCapabilities().then(setCapabilities);
    load();
    window.addEventListener("compvista:capabilities", load);
    return () => window.removeEventListener("compvista:capabilities", load);
  }, []);
  const canManage = !!(capabilities?.canViewOthers || capabilities?.canManageOthers);
  const items = navigation.filter((item) => item.approver ? !!capabilities?.canApprove : !item.management || canManage);
  const pendingCount = capabilities?.pendingApprovals ?? 0;
  async function logout() {
    setSigningOut(true);
    await fetch("/api/logout", { method: "POST" }).catch(() => null);
    window.location.replace("/login");
  }
  const itemClass = (active: boolean) => `group flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)] ${active ? "bg-white text-[var(--deep-teal)] shadow-[0_1px_2px_rgba(15,76,92,.06),0_2px_8px_-2px_rgba(15,76,92,.10)] ring-1 ring-[var(--rule)]" : "text-[var(--muted-text)] hover:bg-[#E6EFED] hover:text-[var(--charcoal)]"}`;

  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--mist)] md:flex-row">
      <Sidebar open={open} setOpen={setOpen} animate={false}>
        <SidebarBody className="w-[248px] border-r border-[var(--rule)] bg-[#F4F8F7] px-4 py-6">
          <div className="flex h-full flex-col">
            <Link href="/app/my-compensation" className="flex h-10 items-center gap-2.5 rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-[var(--deep-teal)]">
              <Image src="/brand/symbol/svg/compvista-symbol-color.svg" alt="" width={26} height={26} className="shrink-0" priority />
              <span className="whitespace-nowrap font-[family-name:var(--font-manrope)] text-[17px] font-semibold tracking-[-0.02em] text-[var(--deep-teal)]">CompVista</span>
            </Link>
            <nav aria-label="Workspace navigation" className="mt-10 flex flex-1 flex-col gap-1">
              {items.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`) || (href === "/app/compensation" && pathname.startsWith("/app/employees/"));
                const waiting = href === "/app/approvals" && pendingCount > 0;
                return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={itemClass(active)}>
                  <Icon aria-hidden="true" size={19} stroke={1.75} className={`shrink-0 ${active ? "text-[var(--jade)]" : "text-[#7C8C90] group-hover:text-[var(--charcoal)]"}`} />
                  <span className="flex-1 whitespace-nowrap">{label}</span>
                  {waiting && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#C2410C] px-1.5 text-[11px] font-semibold leading-none text-white">{pendingCount > 99 ? "99+" : pendingCount}<span className="sr-only"> waiting</span></span>}
                </Link>;
              })}
            </nav>
            <div className="border-t border-[var(--rule)] pt-4">
              <button type="button" onClick={() => void logout()} disabled={signingOut} className={`${itemClass(false)} w-full disabled:opacity-60`}>
                <IconLogout aria-hidden="true" size={19} stroke={1.75} className="shrink-0 text-[#7C8C90] group-hover:text-[var(--charcoal)]" />
                <span className="whitespace-nowrap">{signingOut ? "Logging out…" : "Log out"}</span>
              </button>
            </div>
          </div>
        </SidebarBody>
      </Sidebar>

      <main className={`min-w-0 flex-1 ${background}`}>
        <div className="mx-auto w-full max-w-[1240px] px-6 pb-16 pt-8 sm:px-10 md:pt-12 lg:px-14">
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--rule)] pb-6">
            <div className="min-w-0">
              {back && <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-medium text-[var(--muted-text)] underline-offset-4 hover:text-[var(--deep-teal)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--deep-teal)]"><IconArrowLeft aria-hidden="true" size={15} stroke={1.75} />{back.label}</Link>}
              <h1 className="text-balance font-[family-name:var(--font-manrope)] text-[28px] font-semibold leading-tight tracking-[-0.025em] text-[var(--charcoal)] sm:text-[32px]">{title}</h1>
              <p className="mt-1.5 text-sm text-[var(--muted-text)]">{subtitle}</p>
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
