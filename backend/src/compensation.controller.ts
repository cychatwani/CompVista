import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';
import { auth } from './auth.js';
import { AccessController } from './access.controller.js';
import { PrismaService } from './prisma/prisma.service.js';
import { calculateCompensation, CompensationValidationError, frequencies, summarizeResolvedCompensation, type Frequency, type Rule } from './compensation-calculation.js';
import { canAccessCompensation, canViewOwnCompensation } from './compensation-access.js';
import { appliedStatus, canApprove, canPropose, dayBefore, submissionOutcome, today, type WorkflowActor } from './compensation-workflow.js';

type RequestWithCookie = { headers: { cookie?: string } };
type PackageBody = { currencyCode?: string; effectiveFrom?: string; effectiveTo?: string | null; status?: 'DRAFT' | 'SUBMIT' | 'ACTIVE'; items?: Rule[]; version?: number; note?: string };
type ComponentBody = { code?: string; name?: string; category?: 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION'; isBasic?: boolean; isActive?: boolean; defaultFrequency?: Frequency };

function validDate(value: unknown, label = 'Effective from date'): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} is required (YYYY-MM-DD)`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a real calendar date`);
  return date;
}
function validEndDate(value: unknown, start: Date): Date | null {
  if (value == null || value === '') return null;
  const end = validDate(value, 'Effective to date');
  if (end < start) throw new BadRequestException('Effective to date must be on or after the effective from date');
  return end;
}
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

type ChangeRequestBody = { target?: unknown; componentDefinitionId?: unknown; note?: unknown };
export type ChangeRequest = { target: 'component' | 'effectiveFrom'; componentDefinitionId: string | null; label: string; note: string };
// Validates an approver's per-item feedback against the package's own components. Labels come
// from the server so the proposer always sees the real component name.
export function parseChangeRequests(value: unknown, components: { id: string; name: string }[]): ChangeRequest[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 50) throw new BadRequestException('Requested changes are malformed');
  const seen = new Set<string>();
  return value.map((raw: ChangeRequestBody) => {
    const note = typeof raw?.note === 'string' ? raw.note.trim().slice(0, 500) : '';
    if (!note) throw new BadRequestException('Every flagged item needs a note');
    if (raw.target === 'effectiveFrom') {
      if (seen.has('effectiveFrom')) throw new BadRequestException('The effective date is flagged twice');
      seen.add('effectiveFrom');
      return { target: 'effectiveFrom' as const, componentDefinitionId: null, label: 'Effective date', note };
    }
    const component = components.find((item) => item.id === raw?.componentDefinitionId);
    if (raw?.target !== 'component' || !component) throw new BadRequestException('A flagged component is not part of this package');
    if (seen.has(component.id)) throw new BadRequestException(`${component.name} is flagged twice`);
    seen.add(component.id);
    return { target: 'component' as const, componentDefinitionId: component.id, label: component.name, note };
  });
}
function mapError(error: unknown): never {
  if (error instanceof CompensationValidationError) throw new BadRequestException(error.message);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002' || error.code === 'P2034') throw new ConflictException('Compensation changed concurrently or conflicts with an existing record');
    if (error.code === 'P2003') throw new BadRequestException('Referenced employee, currency, or component is unavailable');
  }
  const message = error instanceof Error ? error.message : '';
  if (message.includes('no_overlapping_applied_compensation')) throw new ConflictException('These dates overlap a package that was already applied. Choose an effective date after the current package starts.');
  if (message.includes('Applied compensation is immutable') || message.includes('Pending compensation can only')) throw new ConflictException('This package was already submitted or applied and can no longer be changed. Reload to see its current state.');
  if (message.includes('Inactive component')) throw new BadRequestException('One of the components has been deactivated. Remove it and try again.');
  if (message.includes('used by live packages')) throw new ConflictException('This component is used by active or pending packages, so it can\'t be deactivated.');
  if (message.includes('before deleting it')) throw new ConflictException('Deactivate the component before deleting it.');
  throw error;
}

@Controller()
export class CompensationController {
  constructor(private readonly prisma: PrismaService) {}

