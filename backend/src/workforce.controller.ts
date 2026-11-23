import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Get, Header, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';
import { PrismaService } from './prisma/prisma.service.js';
import { CompensationController } from './compensation.controller.js';
import { toCsv } from './csv.js';

type RequestWithQuery = { headers: { cookie?: string }; query?: Record<string, string | undefined> };
type DepartmentBody = { name?: string; code?: string; description?: string | null; isActive?: boolean };
type ProfileBody = { departmentId?: string | null; countryCode?: string; jobTitle?: string | null; jobLevel?: string | null; employmentStatus?: string };

export const jobLevels = ['JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR'] as const;
export const employmentStatuses = ['ACTIVE', 'PROBATION', 'ON_LEAVE', 'NOTICE_PERIOD'] as const;
const exportLimit = 25_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sorts = {
  name: Prisma.sql`display_name ASC, id`,
  'ctc-desc': Prisma.sql`ctc DESC NULLS LAST, display_name`,
  'ctc-asc': Prisma.sql`ctc ASC NULLS LAST, display_name`,
  effective: Prisma.sql`effective_from DESC NULLS LAST, display_name`,
} as const;

type DirectoryRow = {
  id: string; display_name: string; email: string | null; employee_code: string | null; job_title: string | null; job_level: string | null; employment_status: string;
  country_code: string; country_name: string; department_id: string | null; department_name: string | null; role: string | null;
  currency_code: string | null; currency_name: string | null; currency_symbol: string | null; decimal_places: number | null;
  effective_from: Date | null; annual_ctc: string | null; monthly_gross: string | null; drafts: number; pending: number; upcoming: boolean; total: number;
};

@Controller()
export class WorkforceController {
  constructor(private readonly prisma: PrismaService, private readonly compensation: CompensationController) {}

  @Get('countries')
  async countries(@Req() request: RequestWithQuery) {
    await this.compensation.actor(request, 'read');
    return this.prisma.country.findMany({ where: { is_active: true }, orderBy: { name: 'asc' }, select: { code: true, name: true, currency_code: true } });
  }

  @Get('departments')
  async departments(@Req() request: RequestWithQuery) {
    const actor = await this.compensation.actor(request, 'read');
    const [rows, counts] = await Promise.all([
      this.prisma.department.findMany({ where: { organization_id: actor.organizationId }, orderBy: { name: 'asc' } }),
      this.prisma.employee.groupBy({ by: ['departmentId'], where: { organizationId: actor.organizationId }, _count: { _all: true } }),
    ]);
    return rows.map((row) => ({ ...row, employees: counts.find((count) => count.departmentId === row.id)?._count._all ?? 0 }));
  }

