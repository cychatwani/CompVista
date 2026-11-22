# Compensation domain decisions

Compensation packages store monthly input rules and monthly resolved amounts in one currency. The backend calculates every item with Prisma Decimal, rounds each item with `ROUND_HALF_UP` to the currency's `decimal_places`, then sums the rounded items. Annual CTC is monthly CTC multiplied by 12. Gross is earnings only; employer contributions add to CTC; employee deductions are reported separately and do not reduce gross or CTC. This feature does not compute net pay or statutory payroll values.

Basic Salary is the sole organization definition marked `is_basic`. Every package requires it as a positive fixed item that remains positive after currency rounding. Percentage rules use its rounded monthly amount as their only base. The accepted percentage range is **0 through 1000 inclusive**, with up to four fractional digits. Fixed amounts are nonnegative decimal strings with up to four fractional digits. Stored `resolved_monthly_amount` is always recalculated by the backend when a draft is saved. Clients cannot submit resolved values.

Definitions have stable organization-scoped codes. The API and database permit renaming and deactivation but do not permit code, category, or Basic designation changes after creation. Basic Salary cannot be deactivated. Definitions referenced by items cannot be deleted. Historical package item rules and resolved values remain stored even if a definition is later deactivated. Item writes lock the definition row, so deactivation cannot race with the active-definition check.

This milestone supports drafts and direct creation of an **initial** active package when no applied compensation history exists. Applied packages and their items are immutable. Draft updates and deletion require the current integer version; stale writes receive HTTP 409. Package and item writes run in transactions. The database enforces one active package per employee, no overlapping applied date ranges, tenant-consistent employee references, unique components within packages, and the core numeric and Basic Salary constraints. Draft activation over existing active compensation is reserved for a later revision workflow.

All management endpoints require a completed Better Auth sign-in and organization membership. Admins can read and write within their organization. Other members need `canViewAllComp` to read and `canProposeOthersComp` to write. The management API does not provide employee self-service reads. Requests with a different active organization are denied. The frontend proxies these endpoints through `/api/domain/*`, forwarding the session cookie.

Flyway is the only schema writer. Apply V9 and V10 after earlier migrations, then run `prisma generate`; never use Prisma Migrate or `db push`. The Bandwidth Holdings catalog is inserted by V9 when that organization exists and by `seed:dev` when it is created afterward. Integration tests require a migrated, disposable validation branch via `COMPVISTA_COMP_TEST_URL`; unit tests require no database.

## Approval workflow (V11)

`organization_role_permissions` drives every decision. A proposer needs `canProposeOthersComp` (or `canProposeOwnComp` for their own record); the employee role never proposes. Submitting applies the package directly when the proposer's role has `requiresApproval = false` (Admin by default); otherwise it becomes `PENDING_APPROVAL`. Approvers need `canApproveComp`, plus `canApproveOwnComp` for their own record, and a proposer whose role requires approval cannot approve their own submission. Rejecting requires a note and returns the package to `DRAFT` so it can be edited and resubmitted.

Applying a package (directly or on approval) supersedes the current ACTIVE package, closing it the day before the new one starts. The new package must start after the current one. Pending packages are frozen; only drafts can be edited or deleted. Endpoints: `POST /employees/:id/compensation` with `status: DRAFT | SUBMIT`, `POST /compensation/:id/submit`, `/approve`, and `/reject`, each with the current `version`.

## Payment frequency (V12)

Each item has a `frequency`: MONTHLY (12/yr), QUARTERLY (4), TRIANNUAL (3), HALF_YEARLY (2), ANNUAL (1), or ONE_TIME. `fixed_amount` and `percentage` are per payment (a percentage is of monthly Basic). The backend stores `resolved_amount` (each payment), `annual_amount` (payment x payments per year; 0 for ONE_TIME), and `resolved_monthly_amount` (annual / 12, for reporting). Annual CTC sums recurring earnings and employer contributions; monthly figures are annual / 12. ONE_TIME earnings and employer contributions are reported as `oneTimePayments` outside CTC; deductions cannot be one-time. Basic Salary must be MONTHLY, enforced by the API and the item trigger. V12 backfilled existing items as MONTHLY with unchanged totals. Revisions in the UI do not carry over one-time items from the current package.

## Component lifecycle (V13, V15)

Definitions carry a `default_frequency` (Basic is always MONTHLY; deductions are never ONE_TIME) used as the starting value in the package wizard. A definition can be deactivated only when no ACTIVE or PENDING_APPROVAL package uses it, and deleted only once it is inactive. Deleting removes the row when nothing references it; otherwise it sets `deleted_at` and hides it so past packages keep their history. Deleted codes cannot be reused. Database triggers enforce both rules. V15 removed V14's deactivation-request table.

## Approvals queue

Members with `canApproveComp` (admins always) see **Approvals** in the sidebar with a pending count from `GET /me/capabilities`. `GET /compensation/approvals` lists every PENDING_APPROVAL package with the package it would replace and whether the caller may decide it. Approve and reject use the existing `/compensation/:id/approve` and `/reject` endpoints, which now require approval access rather than organization-wide view access.