  /** Signed-in member with the existing organization-wide compensation permission for `kind`. */
  async actor(request: RequestWithCookie, kind: 'read' | 'write' | 'approve') {
    await new AccessController(this.prisma).check(request);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: request.headers.cookie ?? '' }) });
    if (!session?.user) throw new UnauthorizedException();
    const member = await this.prisma.member.findUnique({ where: { userId: session.user.id }, include: { organization_role: { include: { organization_role_permissions: true } } } });
    if (!canAccessCompensation(member, session.session.activeOrganizationId, kind)) throw new ForbiddenException('Compensation permission required');
    if (!member) throw new ForbiddenException('Organization access denied');
    const workflow: WorkflowActor = { role: member.role, userId: session.user.id, flags: member.organization_role?.organization_role_permissions ?? null };
    return { userId: session.user.id, organizationId: member.organizationId, workflow };
  }

  private async proposer(request: RequestWithCookie, employeeId: string) {
    const actor = await this.actor(request, 'write');
    const employee = await this.employee(employeeId, actor.organizationId);
    if (!canPropose(actor.workflow, employee.userId)) throw new ForbiddenException(employee.userId === actor.userId ? 'You cannot propose changes to your own compensation' : 'Your role cannot propose compensation changes');
    return { actor, employee };
  }

  // Applies a package. One starting after today becomes the employee's single upcoming (SCHEDULED)
  // package; otherwise it becomes ACTIVE, superseding the current package the day before it starts.
  private async activate(tx: Prisma.TransactionClient, packageId: string, employeeId: string, effectiveFrom: Date, extra: Prisma.employee_compensationUncheckedUpdateInput = {}): Promise<'ACTIVE' | 'SCHEDULED'> {
    await tx.$queryRaw`SELECT id FROM employee WHERE id = ${employeeId} FOR UPDATE`;
    const upcoming = await tx.employee_compensation.findFirst({ where: { employee_id: employeeId, status: 'SCHEDULED', id: { not: packageId } } });
    if (upcoming) throw new ConflictException(`An upcoming package already starts ${isoDate(upcoming.effective_from)}. An approver must cancel it before another can be applied.`);
    const current = await tx.employee_compensation.findFirst({ where: { employee_id: employeeId, status: 'ACTIVE', id: { not: packageId } } });
    if (current && effectiveFrom <= current.effective_from) throw new ConflictException(`The new package must start after the current one (${isoDate(current.effective_from)}).`);
    const status = appliedStatus(effectiveFrom);
    if (current && status === 'ACTIVE') await tx.employee_compensation.update({ where: { id: current.id }, data: { status: 'SUPERSEDED', effective_to: dayBefore(effectiveFrom), updated_at: new Date() } });
    await tx.employee_compensation.update({ where: { id: packageId }, data: { ...extra, status, updated_at: new Date() } });
    return status;
  }

  /** Promotes every upcoming package whose effective date has arrived. Runs nightly and on startup. */
  async promoteDuePackages(): Promise<number> {
    const due = await this.prisma.employee_compensation.findMany({ where: { status: 'SCHEDULED', effective_from: { lte: today() } } });
    let promoted = 0;
    for (const row of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM employee WHERE id = ${row.employee_id} FOR UPDATE`;
          if (!await tx.employee_compensation.findFirst({ where: { id: row.id, status: 'SCHEDULED' } })) return;
          const current = await tx.employee_compensation.findFirst({ where: { employee_id: row.employee_id, status: 'ACTIVE' } });
          if (current) await tx.employee_compensation.update({ where: { id: current.id }, data: { status: 'SUPERSEDED', effective_to: dayBefore(row.effective_from), updated_at: new Date() } });
          await tx.employee_compensation.update({ where: { id: row.id }, data: { status: 'ACTIVE', updated_at: new Date() } });
          promoted += 1;
        });
      } catch (error) { console.error(`Could not promote upcoming compensation ${row.id}`, error); }
    }
    return promoted;
  }

  // Rejects a submission that cannot be applied, before anything is written.
  private async assertStartsAfterActive(employeeId: string, effectiveFrom: Date) {
    const upcoming = await this.prisma.employee_compensation.findFirst({ where: { employee_id: employeeId, status: 'SCHEDULED' } });
    if (upcoming) throw new ConflictException(`An upcoming package already starts ${isoDate(upcoming.effective_from)}. An approver must cancel it before another can be submitted.`);
    const current = await this.prisma.employee_compensation.findFirst({ where: { employee_id: employeeId, status: 'ACTIVE' } });
    if (current && effectiveFrom <= current.effective_from) throw new BadRequestException(`Effective from date must be after ${isoDate(current.effective_from)}, when the current package started.`);
  }

  private async employee(employeeId: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId }, include: { organization: true, department: { select: { id: true, name: true, is_active: true } }, country: { select: { code: true, name: true, currency_code: true } } } });
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
        definitions: definitions.map((item) => ({ id: item.id, name: item.name, category: item.category, isBasic: item.is_basic, isActive: item.is_active })),
        items: body.items,
      });
    } catch (error) { return mapError(error); }
  }

  private async packageDetail(id: string, organizationId: string) {
    return this.prisma.employee_compensation.findFirst({ where: { id, organization_id: organizationId }, include: { currency: true, items: { include: { definition: true }, orderBy: { created_at: 'asc' } } } });
  }

  private withSummary<T extends { currency: { code: string; decimal_places: number }; items: { resolved_amount: Prisma.Decimal; frequency: Frequency; definition: { category: 'EARNING' | 'EMPLOYER_CONTRIBUTION' | 'EMPLOYEE_DEDUCTION' } }[] }>(row: T) {
    return { ...row, summary: summarizeResolvedCompensation({ code: row.currency.code, decimalPlaces: row.currency.decimal_places }, row.items.map((item) => ({ resolvedAmount: item.resolved_amount.toString(), frequency: item.frequency, category: item.definition.category }))) };
  }

  // Self-service: the caller's own applied compensation only. Drafts are never exposed here.
  private async self(request: RequestWithCookie) {
    await new AccessController(this.prisma).check(request);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: request.headers.cookie ?? '' }) });
    if (!session?.user) throw new UnauthorizedException();
    const member = await this.prisma.member.findUnique({ where: { userId: session.user.id }, include: { organization_role: { include: { organization_role_permissions: true } } } });
    if (!canViewOwnCompensation(member, session.session.activeOrganizationId)) throw new ForbiddenException('Compensation permission required');
    const employee = await this.prisma.employee.findFirst({ where: { userId: session.user.id, organizationId: member!.organizationId }, include: { organization: true, department: { select: { id: true, name: true } }, country: { select: { code: true, name: true } } } });
    if (!employee) throw new NotFoundException('Employee profile not found');
    return employee;
  }

  @Get('me/capabilities')
  async capabilities(@Req() request: RequestWithCookie) {
    await new AccessController(this.prisma).check(request);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: request.headers.cookie ?? '' }) });
    if (!session?.user) throw new UnauthorizedException();
    const member = await this.prisma.member.findUnique({ where: { userId: session.user.id }, include: { organization_role: { include: { organization_role_permissions: true } } } });
    const activeOrganizationId = session.session.activeOrganizationId;
    return {
      canViewOthers: canAccessCompensation(member, activeOrganizationId, 'read'),
      canManageOthers: canAccessCompensation(member, activeOrganizationId, 'write'),
      canViewOwn: canViewOwnCompensation(member, activeOrganizationId),
      canApprove: canAccessCompensation(member, activeOrganizationId, 'approve'),
      pendingApprovals: canAccessCompensation(member, activeOrganizationId, 'approve') && member ? await this.prisma.employee_compensation.count({ where: { organization_id: member.organizationId, status: 'PENDING_APPROVAL' } }) : 0,
    };
  }

  @Get('me/compensation')
  async myCompensation(@Req() request: RequestWithCookie) {
    const employee = await this.self(request);
    const rows = await this.prisma.employee_compensation.findMany({ where: { employee_id: employee.id, organization_id: employee.organizationId, status: { in: ['ACTIVE', 'SUPERSEDED'] } }, include: { currency: true, items: { include: { definition: true }, orderBy: { created_at: 'asc' } } }, orderBy: { effective_from: 'desc' } });
    const active = rows.find((row) => row.status === 'ACTIVE');
    return { employee: { id: employee.id, displayName: employee.displayName, organizationId: employee.organizationId, organization: { name: employee.organization.name }, countryCode: employee.countryCode, country: employee.country, department: employee.department, jobTitle: employee.jobTitle }, active: active ? this.withSummary(active) : null, history: rows.map((row) => this.withSummary(row)) };
  }

  @Get('currencies')
  async currencies(@Req() request: RequestWithCookie) {
    await this.actor(request, 'read');
    return this.prisma.currency.findMany({ where: { is_active: true }, orderBy: { code: 'asc' } });
  }

  // Package lines in ACTIVE or PENDING_APPROVAL packages that use each definition.
  private async liveUsage(organizationId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.employee_compensation_item.groupBy({ by: ['component_definition_id'], where: { compensation: { organization_id: organizationId, status: { in: ['ACTIVE', 'PENDING_APPROVAL', 'SCHEDULED'] } } }, _count: { _all: true } });
    return new Map(rows.map((row) => [row.component_definition_id, row._count._all]));
  }

  // Definitions (deleted ones hidden) with total and live usage, which decide what can be deactivated or deleted.
  @Get('compensation/components')
  async components(@Req() request: RequestWithCookie) {
    const actor = await this.actor(request, 'read');
    const [rows, live] = await Promise.all([
      this.prisma.compensation_component_definition.findMany({ where: { organization_id: actor.organizationId, deleted_at: null }, orderBy: [{ is_basic: 'desc' }, { name: 'asc' }], include: { _count: { select: { items: true } } } }),
      this.liveUsage(actor.organizationId),
    ]);
    return rows.map(({ _count, ...row }) => ({ ...row, usage: _count.items, liveUsage: live.get(row.id) ?? 0 }));
  }

  private frequencyFor(value: unknown, category: string, isBasic: boolean): Frequency {
    const frequency = (value ?? 'MONTHLY') as Frequency;
    if (!frequencies.includes(frequency)) throw new BadRequestException('Choose how often this component is paid');
    if (isBasic && frequency !== 'MONTHLY') throw new BadRequestException('Basic Salary is always paid monthly');
    if (category === 'EMPLOYEE_DEDUCTION' && frequency === 'ONE_TIME') throw new BadRequestException('Deductions cannot be one-time; choose how often they are deducted');
    return frequency;
  }

  @Post('compensation/components')
  async createComponent(@Req() request: RequestWithCookie, @Body() body: ComponentBody) {
    const actor = await this.actor(request, 'write');
    const name = body?.name?.trim();
    if (!name) throw new BadRequestException('Enter a name for the component');
    if (name.length > 80) throw new BadRequestException('Keep the name under 80 characters');
    if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(body.code ?? '')) throw new BadRequestException('Code must start with a letter and use only capital letters, numbers, and underscores');
    if (!['EARNING', 'EMPLOYER_CONTRIBUTION', 'EMPLOYEE_DEDUCTION'].includes(body.category ?? '')) throw new BadRequestException('Choose a category');
    if (body.isBasic) throw new BadRequestException('Your organization already has Basic Salary');
    const defaultFrequency = this.frequencyFor(body.defaultFrequency, body.category!, false);
    const clash = await this.prisma.compensation_component_definition.findFirst({ where: { organization_id: actor.organizationId, code: body.code } });
    if (clash) throw new ConflictException(clash.deleted_at ? `The code ${body.code} belonged to a deleted component that past packages still reference. Choose another code.` : `The code ${body.code} is already used by another component`);
    try { return await this.prisma.compensation_component_definition.create({ data: { id: randomUUID(), organization_id: actor.organizationId, code: body.code!, name, category: body.category!, is_basic: false, default_frequency: defaultFrequency } }); }
    catch (error) { return mapError(error); }
  }

  @Patch('compensation/components/:id')
  async updateComponent(@Req() request: RequestWithCookie, @Param('id') id: string, @Body() body: ComponentBody) {
    const actor = await this.actor(request, 'write');
    if (!body || body.code !== undefined || body.category !== undefined || body.isBasic !== undefined) throw new BadRequestException('Code and category cannot change after a component is created');
    if (body.name === undefined && body.isActive === undefined && body.defaultFrequency === undefined) throw new BadRequestException('Nothing to update');
    if (body.name !== undefined && !body.name.trim()) throw new BadRequestException('Enter a name for the component');
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') throw new BadRequestException('Active must be true or false');
    const existing = await this.prisma.compensation_component_definition.findFirst({ where: { id, organization_id: actor.organizationId } });
    if (!existing) throw new NotFoundException('Component not found');
    if (existing.is_basic && body.isActive === false) throw new BadRequestException('Basic Salary cannot be deactivated');
    if (existing.deleted_at) throw new NotFoundException('Component not found');
    if (body.isActive === false && existing.is_active) {
      const live = (await this.liveUsage(actor.organizationId)).get(id) ?? 0;
      if (live > 0) throw new ConflictException(`${existing.name} is used in ${live} active or pending package${live === 1 ? '' : 's'}, so it can't be deactivated. It can be deactivated once those packages are revised without it.`);
    }
    const defaultFrequency = body.defaultFrequency === undefined ? undefined : this.frequencyFor(body.defaultFrequency, existing.category, existing.is_basic);
    try { return await this.prisma.compensation_component_definition.update({ where: { id }, data: { ...(body.name !== undefined ? { name: body.name.trim().slice(0, 80) } : {}), ...(body.isActive !== undefined ? { is_active: body.isActive } : {}), ...(defaultFrequency ? { default_frequency: defaultFrequency } : {}), updated_at: new Date() } }); }
    catch (error) { return mapError(error); }
  }

  // Inactive components can be deleted. If past packages reference one it is hidden rather than removed.
  @Delete('compensation/components/:id')
  async deleteComponent(@Req() request: RequestWithCookie, @Param('id') id: string) {
    const actor = await this.actor(request, 'write');
    const existing = await this.prisma.compensation_component_definition.findFirst({ where: { id, organization_id: actor.organizationId, deleted_at: null }, include: { _count: { select: { items: true } } } });
    if (!existing) throw new NotFoundException('Component not found');
    if (existing.is_basic) throw new BadRequestException('Basic Salary cannot be deleted');
    if (existing.is_active) throw new ConflictException(`Deactivate ${existing.name} before deleting it`);
    try {
      if (existing._count.items === 0) await this.prisma.compensation_component_definition.delete({ where: { id } });
      else await this.prisma.compensation_component_definition.update({ where: { id }, data: { deleted_at: new Date(), updated_at: new Date() } });
      return { deleted: true };
    } catch (error) { return mapError(error); }
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
    const packages = await this.prisma.employee_compensation.findMany({ where: { employee_id: employeeId, organization_id: actor.organizationId, status: { in: ['ACTIVE', 'SCHEDULED', 'DRAFT', 'PENDING_APPROVAL'] } }, include: { currency: true, items: { include: { definition: true }, orderBy: { created_at: 'asc' } }, submitter: { select: { name: true } }, decider: { select: { name: true } } }, orderBy: { created_at: 'desc' } });
    const active = packages.find((item) => item.status === 'ACTIVE');
    const upcoming = packages.find((item) => item.status === 'SCHEDULED');
    const propose = canPropose(actor.workflow, employee.userId);
    return {
      employee,
      active: active ? this.withSummary(active) : null,
      upcoming: upcoming ? this.withSummary(upcoming) : null,
      drafts: packages.filter((item) => item.status === 'DRAFT').map((item) => this.withSummary(item)),
      pending: packages.filter((item) => item.status === 'PENDING_APPROVAL').map((item) => ({ ...this.withSummary(item), canDecide: canApprove(actor.workflow, employee.userId, item.submitted_by) })),
      permissions: { canPropose: propose, submitOutcome: propose ? submissionOutcome(actor.workflow) : null, canCancelUpcoming: canApprove(actor.workflow, employee.userId, null), canEditProfile: canPropose(actor.workflow, null) },
    };
  }

  @Get('employees/:employeeId/compensation/history')
  async history(@Req() request: RequestWithCookie, @Param('employeeId') employeeId: string) {
    const actor = await this.actor(request, 'read');
    await this.employee(employeeId, actor.organizationId);
    const rows = await this.prisma.employee_compensation.findMany({ where: { employee_id: employeeId, organization_id: actor.organizationId, status: { in: ['SCHEDULED', 'ACTIVE', 'SUPERSEDED'] } }, include: { currency: true, items: { include: { definition: true } } }, orderBy: { effective_from: 'desc' } });
    return rows.map((row) => this.withSummary(row));
  }

  @Post('employees/:employeeId/compensation')
  async createPackage(@Req() request: RequestWithCookie, @Param('employeeId') employeeId: string, @Body() body: PackageBody) {
    const { actor } = await this.proposer(request, employeeId);
    const intent = body?.status === 'ACTIVE' ? 'SUBMIT' : body?.status;
    if (intent !== 'DRAFT' && intent !== 'SUBMIT') throw new BadRequestException('Choose whether to save a draft or submit the package');
    const effectiveFrom = validDate(body.effectiveFrom);
    const effectiveTo = validEndDate(body.effectiveTo, effectiveFrom);
    const result = await this.calculate(actor.organizationId, body);
    if (intent === 'SUBMIT') await this.assertStartsAfterActive(employeeId, effectiveFrom);
    let outcome: 'DRAFT' | 'PENDING_APPROVAL' | 'ACTIVE' | 'SCHEDULED' = intent === 'SUBMIT' ? submissionOutcome(actor.workflow) : 'DRAFT';
    const note = body.note?.trim().slice(0, 1000) || null;
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const packageRow = await tx.employee_compensation.create({ data: { id: randomUUID(), organization_id: actor.organizationId, employee_id: employeeId, currency_code: result.currencyCode, status: 'DRAFT', effective_from: effectiveFrom, effective_to: effectiveTo, created_by: actor.userId } });
        await tx.employee_compensation_item.createMany({ data: result.items.map((item) => ({ id: randomUUID(), compensation_id: packageRow.id, component_definition_id: item.componentDefinitionId, calculation_type: item.calculationType, fixed_amount: item.fixedAmount ?? null, percentage: item.percentage ?? null, resolved_monthly_amount: item.resolvedMonthlyAmount, frequency: item.frequency, resolved_amount: item.resolvedAmount, annual_amount: item.annualAmount })) });
        if (outcome === 'DRAFT') return packageRow.id;
        const submitted = { submitted_by: actor.userId, submitted_at: new Date(), decision_note: note };
        if (outcome === 'PENDING_APPROVAL') await tx.employee_compensation.update({ where: { id: packageRow.id }, data: { ...submitted, status: 'PENDING_APPROVAL', updated_at: new Date() } });
        else outcome = await this.activate(tx, packageRow.id, employeeId, effectiveFrom, { ...submitted, decided_by: actor.userId, decided_at: new Date() });
        return packageRow.id;
      });
      const row = await this.packageDetail(id, actor.organizationId);
      return { outcome, package: row && this.withSummary(row), calculation: result };
    } catch (error) { return mapError(error); }
  }

  @Post('compensation/:id/submit')
  async submitDraft(@Req() request: RequestWithCookie, @Param('id') id: string, @Body() body: { version?: number; note?: string }) {
    const base = await this.actor(request, 'write');
    const existing = await this.prisma.employee_compensation.findFirst({ where: { id, organization_id: base.organizationId } });
    if (!existing) throw new NotFoundException('Compensation package not found');
    if (existing.status !== 'DRAFT') throw new ConflictException('Only drafts can be submitted');
    const { actor } = await this.proposer(request, existing.employee_id);
    if (!Number.isSafeInteger(body?.version)) throw new BadRequestException('Draft version is required');
    await this.assertStartsAfterActive(existing.employee_id, existing.effective_from);
    let outcome: 'PENDING_APPROVAL' | 'ACTIVE' | 'SCHEDULED' = submissionOutcome(actor.workflow);
    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.employee_compensation.updateMany({ where: { id, status: 'DRAFT', version: body.version }, data: { submitted_by: actor.userId, submitted_at: new Date(), decision_note: body.note?.trim().slice(0, 1000) || null, change_requests: Prisma.DbNull, version: { increment: 1 }, updated_at: new Date() } });
        if (locked.count !== 1) throw new ConflictException('This draft changed since you opened it. Reload and try again.');
        if (outcome === 'PENDING_APPROVAL') await tx.employee_compensation.update({ where: { id }, data: { status: 'PENDING_APPROVAL' } });
        else outcome = await this.activate(tx, id, existing.employee_id, existing.effective_from, { decided_by: actor.userId, decided_at: new Date() });
      });
      return { outcome };
    } catch (error) { return mapError(error); }
  }

  private async pendingForDecision(request: RequestWithCookie, id: string, version: unknown) {
    const actor = await this.actor(request, 'approve');
    const pending = await this.prisma.employee_compensation.findFirst({ where: { id, organization_id: actor.organizationId }, include: { employee: true } });
    if (!pending) throw new NotFoundException('Compensation package not found');
    if (pending.status !== 'PENDING_APPROVAL') throw new ConflictException('This package is no longer waiting for approval. Reload to see its current state.');
    if (!canApprove(actor.workflow, pending.employee.userId, pending.submitted_by)) throw new ForbiddenException(pending.submitted_by === actor.userId ? 'You cannot approve a package you submitted' : 'Your role cannot approve compensation');
    if (!Number.isSafeInteger(version) || version !== pending.version) throw new ConflictException('This package changed since you opened it. Reload and try again.');
    return { actor, pending };
  }

  // Everything waiting for this approver, with the package it would replace for comparison.
  @Get('compensation/approvals')
  async approvals(@Req() request: RequestWithCookie) {
    const actor = await this.actor(request, 'approve');
    const pending = await this.prisma.employee_compensation.findMany({
      where: { organization_id: actor.organizationId, status: 'PENDING_APPROVAL' },
      include: { currency: true, items: { include: { definition: true }, orderBy: { created_at: 'asc' } }, submitter: { select: { name: true } }, employee: { select: { id: true, displayName: true, userId: true } } },
      orderBy: { submitted_at: 'asc' },
    });
    const activeRows = await this.prisma.employee_compensation.findMany({ where: { organization_id: actor.organizationId, status: 'ACTIVE', employee_id: { in: pending.map((row) => row.employee_id) } }, include: { currency: true, items: { include: { definition: true } } } });
    return pending.map(({ employee, ...row }) => {
      const active = activeRows.find((item) => item.employee_id === row.employee_id);
      return { ...this.withSummary(row), employee: { id: employee.id, displayName: employee.displayName }, canDecide: canApprove(actor.workflow, employee.userId, row.submitted_by), current: active ? this.withSummary(active) : null };
    });
  }

  @Post('compensation/:id/approve')
  async approve(@Req() request: RequestWithCookie, @Param('id') id: string, @Body() body: { version?: number; note?: string }) {
    const { actor, pending } = await this.pendingForDecision(request, id, body?.version);
    try {
      const outcome = await this.prisma.$transaction((tx) => this.activate(tx, id, pending.employee_id, pending.effective_from, { decided_by: actor.userId, decided_at: new Date(), decision_note: body.note?.trim().slice(0, 1000) || pending.decision_note, version: { increment: 1 } }));
      return { outcome };
    } catch (error) { return mapError(error); }
  }

  @Post('compensation/:id/reject')
  async reject(@Req() request: RequestWithCookie, @Param('id') id: string, @Body() body: { version?: number; note?: string; changes?: ChangeRequestBody[] }) {
    const note = body?.note?.trim() || null;
    const { actor } = await this.pendingForDecision(request, id, body?.version);
    const items = await this.prisma.employee_compensation_item.findMany({ where: { compensation_id: id }, include: { definition: true } });
    const changes = parseChangeRequests(body?.changes, items.map((item) => ({ id: item.component_definition_id, name: item.definition.name })));
    if (!note && !changes.length) throw new BadRequestException('Flag at least one item or add a note explaining what needs to change');
    try {
      await this.prisma.employee_compensation.update({ where: { id }, data: { status: 'DRAFT', decided_by: actor.userId, decided_at: new Date(), decision_note: note?.slice(0, 1000) ?? null, change_requests: changes.length ? changes : Prisma.DbNull, version: { increment: 1 }, updated_at: new Date() } });
      return { outcome: 'DRAFT' };
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
        await tx.employee_compensation_item.createMany({ data: result.items.map((item) => ({ id: randomUUID(), compensation_id: id, component_definition_id: item.componentDefinitionId, calculation_type: item.calculationType, fixed_amount: item.fixedAmount ?? null, percentage: item.percentage ?? null, resolved_monthly_amount: item.resolvedMonthlyAmount, frequency: item.frequency, resolved_amount: item.resolvedAmount, annual_amount: item.annualAmount })) });
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

  // Cancels an employee's upcoming package. Only approvers may; it frees the single upcoming slot.
  @Delete('compensation/:id/upcoming')
  async cancelUpcoming(@Req() request: RequestWithCookie, @Param('id') id: string) {
    const actor = await this.actor(request, 'approve');
    const upcoming = await this.prisma.employee_compensation.findFirst({ where: { id, organization_id: actor.organizationId }, include: { employee: true } });
    if (!upcoming) throw new NotFoundException('Compensation package not found');
    if (upcoming.status !== 'SCHEDULED') throw new ConflictException('This package is no longer upcoming. Reload to see its current state.');
    if (!canApprove(actor.workflow, upcoming.employee.userId, null)) throw new ForbiddenException('Your role cannot cancel this package');
    const deleted = await this.prisma.employee_compensation.deleteMany({ where: { id, status: 'SCHEDULED' } });
    if (!deleted.count) throw new ConflictException('This package is no longer upcoming. Reload to see its current state.');
    return { deleted: true };
  }
}
