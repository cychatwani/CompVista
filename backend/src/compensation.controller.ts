import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';
import { getSessionFromCookie } from './auth-session.js';
import { loadTotpState, nextAuthStep } from './totp-policy.js';
import { PrismaService } from './prisma/prisma.service.js';
import { calculateCompensation, CompensationValidationError, summarizeResolvedCompensation, type Rule } from './compensation-calculation.js';
import { canAccessCompensation } from './compensation-access.js';

type RequestWithCookie = { headers: { cookie?: string } };
type PackageBody = { currencyCode?: string; effectiveFrom?: string; effectiveTo?: string | null; status?: 'DRAFT' | 'ACTIVE'; items?: Rule[]; version?: number };
type ComponentBody = { code?: string; name?: string; category?: 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION'; isBasic?: boolean; isActive?: boolean };

function validDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('effectiveFrom must be a date in YYYY-MM-DD format');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid effectiveFrom date');
  return date;
}
function validEndDate(value: unknown, start: Date): Date | null {
  if (value == null || value === '') return null;
  const end = validDate(value);
  if (end < start) throw new BadRequestException('effectiveTo must be on or after effectiveFrom');
  return end;
}
function mapError(error: unknown): never {
  if (error instanceof CompensationValidationError) throw new BadRequestException(error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002' || error.code === 'P2034') throw new ConflictException('Compensation changed concurrently or conflicts with an existing record');
    if (error.code === 'P2003') throw new BadRequestException('Referenced employee, currency, or component is unavailable');
  }
  throw error;
}

@Controller()
export class CompensationController {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(request: RequestWithCookie, kind: 'read' | 'write') {
    const session = await getSessionFromCookie(request.headers.cookie);
    if (!session?.user) throw new UnauthorizedException();
    const state = await loadTotpState(this.prisma, session.user.id);
    if (!state || nextAuthStep(state) !== 'AUTHENTICATED') throw new ForbiddenException('Complete sign-in requirements first');
    const member = await this.prisma.member.findUnique({ where: { userId: session.user.id }, include: { organization_role: { include: { organization_role_permissions: true } } } });
    if (!canAccessCompensation(member, session.session.activeOrganizationId, kind)) throw new ForbiddenException('Compensation permission required');
    if (!member) throw new ForbiddenException('Organization access denied');
    return { userId: session.user.id, organizationId: member.organizationId };
  }