  @Post('departments')
  async createDepartment(@Req() request: RequestWithQuery, @Body() body: DepartmentBody) {
    const actor = await this.compensation.actor(request, 'write');
    const name = this.departmentName(body?.name);
    const code = body?.code?.trim().toUpperCase() ?? '';
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)) throw new BadRequestException('Code must start with a letter and use 2–32 capital letters, numbers, or underscores');
    try {
      return await this.prisma.department.create({ data: { id: randomUUID(), organization_id: actor.organizationId, name, code, description: this.description(body.description) } });
    } catch (error) { return this.conflict(error); }
  }

  // Name, description, and active state are editable; the code is a stable identifier.
  @Patch('departments/:id')
  async updateDepartment(@Req() request: RequestWithQuery, @Param('id') id: string, @Body() body: DepartmentBody) {
    const actor = await this.compensation.actor(request, 'write');
    if (!uuid.test(id)) throw new NotFoundException('Department not found');
    const existing = await this.prisma.department.findFirst({ where: { id, organization_id: actor.organizationId } });
    if (!existing) throw new NotFoundException('Department not found');
    if (body?.code !== undefined && body.code !== existing.code) throw new BadRequestException('A department code cannot be changed');
    const data: Prisma.departmentUpdateInput = { updated_at: new Date() };
    if (body.name !== undefined) data.name = this.departmentName(body.name);
    if (body.description !== undefined) data.description = this.description(body.description);
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw new BadRequestException('Active must be true or false');
      data.is_active = body.isActive;
    }
    try { return await this.prisma.department.update({ where: { id }, data }); }
    catch (error) { return this.conflict(error); }
  }

  // Organization profile fields used by the directory and analytics. Compensation currency is unaffected.
  @Patch('employees/:employeeId/profile')
  async updateProfile(@Req() request: RequestWithQuery, @Param('employeeId') employeeId: string, @Body() body: ProfileBody) {
    const actor = await this.compensation.actor(request, 'write');
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId: actor.organizationId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const data: Prisma.employeeUncheckedUpdateInput = {};
    if (body?.departmentId !== undefined) {
      if (body.departmentId === null) data.departmentId = null;
      else {
        const department = uuid.test(body.departmentId) ? await this.prisma.department.findFirst({ where: { id: body.departmentId, organization_id: actor.organizationId } }) : null;
        if (!department) throw new BadRequestException('Choose a department from your organization');
        if (!department.is_active && department.id !== employee.departmentId) throw new BadRequestException(`${department.name} is inactive. Reactivate it before assigning people.`);
        data.departmentId = department.id;
      }
    }
    if (body?.countryCode !== undefined) {
      const country = await this.prisma.country.findFirst({ where: { code: String(body.countryCode).toUpperCase(), is_active: true } });
      if (!country) throw new BadRequestException('Choose a supported country');
      data.countryCode = country.code;
    }
    if (body?.jobTitle !== undefined) {
      const title = body.jobTitle?.trim() || null;
      if (title && title.length > 120) throw new BadRequestException('Keep the job title under 120 characters');
      data.jobTitle = title;
    }
    if (body?.jobLevel !== undefined) {
      if (body.jobLevel !== null && !(jobLevels as readonly string[]).includes(body.jobLevel)) throw new BadRequestException('Choose a job level');
      data.jobLevel = body.jobLevel;
    }
    if (body?.employmentStatus !== undefined) {
      if (!(employmentStatuses as readonly string[]).includes(body.employmentStatus)) throw new BadRequestException('Choose an employment status');
      data.employmentStatus = body.employmentStatus;
    }
    return this.prisma.employee.update({ where: { id: employee.id }, data, include: { department: { select: { id: true, name: true } }, country: { select: { code: true, name: true, currency_code: true } } } });
  }

  /**
   * Shared filter and query construction for the directory page and its CSV export, so the
   * export always contains exactly what the filtered directory shows.
   */
  private directoryQuery(org: string, query: Record<string, string | undefined>) {
    const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(5, Number.parseInt(query.pageSize ?? '10', 10) || 10));
    const search = (query.q ?? '').trim().slice(0, 100);
    const role = ['admin', 'hr', 'employee'].includes(query.role ?? '') ? query.role! : null;
    const status = ['active', 'none', 'draft', 'pending'].includes(query.status ?? '') ? query.status! : null;
    const sort = sorts[(query.sort ?? 'name') as keyof typeof sorts] ?? sorts.name;
    const department = query.department === 'none' ? 'none' : query.department && uuid.test(query.department) ? query.department : null;
    const country = /^[A-Z]{2}$/.test(query.country ?? '') ? query.country! : null;
    const currency = /^[A-Z]{3}$/.test(query.currency ?? '') ? query.currency! : null;
    const amount = (value: string | undefined) => value && /^\d+(\.\d+)?$/.test(value) ? value : null;
    // A salary range only means something within one currency.
    const ctcMin = currency ? amount(query.ctcMin) : null;
    const ctcMax = currency ? amount(query.ctcMax) : null;

    const where = [Prisma.sql`e."organizationId" = ${org}`];
    if (search) {
      const like = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      where.push(Prisma.sql`(e."displayName" ILIKE ${like} OR e.email ILIKE ${like} OR e."employeeCode" ILIKE ${like} OR e."jobTitle" ILIKE ${like})`);
    }
    if (role === 'employee') where.push(Prisma.sql`(m.role IS NULL OR m.role = 'employee')`);
    else if (role) where.push(Prisma.sql`m.role = ${role}`);
    if (department === 'none') where.push(Prisma.sql`e."departmentId" IS NULL`);
    else if (department) where.push(Prisma.sql`e."departmentId" = ${department}::uuid`);
    if (country) where.push(Prisma.sql`e."countryCode" = ${country}`);
    const rowFilters = [Prisma.sql`TRUE`];
    if (currency) rowFilters.push(Prisma.sql`pkg.currency_code = ${currency}`);
    if (ctcMin) rowFilters.push(Prisma.sql`pkg.ctc >= ${ctcMin}::numeric`);
    if (ctcMax) rowFilters.push(Prisma.sql`pkg.ctc < ${ctcMax}::numeric`);

    const rows = Prisma.sql`WITH base AS (
        SELECT e.id, e."displayName" AS display_name, e.email, e."employeeCode" AS employee_code, e."jobTitle" AS job_title, e."jobLevel" AS job_level,
          e."employmentStatus" AS employment_status, e."countryCode" AS country_code, co.name AS country_name,
          e."departmentId"::text AS department_id, dep.name AS department_name, m.role
        FROM employee e
        JOIN country co ON co.code = e."countryCode"
        LEFT JOIN department dep ON dep.id = e."departmentId"
        LEFT JOIN member m ON m."userId" = e."userId" AND m."organizationId" = e."organizationId"
        WHERE ${Prisma.join(where, ' AND ')}
      ), pkg AS (
        SELECT c.employee_id, c.currency_code, c.effective_from,
          COALESCE(SUM(i.annual_amount) FILTER (WHERE d.category <> 'EMPLOYEE_DEDUCTION'), 0) AS ctc,
          COALESCE(SUM(i.annual_amount) FILTER (WHERE d.category = 'EARNING'), 0) AS gross
        FROM employee_compensation c
        JOIN base ON base.id = c.employee_id
        JOIN employee_compensation_item i ON i.compensation_id = c.id
        JOIN compensation_component_definition d ON d.id = i.component_definition_id
        WHERE c.organization_id = ${org} AND c.status = 'ACTIVE'
        GROUP BY c.id
      ), work AS (
        SELECT employee_id, count(*) FILTER (WHERE status = 'DRAFT')::int AS drafts, count(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending, bool_or(status = 'SCHEDULED') AS upcoming
        FROM employee_compensation WHERE organization_id = ${org} AND status IN ('DRAFT', 'PENDING_APPROVAL', 'SCHEDULED') GROUP BY employee_id
      ), rows AS (
        SELECT base.*, pkg.currency_code, pkg.effective_from, pkg.ctc, pkg.gross,
          COALESCE(work.drafts, 0) AS drafts, COALESCE(work.pending, 0) AS pending, COALESCE(work.upcoming, FALSE) AS upcoming
        FROM base LEFT JOIN pkg ON pkg.employee_id = base.id LEFT JOIN work ON work.employee_id = base.id
        WHERE ${Prisma.join(rowFilters, ' AND ')}
      )`;
    const statusFilter = status === 'active' ? Prisma.sql`ctc IS NOT NULL` : status === 'none' ? Prisma.sql`ctc IS NULL` : status === 'draft' ? Prisma.sql`drafts > 0` : status === 'pending' ? Prisma.sql`pending > 0` : Prisma.sql`TRUE`;
    return { rows, statusFilter, sort, page, pageSize };
  }

  /**
   * Paginated directory: search, filter by role, package status, department, country,
   * package currency and annual CTC range, then sort. Computed in SQL so it stays fast
   * with tens of thousands of people.
   */
  @Get('employees/directory')
  async directory(@Req() request: RequestWithQuery) {
    const actor = await this.compensation.actor(request, 'read');
    const { rows, statusFilter, sort, page, pageSize } = this.directoryQuery(actor.organizationId, request.query ?? {});
    const [counts, list] = await Promise.all([
      this.prisma.$queryRaw<{ all: number; active: number; none: number; draft: number; pending: number }[]>(Prisma.sql`${rows}
        SELECT count(*)::int AS "all", count(ctc)::int AS active, (count(*) - count(ctc))::int AS none,
          count(*) FILTER (WHERE drafts > 0)::int AS draft, count(*) FILTER (WHERE pending > 0)::int AS pending FROM rows`),
      this.prisma.$queryRaw<DirectoryRow[]>(Prisma.sql`${rows}
        SELECT rows.id, display_name, email, employee_code, job_title, job_level, employment_status, country_code, country_name, department_id, department_name, role,
          currency_code, cur.name AS currency_name, cur.symbol AS currency_symbol, cur.decimal_places::int AS decimal_places,
          effective_from, round(ctc, COALESCE(cur.decimal_places, 2))::text AS annual_ctc, round(gross / 12, COALESCE(cur.decimal_places, 2))::text AS monthly_gross,
          drafts, pending, upcoming, count(*) OVER ()::int AS total
        FROM rows LEFT JOIN currency cur ON cur.code = rows.currency_code
        WHERE ${statusFilter}
        ORDER BY ${sort}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    ]);
    const total = list[0]?.total ?? (page > 1 ? await this.countMatching(rows, statusFilter) : 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: list.map((row) => ({
        id: row.id, displayName: row.display_name, email: row.email, employeeCode: row.employee_code, jobTitle: row.job_title, jobLevel: row.job_level,
        employmentStatus: row.employment_status, role: row.role, country: { code: row.country_code, name: row.country_name },
        department: row.department_id ? { id: row.department_id, name: row.department_name } : null,
        drafts: row.drafts, pending: row.pending, upcoming: row.upcoming,
        active: row.currency_code ? { currency: { code: row.currency_code, name: row.currency_name, symbol: row.currency_symbol, decimal_places: row.decimal_places }, effectiveFrom: row.effective_from, annualCtc: row.annual_ctc, monthlyGross: row.monthly_gross } : null,
      })),
      page: Math.min(page, pages), pageSize, total, pages, counts: counts[0],
    };
  }

  /** The filtered directory as CSV (every matching row, not just one page). Same permission as viewing it. */
  @Get('employees/directory/export')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('cache-control', 'no-store')
  async exportDirectory(@Req() request: RequestWithQuery) {
    const actor = await this.compensation.actor(request, 'read');
    const { rows, statusFilter, sort } = this.directoryQuery(actor.organizationId, request.query ?? {});
    const list = await this.prisma.$queryRaw<(Omit<DirectoryRow, 'total' | 'currency_name' | 'currency_symbol' | 'decimal_places'> & { annual_gross: string | null; annual_deductions: string | null })[]>(Prisma.sql`${rows}
      SELECT rows.id, display_name, email, employee_code, job_title, job_level, employment_status, country_code, country_name, department_id, department_name, role,
        currency_code, effective_from, round(ctc, COALESCE(cur.decimal_places, 2))::text AS annual_ctc, round(gross, COALESCE(cur.decimal_places, 2))::text AS annual_gross,
        round(gross / 12, COALESCE(cur.decimal_places, 2))::text AS monthly_gross, drafts, pending, upcoming
      FROM rows LEFT JOIN currency cur ON cur.code = rows.currency_code
      WHERE ${statusFilter}
      ORDER BY ${sort}
      LIMIT ${exportLimit}`);
    return '\uFEFF' + toCsv(
      ['employee_code', 'name', 'email', 'role', 'department', 'country', 'job_title', 'job_level', 'employment_status', 'currency', 'annual_ctc', 'annual_gross', 'monthly_gross', 'effective_from', 'pending_approvals', 'drafts', 'upcoming_package'],
      list.map((row) => [row.employee_code, row.display_name, row.email, row.role ?? 'employee', row.department_name, row.country_code, row.job_title, row.job_level, row.employment_status, row.currency_code, row.annual_ctc, row.annual_gross, row.monthly_gross, row.effective_from ? row.effective_from.toISOString().slice(0, 10) : null, row.pending, row.drafts, row.upcoming ? 'yes' : 'no']),
    );
  }

  private async countMatching(rows: Prisma.Sql, statusFilter: Prisma.Sql): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`${rows} SELECT count(*)::int AS total FROM rows WHERE ${statusFilter}`);
    return row.total;
  }

  private departmentName(value: unknown): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) throw new BadRequestException('Enter a department name');
    if (name.length > 80) throw new BadRequestException('Keep the name under 80 characters');
    return name;
  }

  private description(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value !== 'string') throw new BadRequestException('Description must be text');
    const text = value.trim();
    if (text.length > 500) throw new BadRequestException('Keep the description under 500 characters');
    return text || null;
  }

  private conflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('A department with that name or code already exists');
    throw error;
  }
}
