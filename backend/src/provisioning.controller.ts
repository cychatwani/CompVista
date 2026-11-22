import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Body, ConflictException, Controller, Get, Header, Injectable, NotFoundException, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';
import { credentialsCsv, parseProvisionInput, provisionOrganization, ProvisioningError, type Credential, type Progress, type ProvisionInput } from './provisioning.js';

type RequestWithHeaders = { headers: Record<string, string | string[] | undefined> };
type Job = {
  id: string; input: ProvisionInput; status: 'running' | 'done' | 'failed'; progress: Progress; startedAt: number; finishedAt: number | null;
  error: string | null; organization: { id: string; slug: string; name: string } | null; credentials: Credential[] | null; downloads: number;
};

const retentionMs = 30 * 60_000;

/** In-memory provisioning jobs. Credentials never touch the database or disk and expire after 30 minutes. */
@Injectable()
export class ProvisioningService {
  private readonly jobs = new Map<string, Job>();
  constructor(private readonly prisma: PrismaService) {}

  start(input: ProvisionInput): Job {
    this.purge();
    if ([...this.jobs.values()].some((job) => job.status === 'running')) throw new ConflictException('Another organization is being created. Wait for it to finish.');
    const total = input.admins + input.hrs + input.employees;
    const job: Job = { id: randomUUID(), input, status: 'running', progress: { phase: 'setup', done: 0, total }, startedAt: Date.now(), finishedAt: null, error: null, organization: null, credentials: null, downloads: 0 };
    this.jobs.set(job.id, job);
    void provisionOrganization(this.prisma, input, (progress) => { job.progress = progress; })
      .then((result) => { job.status = 'done'; job.organization = { id: result.organizationId, slug: result.slug, name: input.name }; job.credentials = result.credentials; })
      .catch((error: unknown) => { job.status = 'failed'; job.error = error instanceof ProvisioningError ? error.message : 'Creating the organization failed. Nothing was kept; try again.'; if (!(error instanceof ProvisioningError)) console.error('Provisioning failed', error); })
      .finally(() => { job.finishedAt = Date.now(); });
    return job;
  }

  get(id: string): Job {
    this.purge();
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException('This job has expired or does not exist');
    return job;
  }

  private purge() {
    for (const [id, job] of this.jobs) if (job.finishedAt && Date.now() - job.finishedAt > retentionMs) this.jobs.delete(id);
  }
}

function view(job: Job) {
  const elapsed = (job.finishedAt ?? Date.now()) - job.startedAt;
  const rate = job.progress.done / Math.max(elapsed, 1);
  return {
    id: job.id, status: job.status, progress: job.progress, error: job.error, organization: job.organization,
    request: { name: job.input.name, slug: job.input.slug, admins: job.input.admins, hrs: job.input.hrs, employees: job.input.employees, emailDomain: job.input.emailDomain },
    elapsedSeconds: Math.round(elapsed / 1000),
    remainingSeconds: job.status === 'running' && job.progress.done > 0 ? Math.round((job.progress.total - job.progress.done) / rate / 1000) : null,
    credentialsAvailable: !!job.credentials, expiresAt: job.finishedAt ? new Date(job.finishedAt + retentionMs).toISOString() : null,
  };
}

/**
 * Operator-only organization provisioning. Disabled unless COMPVISTA_PROVISIONING_KEY is set; every
 * call must send that key in the x-provisioning-key header.
 */
@Controller('provisioning')
export class ProvisioningController {
  constructor(private readonly jobs: ProvisioningService) {}

  private authorize(request: RequestWithHeaders) {
    const expected = process.env.COMPVISTA_PROVISIONING_KEY;
    if (!expected || expected.length < 12) throw new NotFoundException('Organization provisioning is disabled on this server');
    const supplied = request.headers['x-provisioning-key'];
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), digest(expected))) throw new UnauthorizedException('The provisioning key is not correct');
  }

  @Get('status')
  status(@Req() request: RequestWithHeaders) {
    this.authorize(request);
    return { enabled: true };
  }

  @Post('organizations')
  create(@Req() request: RequestWithHeaders, @Body() body: unknown) {
    this.authorize(request);
    try { return view(this.jobs.start(parseProvisionInput(body))); }
    catch (error) { if (error instanceof ProvisioningError) throw new BadRequestException(error.message); throw error; }
  }

  @Get('jobs/:id')
  job(@Req() request: RequestWithHeaders, @Param('id') id: string) {
    this.authorize(request);
    return view(this.jobs.get(id));
  }

  @Get('jobs/:id/credentials')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('cache-control', 'no-store')
  credentials(@Req() request: RequestWithHeaders, @Param('id') id: string) {
    this.authorize(request);
    const job = this.jobs.get(id);
    if (!job.credentials) throw new ConflictException(job.status === 'failed' ? 'This job failed, so there are no credentials' : 'Credentials are ready once the organization is created');
    job.downloads++;
    return '﻿' + credentialsCsv(job.credentials, `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login`);
  }
}
