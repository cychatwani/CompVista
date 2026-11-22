import { Suspense } from 'react';
import { Dashboard } from '@/components/analytics/pages';

export default function AppPage() {
  return <Suspense><Dashboard /></Suspense>;
}
