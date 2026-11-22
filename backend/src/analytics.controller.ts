import { Controller, Get, Req } from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';
import { PrismaService } from './prisma/prisma.service.js';
import { CompensationController } from './compensation.controller.js';
import { ageBuckets, employeeScope, parseFilters, salaryBands, scoped, type AnalyticsFilters } from './analytics.js';

type RequestWithQuery = { headers: { cookie?: string }; query?: Record<string, string | undefined> };
type CurrencyRow = { code: string; name: string; symbol: string; decimal_places: number };
type GroupRow = { key: string | null; headcount: number; employees: number; ctc: string };

@Controller()
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService, private readonly compensation: CompensationController) {}

  /**
   * Everything the dashboard and Compensation Insights pages show, for one set of filters.
   * Requires the existing organization-wide compensation read permission.
   */
  @Get('compensation/analytics')
  async analytics(@Req() request: RequestWithQuery) {
    const actor = await this.compensation.actor(request, 'read');
    const filters = parseFilters(request.query);
    const org = actor.organizationId;
    const base = { organizationId: org, filters };

    const [countries, departments, totals, nativeBreakdown] = await Promise.all([
      this.prisma.country.findMany({ where: { is_active: true }, orderBy: { name: 'asc' }, select: { code: true, name: true, currency_code: true } }),
      this.prisma.department.findMany({ where: { organization_id: org }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, is_active: true } }),
      this.prisma.$queryRaw<{ headcount: number; covered: number }[]>(scoped(base, Prisma.sql`SELECT (SELECT count(*) FROM emp)::int AS headcount, (SELECT count(*) FROM pkg)::int AS covered`)),
      // Native totals per currency (never combined). Also the list of currencies available to filter by.
      this.prisma.$queryRaw<(CurrencyRow & { employees: number; annual_ctc: string; gross: string; employer: string; deductions: string })[]>(scoped(base, Prisma.sql`
        SELECT cur.code, cur.name, cur.symbol, cur.decimal_places::int AS decimal_places, count(*)::int AS employees,
          sum(pkg.ctc)::text AS annual_ctc, sum(pkg.gross)::text AS gross, sum(pkg.employer)::text AS employer, sum(pkg.deductions)::text AS deductions
        FROM pkg JOIN currency cur ON cur.code = pkg.currency_code
        GROUP BY cur.code ORDER BY count(*) DESC, cur.code`)),
    ]);

    const selected = filters.currency ? nativeBreakdown.find((row) => row.code === filters.currency) ?? await this.currency(filters.currency) : null;
    // Monetary views need exactly one currency: the selected one, or the only one in scope.
    const currency: CurrencyRow | null = selected ?? (nativeBreakdown.length === 1 ? nativeBreakdown[0] : null);
    const code = currency?.code ?? null;
    const round = (value: string) => currency ? new Prisma.Decimal(value).toDecimalPlaces(currency.decimal_places, Prisma.Decimal.ROUND_HALF_UP).toFixed(currency.decimal_places) : value;

    const [money, byDepartment, byCountry, countryCurrencies, components, matrix, approvals] = await Promise.all([
      code ? this.money(base, code) : null,
      this.group({ ...base, skipDepartment: true, currency: code }, 'department_id'),
      this.group({ ...base, skipCountry: true, currency: code }, 'country_code'),
      this.prisma.$queryRaw<{ country: string; currency: string; employees: number; annual_ctc: string }[]>(scoped({ ...base, skipCountry: true, currency: filters.currency }, Prisma.sql`
        SELECT country_code AS country, currency_code AS currency, count(*)::int AS employees, sum(ctc)::text AS annual_ctc
        FROM pkg GROUP BY country_code, currency_code ORDER BY country_code, count(*) DESC`)),
      code ? this.components(base, code) : null,
      this.matrix(base, code),
      this.approvals(org, filters),
    ]);
    const distribution = code && money && money.employees > 0 ? await this.distribution(base, code, Number(money.min), Number(money.max)) : null;
    const departmentName = new Map(departments.map((item) => [item.id, item.name]));

    return {
      filters,
      options: {
        countries: countries.map((item) => ({ code: item.code, name: item.name, currencyCode: item.currency_code })),
        departments: departments.map((item) => ({ id: item.id, name: item.name, code: item.code, isActive: item.is_active })),
        currencies: nativeBreakdown.map(({ code: value, name, symbol, decimal_places, employees }) => ({ code: value, name, symbol, decimal_places, employees })),
      },
      currency,
      requiresCurrency: !currency && nativeBreakdown.length > 1,
      headcount: totals[0].headcount,
      covered: totals[0].covered,
      native: nativeBreakdown.map((row) => ({ currency: { code: row.code, name: row.name, symbol: row.symbol, decimal_places: row.decimal_places }, employees: row.employees, annualCtc: row.annual_ctc, gross: row.gross, employer: row.employer, deductions: row.deductions })),
      money: money && currency ? { employees: money.employees, total: round(money.total), average: money.average ? round(money.average) : null, median: money.median ? round(money.median) : null, min: money.min ? round(money.min) : null, max: money.max ? round(money.max) : null, gross: round(money.gross), employer: round(money.employer), deductions: round(money.deductions) } : null,
      departments: byDepartment.map((row) => ({ id: row.key, name: row.key ? departmentName.get(row.key) ?? 'Unknown' : 'Unassigned', headcount: row.headcount, employees: row.employees, annualCtc: code ? round(row.ctc) : null })),
      countries: byCountry.map((row) => ({
        code: row.key, name: countries.find((item) => item.code === row.key)?.name ?? row.key, headcount: row.headcount, covered: row.employees,
        totals: countryCurrencies.filter((item) => item.country === row.key).map((item) => ({ currency: item.currency, employees: item.employees, annualCtc: item.annual_ctc })),
      })),
      distribution,
      components: components?.map((row) => ({ id: row.id, code: row.code, name: row.name, category: row.category, employees: row.employees, annual: round(row.annual), oneTime: round(row.one_time) })) ?? null,
      matrix: matrix.map((row) => ({ departmentId: row.department_id, countryCode: row.country_code, headcount: row.headcount, employees: row.employees, averageCtc: code && row.average ? round(row.average) : null })),
      approvals,
    };
  }

  private async currency(code: string): Promise<CurrencyRow | null> {
    const row = await this.prisma.currency.findUnique({ where: { code } });
    return row ? { code: row.code, name: row.name, symbol: row.symbol, decimal_places: row.decimal_places } : null;
  }

  // Employee-level statistics for one currency. The median averages the two middle values for an even count.
  private async money(base: { organizationId: string; filters: AnalyticsFilters }, currency: string) {
    const [row] = await this.prisma.$queryRaw<{ employees: number; total: string; average: string | null; median: string | null; min: string | null; max: string | null; gross: string; employer: string; deductions: string }[]>(scoped({ ...base, currency }, Prisma.sql`,
      ordered AS (SELECT ctc, row_number() OVER (ORDER BY ctc) AS rn, count(*) OVER () AS n FROM pkg)
      SELECT count(*)::int AS employees, COALESCE(sum(ctc), 0)::text AS total, avg(ctc)::text AS average,
        (SELECT avg(ctc) FROM ordered WHERE rn IN ((n + 1) / 2, (n + 2) / 2))::text AS median,
        min(ctc)::text AS min, max(ctc)::text AS max,
        COALESCE(sum(gross), 0)::text AS gross, COALESCE(sum(employer), 0)::text AS employer, COALESCE(sum(deductions), 0)::text AS deductions
      FROM pkg`));
    return row;
  }

  // Headcount (all in-scope employees) next to package count and CTC for the monetary currency.
  private group(scope: { organizationId: string; filters: AnalyticsFilters; skipCountry?: boolean; skipDepartment?: boolean; currency: string | null }, key: 'department_id' | 'country_code') {
    const column = Prisma.raw(key);
    return this.prisma.$queryRaw<GroupRow[]>(scoped(scope, Prisma.sql`
      SELECT g.key, g.headcount, COALESCE(p.employees, 0)::int AS employees, COALESCE(p.ctc, 0)::text AS ctc
      FROM (SELECT ${column}::text AS key, count(*)::int AS headcount FROM emp GROUP BY 1) g
      LEFT JOIN (SELECT ${column}::text AS key, count(*)::int AS employees, sum(ctc) AS ctc FROM pkg GROUP BY 1) p ON p.key IS NOT DISTINCT FROM g.key
      ORDER BY g.headcount DESC`));
  }

  private async distribution(base: { organizationId: string; filters: AnalyticsFilters }, currency: string, min: number, max: number) {
    const { start, step, count } = salaryBands(min, max);
    const rows = await this.prisma.$queryRaw<{ band: number; employees: number }[]>(scoped({ ...base, currency }, Prisma.sql`
      SELECT LEAST(floor((ctc - ${start}) / ${step})::int, ${count - 1}) AS band, count(*)::int AS employees FROM pkg GROUP BY 1 ORDER BY 1`));
    return { start, step, bands: Array.from({ length: count }, (_, band) => ({ from: start + band * step, to: start + (band + 1) * step, employees: rows.find((row) => row.band === band)?.employees ?? 0 })) };
  }

  // Annual cost per component. Deductions are listed by category, never added to CTC.
  private components(base: { organizationId: string; filters: AnalyticsFilters }, currency: string) {
    return this.prisma.$queryRaw<{ id: string; code: string; name: string; category: string; employees: number; annual: string; one_time: string }[]>(scoped({ ...base, currency }, Prisma.sql`
      SELECT d.id::text, d.code, d.name, d.category::text AS category, count(DISTINCT pkg.employee_id)::int AS employees,
        sum(i.annual_amount)::text AS annual,
        COALESCE(sum(i.resolved_amount) FILTER (WHERE i.frequency = 'ONE_TIME'), 0)::text AS one_time
      FROM pkg
      JOIN employee_compensation_item i ON i.compensation_id = pkg.id
      JOIN compensation_component_definition d ON d.id = i.component_definition_id
      GROUP BY d.id ORDER BY d.category, sum(i.annual_amount) DESC`));
  }

  // Department × country headcount over the whole organization (selection is highlighted, not filtered).
  private matrix(base: { organizationId: string; filters: AnalyticsFilters }, currency: string | null) {
    return this.prisma.$queryRaw<{ department_id: string | null; country_code: string; headcount: number; employees: number; average: string | null }[]>(scoped({ ...base, skipCountry: true, skipDepartment: true, currency }, Prisma.sql`
      SELECT g.department_id, g.country_code, g.headcount, COALESCE(p.employees, 0)::int AS employees, p.average
      FROM (SELECT department_id::text, country_code, count(*)::int AS headcount FROM emp GROUP BY 1, 2) g
      LEFT JOIN (SELECT department_id::text, country_code, count(*)::int AS employees, avg(ctc)::text AS average FROM pkg GROUP BY 1, 2) p
        ON p.department_id IS NOT DISTINCT FROM g.department_id AND p.country_code = g.country_code`));
  }

  // Existing maker-checker data: what is waiting, for how long, and the latest requests.
  private async approvals(organizationId: string, filters: AnalyticsFilters) {
    const scope = Prisma.sql`WITH ${employeeScope({ organizationId, filters })}`;
    const currency = filters.currency ? Prisma.sql`AND c.currency_code = ${filters.currency}` : Prisma.empty;
    const [ages, recent] = await Promise.all([
      this.prisma.$queryRaw<{ age: number; requests: number }[]>(Prisma.sql`${scope}
        SELECT floor(extract(epoch FROM now() - COALESCE(c.submitted_at, c.updated_at)) / 86400)::int AS age, count(*)::int AS requests
        FROM employee_compensation c JOIN emp ON emp.id = c.employee_id
        WHERE c.organization_id = ${organizationId} AND c.status = 'PENDING_APPROVAL' ${currency} GROUP BY 1`),
      this.prisma.$queryRaw<{ id: string; employee_id: string; employee_name: string; country_code: string; department: string | null; submitter: string | null; submitted_at: Date | null; effective_from: Date; currency_code: string; annual_ctc: string }[]>(Prisma.sql`${scope}
        SELECT c.id::text, e.id AS employee_id, e."displayName" AS employee_name, e."countryCode" AS country_code, dep.name AS department,
          u.name AS submitter, c.submitted_at, c.effective_from, c.currency_code,
          (SELECT COALESCE(sum(i.annual_amount) FILTER (WHERE d.category <> 'EMPLOYEE_DEDUCTION'), 0) FROM employee_compensation_item i
            JOIN compensation_component_definition d ON d.id = i.component_definition_id WHERE i.compensation_id = c.id)::text AS annual_ctc
        FROM employee_compensation c JOIN emp ON emp.id = c.employee_id JOIN employee e ON e.id = c.employee_id
        LEFT JOIN department dep ON dep.id = e."departmentId" LEFT JOIN "user" u ON u.id = c.submitted_by
        WHERE c.organization_id = ${organizationId} AND c.status = 'PENDING_APPROVAL' ${currency}
        ORDER BY c.submitted_at DESC NULLS LAST LIMIT 6`),
    ]);
    return {
      pending: ages.reduce((sum, row) => sum + row.requests, 0),
      ages: ageBuckets.map((bucket) => ({ key: bucket.key, label: bucket.label, requests: ages.filter((row) => row.age >= bucket.from && (bucket.to === null || row.age < bucket.to)).reduce((sum, row) => sum + row.requests, 0) })),
      recent: recent.map((row) => ({ id: row.id, employee: { id: row.employee_id, displayName: row.employee_name, countryCode: row.country_code, department: row.department }, submitter: row.submitter, submittedAt: row.submitted_at, effectiveFrom: row.effective_from, currencyCode: row.currency_code, annualCtc: row.annual_ctc })),
    };
  }
}
