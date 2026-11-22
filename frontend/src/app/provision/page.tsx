import type { Metadata } from 'next';
import { ProvisionForm } from '@/components/provision/provision-form';

export const metadata: Metadata = { title: 'Create an organization · CompVista', robots: { index: false } };

export default function ProvisionPage() {
  return <ProvisionForm />;
}
