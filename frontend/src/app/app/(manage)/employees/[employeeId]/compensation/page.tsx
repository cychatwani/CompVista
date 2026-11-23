import { EmployeeCompensation } from '@/components/compensation/employee-compensation';
export default async function Page({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  return <EmployeeCompensation employeeId={employeeId} />;
}
