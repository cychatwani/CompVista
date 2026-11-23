import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

// Only members with canApproveComp may open the approvals queue.
export default async function ApprovalsLayout({ children }: { children: ReactNode }) {
  const cookie = (await headers()).get('cookie') ?? '';
  const response = await fetch(`${process.env.AUTH_API_URL ?? 'http://localhost:4000'}/me/capabilities`, { headers: { cookie }, cache: 'no-store' }).catch(() => null);
  const capabilities = response?.ok ? await response.json().catch(() => null) as { canApprove?: boolean } | null : null;
  if (!capabilities?.canApprove) redirect('/app/my-compensation');
  return children;
}
