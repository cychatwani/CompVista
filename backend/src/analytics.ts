import { BadRequestException } from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';

// Organization-scoped compensation analytics, computed in PostgreSQL.
//
// Money rules:
//   * Annual CTC = annualized earnings + annualized employer contributions. Each item's
//     persisted annual_amount already applies its payment frequency (one-time items are 0),
//     so summing it reproduces compensation-calculation.ts exactly.
//   * Employee deductions are reported separately and never added to CTC.
//   * Amounts in different currencies are never summed together: every monetary aggregate is
//     either grouped by currency or restricted to one selected currency.

export type AnalyticsFilters = { country: string | null; departmentId: string | null; currency: string | null };
type Scope = { organizationId: string; filters: AnalyticsFilters; skipCountry?: boolean; skipDepartment?: boolean; currency?: string | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFilters(query: Record<string, string | undefined> | undefined): AnalyticsFilters {
  const country = query?.country?.trim().toUpperCase() || null;
  const departmentId = query?.department?.trim() || null;
  const currency = query?.currency?.trim().toUpperCase() || null;
  if (country && !/^[A-Z]{2}$/.test(country)) throw new BadRequestException('Country must be a two-letter ISO code');
  if (departmentId && !uuid.test(departmentId)) throw new BadRequestException('Department is not valid');
  if (currency && !/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency must be a three-letter ISO code');
  return { country, departmentId, currency };
}

/** Employees in scope, as a CTE named `emp`. */
export function employeeScope({ organizationId, filters, skipCountry, skipDepartment }: Scope): Prisma.Sql {
  const conditions = [Prisma.sql`e."organizationId" = ${organizationId}`];
  if (filters.country && !skipCountry) conditions.push(Prisma.sql`e."countryCode" = ${filters.country}`);
  if (filters.departmentId && !skipDepartment) conditions.push(Prisma.sql`e."departmentId" = ${filters.departmentId}::uuid`);
  return Prisma.sql`emp AS (
    SELECT e.id, e."departmentId" AS department_id, e."countryCode" AS country_code, e."jobLevel" AS job_level
    FROM employee e WHERE ${Prisma.join(conditions, ' AND ')}
  )`;
}

/**
 * One row per ACTIVE package of an in-scope employee, as a CTE named `pkg`, with annual
 * totals per category. Grouping by package before any further join keeps package totals
 * from being multiplied by their item count.
 */
export function packageScope(organizationId: string, currency: string | null | undefined): Prisma.Sql {
  return Prisma.sql`pkg AS (
    SELECT c.id, c.employee_id, c.currency_code, emp.department_id, emp.country_code, emp.job_level,
      COALESCE(SUM(i.annual_amount) FILTER (WHERE d.category = 'EARNING'), 0) AS gross,
      COALESCE(SUM(i.annual_amount) FILTER (WHERE d.category = 'EMPLOYER_CONTRIBUTION'), 0) AS employer,
      COALESCE(SUM(i.annual_amount) FILTER (WHERE d.category = 'EMPLOYEE_DEDUCTION'), 0) AS deductions,
      COALESCE(SUM(i.annual_amount) FILTER (WHERE d.category <> 'EMPLOYEE_DEDUCTION'), 0) AS ctc
    FROM employee_compensation c
    JOIN emp ON emp.id = c.employee_id
    JOIN employee_compensation_item i ON i.compensation_id = c.id
    JOIN compensation_component_definition d ON d.id = i.component_definition_id
    WHERE c.organization_id = ${organizationId} AND c.status = 'ACTIVE'
      ${currency ? Prisma.sql`AND c.currency_code = ${currency}` : Prisma.empty}
    GROUP BY c.id, emp.department_id, emp.country_code, emp.job_level
  )`;
}

export function scoped(scope: Scope, body: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`WITH ${employeeScope(scope)}, ${packageScope(scope.organizationId, scope.currency)} ${body}`;
}

/** Salary bands with round edges (1, 2, 2.5 or 5 × 10ⁿ) covering [min, max] in at most `target` bands. */
export function salaryBands(min: number, max: number, target = 10): { start: number; step: number; count: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) throw new Error('Invalid salary range');
  const raw = Math.max((max - min) / target, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw)!;
  const start = Math.floor(min / step) * step;
  const count = Math.max(1, Math.floor((max - start) / step) + 1);
  return { start, step, count };
}

/** Job levels in seniority order; analytics report them in this order. */
export const levelOrder = ['JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR'] as const;

/** Pending-approval age buckets, in days since submission. */
export const ageBuckets = [
  { key: 'today', label: 'Under 1 day', from: 0, to: 1 },
  { key: 'week', label: '1–7 days', from: 1, to: 8 },
  { key: 'fortnight', label: '8–14 days', from: 8, to: 15 },
  { key: 'older', label: 'Over 14 days', from: 15, to: null },
] as const;
