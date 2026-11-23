import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

// Only members who may view or manage other people's compensation see the workspace.
// Everyone else is limited to their own compensation page.
export default async function ManagementLayout({ children }: { children: ReactNode }) {
  const cookie = (await headers()).get('cookie') ?? '';
  const response = await fetch(`${process.env.AUTH_API_URL ?? 'http://localhost:4000'}/me/capabilities`, { headers: { cookie }, cache: 'no-store' }).catch(() => null);
  const capabilities = response?.ok ? await response.json().catch(() => null) as { canViewOthers?: boolean; canManageOthers?: boolean } | null : null;
  if (!capabilities?.canViewOthers && !capabilities?.canManageOthers) redirect('/app/my-compensation');
  return children;
}
