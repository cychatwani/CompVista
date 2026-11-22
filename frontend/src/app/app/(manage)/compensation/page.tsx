import { Suspense } from 'react';
import { CompensationDirectory } from '@/components/compensation/directory';

export default function Page() {
  return <Suspense><CompensationDirectory /></Suspense>;
}