  private async employee(employeeId: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId }, include: { organization: true } });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private async calculate(organizationId: string, body: PackageBody) {
    if (!body || typeof body.currencyCode !== 'string' || !Array.isArray(body.items)) throw new BadRequestException('Currency and items are required');
    const currency = await this.prisma.currency.findUnique({ where: { code: body.currencyCode.toUpperCase() } });
    if (!currency) throw new BadRequestException('Currency is unavailable');
    const definitions = await this.prisma.compensation_component_definition.findMany({ where: { organization_id: organizationId } });
    try {
      return calculateCompensation({
        currency: { code: currency.code, decimalPlaces: currency.decimal_places, isActive: currency.is_active },
        definitions: definitions.map((item) => ({ id: item.id, category: item.category, isBasic: item.is_basic, isActive: item.is_active })),
        items: body.items,
      });
    } catch (error) { return mapError(error); }
  }

  private async packageDetail(id: string, organizationId: string) {
    return this.prisma.employee_compensation.findFirst({ where: { id, organization_id: organizationId }, include: { currency: true, items: { include: { definition: true }, orderBy: { created_at: 'asc' } } } });
  }

  private withSummary<T extends { currency: { code: string; decimal_places: number }; items: { resolved_monthly_amount: Prisma.Decimal; definition: { category: 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION' } }[] }>(row: T) {
    return { ...row, summary: summarizeResolvedCompensation({ code: row.currency.code, decimalPlaces: row.currency.decimal_places }, row.items.map((item) => ({ resolvedMonthlyAmount: item.resolved_monthly_amount.toString(), category: item.definition.category }))) };
  }

  @Get('currencies')
  async currencies(@Req() request: RequestWithCookie) {
    await this.actor(request, 'read');
    return this.prisma.currency.findMany({ where: { is_active: true }, orderBy: { code: 'asc' } });
  }

  @Get('compensation/components')
  async components(@Req() request: RequestWithCookie) {
    const actor = await this.actor(request, 'read');
    return this.prisma.compensation_component_definition.findMany({ where: { organization_id: actor.organizationId }, orderBy: { code: 'asc' } });
  }

  @Post('compensation/components')
  async createComponent(@Req() request: RequestWithCookie, @Body() body: ComponentBody) {
    const actor = await this.actor(request, 'write');
    if (!body || !/^[A-Z][A-Z0-9_]*$/.test(body.code ?? '') || !body.name?.trim() || !['EARNING', 'EMPLOYER_CONTRIBUTION', 'EMPLOYEE_DEDUCTION'].includes(body.category ?? '')) throw new BadRequestException('Valid code, name, and category are required');
    if (body.isBasic && body.category !== 'EARNING') throw new BadRequestException('Basic Salary must be an earning');
    try { return await this.prisma.compensation_component_definition.create({ data: { id: randomUUID(), organization_id: actor.organizationId, code: body.code!, name: body.name.trim(), category: body.category!, is_basic: !!body.isBasic } }); }
    catch (error) { return mapError(error); }
  }

  @Patch('compensation/components/:id')
  async updateComponent(@Req() request: RequestWithCookie, @Param('id') id: string, @Body() body: ComponentBody) {
    const actor = await this.actor(request, 'write');
    if (!body || (body.name === undefined && body.isActive === undefined) || (body.name !== undefined && !body.name.trim()) || (body.isActive !== undefined && typeof body.isActive !== 'boolean') || body.code !== undefined || body.category !== undefined || body.isBasic !== undefined) throw new BadRequestException('Only name and active status may change');
    const existing = await this.prisma.compensation_component_definition.findFirst({ where: { id, organization_id: actor.organizationId } });
    if (!existing) throw new NotFoundException('Component not found');
    if (existing.is_basic && body.isActive === false) throw new BadRequestException('Basic Salary cannot be deactivated');
    return this.prisma.compensation_component_definition.update({ where: { id }, data: { ...(body.name !== undefined ? { name: body.name.trim() } : {}), ...(body.isActive !== undefined ? { is_active: body.isActive } : {}), updated_at: new Date() } });
  }

  @Post('compensation/preview')
  async preview(@Req() request: RequestWithCookie, @Body() body: PackageBody) {
    const actor = await this.actor(request, 'write');
    return this.calculate(actor.organizationId, body);
  }

  @Get('employees')
  async employees(@Req() request: RequestWithCookie) {
    const actor = await this.actor(request, 'read');
    return this.prisma.employee.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, displayName: true, organizationId: true }, orderBy: { displayName: 'asc' } });
  }

  @Get('employees/:employeeId/compensation')
  async current(@Req() request: RequestWithCookie, @Param('employeeId') employeeId: string) {
    const actor = await this.actor(request, 'read');
    const employee = await this.employee(employeeId, actor.organizationId);
    const packages = await this.prisma.employee_compensation.findMany({ where: { employee_id: employeeId, organization_id: actor.organizationId, status: { in: ['ACTIVE', 'DRAFT'] } }, include: { currency: true, items: { include: { definition: true } } }, orderBy: { created_at: 'desc' } });
    const active = packages.find((item) => item.status === 'ACTIVE');
    return { employee, active: active ? this.withSummary(active) : null, drafts: packages.filter((item) => item.status === 'DRAFT').map((item) => this.withSummary(item)) };
  }

  @Get('employees/:employeeId/compensation/history')
  async history(@Req() request: RequestWithCookie, @Param('employeeId') employeeId: string) {
    const actor = await this.actor(request, 'read');
    await this.employee(employeeId, actor.organizationId);
    const rows = await this.prisma.employee_compensation.findMany({ where: { employee_id: employeeId, organization_id: actor.organizationId, status: { in: ['ACTIVE', 'SUPERSEDED'] } }, include: { currency: true, items: { include: { definition: true } } }, orderBy: { effective_from: 'desc' } });
    return rows.map((row) => this.withSummary(row));
  }

  @Post('employees/:employeeId/compensation')
  async createPackage(@Req() request: RequestWithCookie, @Param('employeeId') employeeId: string, @Body() body: PackageBody) {
    const actor = await this.actor(request, 'write');
    await this.employee(employeeId, actor.organizationId);
    if (body?.status !== 'DRAFT' && body?.status !== 'ACTIVE') throw new BadRequestException('Status must be DRAFT or ACTIVE');
    const effectiveFrom = validDate(body.effectiveFrom);
    const effectiveTo = validEndDate(body.effectiveTo, effectiveFrom);
    const result = await this.calculate(actor.organizationId, body);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM employee WHERE id = ${employeeId} FOR UPDATE`;
        if (body.status === 'ACTIVE' && await tx.employee_compensation.count({ where: { employee_id: employeeId, status: { in: ['ACTIVE', 'SUPERSEDED'] } } })) throw new ConflictException('Initial activation requires no applied compensation history');
        const packageRow = await tx.employee_compensation.create({ data: { id: randomUUID(), organization_id: actor.organizationId, employee_id: employeeId, currency_code: result.currencyCode, status: 'DRAFT', effective_from: effectiveFrom, effective_to: effectiveTo, created_by: actor.userId } });
        await tx.employee_compensation_item.createMany({ data: result.items.map((item) => ({ id: randomUUID(), compensation_id: packageRow.id, component_definition_id: item.componentDefinitionId, calculation_type: item.calculationType, fixed_amount: item.fixedAmount ?? null, percentage: item.percentage ?? null, resolved_monthly_amount: item.resolvedMonthlyAmount })) });
        if (body.status === 'ACTIVE') await tx.employee_compensation.update({ where: { id: packageRow.id }, data: { status: 'ACTIVE', updated_at: new Date() } });
        return packageRow.id;
      });
      const row = await this.packageDetail(id, actor.organizationId);
      return { package: row && this.withSummary(row), calculation: result };
    } catch (error) { return mapError(error); }
  }

  @Patch('compensation/:id')
  async updateDraft(@Req() request: RequestWithCookie, @Param('id') id: string, @Body() body: PackageBody) {
    const actor = await this.actor(request, 'write');
    if (!Number.isSafeInteger(body?.version) || body.version! < 1 || body.status !== undefined) throw new BadRequestException('A draft version is required; status cannot be changed');
    const existing = await this.packageDetail(id, actor.organizationId);
    if (!existing) throw new NotFoundException('Compensation package not found');
    if (existing.status !== 'DRAFT') throw new ConflictException('Applied compensation is immutable');
    const effectiveFrom = validDate(body.effectiveFrom);
    const effectiveTo = validEndDate(body.effectiveTo, effectiveFrom);
    const result = await this.calculate(actor.organizationId, body);
    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.employee_compensation.updateMany({ where: { id, organization_id: actor.organizationId, status: 'DRAFT', version: body.version }, data: { currency_code: result.currencyCode, effective_from: effectiveFrom, effective_to: effectiveTo, version: { increment: 1 }, updated_at: new Date() } });
        if (updated.count !== 1) throw new ConflictException('Draft version changed; reload before saving');
        await tx.employee_compensation_item.deleteMany({ where: { compensation_id: id } });
        await tx.employee_compensation_item.createMany({ data: result.items.map((item) => ({ id: randomUUID(), compensation_id: id, component_definition_id: item.componentDefinitionId, calculation_type: item.calculationType, fixed_amount: item.fixedAmount ?? null, percentage: item.percentage ?? null, resolved_monthly_amount: item.resolvedMonthlyAmount })) });
      });
      const row = await this.packageDetail(id, actor.organizationId);
      return { package: row && this.withSummary(row), calculation: result };
    } catch (error) { return mapError(error); }
  }

  @Delete('compensation/:id')
  async deleteDraft(@Req() request: RequestWithCookie, @Param('id') id: string, @Body() body: { version?: number }) {
    const actor = await this.actor(request, 'write');
    if (!Number.isSafeInteger(body?.version)) throw new BadRequestException('Draft version is required');
    const deleted = await this.prisma.employee_compensation.deleteMany({ where: { id, organization_id: actor.organizationId, status: 'DRAFT', version: body.version } });
    if (!deleted.count) throw new ConflictException('Draft not found or version changed');
    return { deleted: true };
  }
}
