// Who may propose, submit, and approve compensation, driven by organization_role_permissions.
export type WorkflowFlags = {
  canProposeOthersComp: boolean;
  canProposeOwnComp: boolean;
  canApproveComp: boolean;
  canApproveOwnComp: boolean;
  requiresApproval: boolean;
};
export type WorkflowActor = { role: string; userId: string; flags: WorkflowFlags | null };

const adminFlags: WorkflowFlags = { canProposeOthersComp: true, canProposeOwnComp: true, canApproveComp: true, canApproveOwnComp: true, requiresApproval: false };

function flagsOf(actor: WorkflowActor): WorkflowFlags | null {
  if (actor.role === 'employee') return null;
  return actor.role === 'admin' ? { ...adminFlags, ...actor.flags, canProposeOthersComp: true, canApproveComp: true } : actor.flags;
}

/** Whether the actor may create or edit a package for this employee (by employee's user id). */
export function canPropose(actor: WorkflowActor, employeeUserId: string | null): boolean {
  const flags = flagsOf(actor);
  if (!flags) return false;
  return employeeUserId === actor.userId ? flags.canProposeOwnComp : flags.canProposeOthersComp;
}

/** Outcome of submitting a proposal: straight to ACTIVE, or held for approval. */
export function submissionOutcome(actor: WorkflowActor): 'ACTIVE' | 'PENDING_APPROVAL' {
  const flags = flagsOf(actor);
  return flags && !flags.requiresApproval ? 'ACTIVE' : 'PENDING_APPROVAL';
}

/** Whether the actor may approve or reject a pending package. */
export function canApprove(actor: WorkflowActor, employeeUserId: string | null, submittedBy: string | null): boolean {
  const flags = flagsOf(actor);
  if (!flags?.canApproveComp) return false;
  if (employeeUserId === actor.userId && !flags.canApproveOwnComp) return false;
  // A proposer who needed approval cannot approve their own submission.
  if (submittedBy === actor.userId && flags.requiresApproval) return false;
  return true;
}

/** The day before `date`, as a UTC date. */
export function dayBefore(date: Date): Date {
  return new Date(date.getTime() - 24 * 60 * 60 * 1000);
}

/** Today's calendar date (server local time) as a UTC-midnight Date, matching stored DATE values. */
export function today(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Milliseconds from `now` until the next local midnight. */
export function msUntilMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Applied packages starting after today wait as SCHEDULED (upcoming); others take effect now. */
export function appliedStatus(effectiveFrom: Date, now = new Date()): 'ACTIVE' | 'SCHEDULED' {
  return effectiveFrom > today(now) ? 'SCHEDULED' : 'ACTIVE';
}
