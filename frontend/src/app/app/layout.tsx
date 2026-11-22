import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const cookie = (await headers()).get('cookie') ?? '';
  const response = await fetch(`${process.env.AUTH_API_URL ?? 'http://localhost:4000'}/api/access`, { headers: { cookie }, cache: 'no-store' }).catch(() => null);
  if (!response?.ok) redirect('/login');
  return children;
}
