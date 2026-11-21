# CompVista development seed

The NestJS API serves `GET /hello` and Better Auth at `/api/auth/*`. Public signup, organization creation, and invitation routes are disabled during normal server operation. Better Auth 1.7.27 provides email/password and TOTP authentication. Only the explicit development seed process can create test identities and the demo organization. No registration or onboarding UI exists.

## Schema and permissions

Flyway alone owns schema changes. V1 holds Better Auth identity tables. V2 adds minimal `employee` profiles, uniquely keyed by Better Auth `user.id` and linked to an organization. V3 adds organization roles. V4 replaces text permission entries with one `organization_role_permissions` row per role ID containing fixed boolean columns. Each organization has role keys `admin`, `hr`, and `employee`, with an editable `displayName`. `requiresApproval` is a boolean in the permissions row.

Better Auth continues to own `member.role`. The V3 trigger synchronizes `member.roleId` with the organization's role key whenever Better Auth adds or changes a membership. The field remains nullable for a pre-seed legacy owner; the seed verifies that every final member has a role reference. The seeded defaults are:

| Role | View all | View own | Propose others | Propose self | Approve | Approve self | Approval required |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admin | Yes | Yes | Yes | Yes | Yes | Yes | No |
| HR | Yes | Yes | Yes | No | No | No | Yes |
| Employee | No | Yes | No | No | No | No | Yes |

These rows define defaults for later authorization code. No compensation or change-request endpoints exist yet.

## Run

Install [Flyway CLI](https://documentation.red-gate.com/flyway/reference/usage/command-line) and put `flyway` on `PATH`, or set `FLYWAY_COMMAND` to its executable path. Keep pooled `DATABASE_URL`, direct `DIRECT_URL`, `BETTER_AUTH_SECRET`, and local origins in the ignored `backend/.env`. From `backend/`:

```powershell
npm run db:migrate
npm run db:validate
$env:COMPVISTA_DEV_SEED = 'YES'
npm run seed:dev -- --input seed/demo.json
npm run dev
```

The seed refuses `NODE_ENV=production` and requires the explicit opt-in. It never runs on server startup. With the included JSON plan, it seeds `CompVista Demo`, one `cyc4597@gmail.com` tenant admin, three explicit Yopmail HR users, and five generated Yopmail employee users. Each identity gets one Employee profile. The real admin address remains unverified; no email is sent. Better Auth creates and hashes the passwords. The local credential file is `backend/.local/dev-seed-credentials.json`, ignored by Git and restricted to the current Windows user. Reruns leave existing passwords, role names, and permissions intact.

For a different organization, copy `seed/demo.json` and change `organization.name` and optional `organization.slug`. Add explicit `{ "email", "name", "role" }` entries in `users` (one must be `admin`; others may be `hr` or `employee`). Set `generatedEmployees.count` to make additional employees. Their aliases use `generatedEmployees.emailPrefix` or the organization slug, plus a stable sequence number and `@yopmail.com`. Names are selected deterministically from the supplied `scripts/common_indian_names.json` first and last name lists, so reruns retain the same identity mapping. You can also pass `generatedEmployees.names` inline with `first_names` and `last_names` arrays. `parseSeedPlan` accepts the JSON object directly for future reuse outside the CLI; no API is exposed now.

The seed creates the organization when missing and reuses it when its slug and name match. It refuses conflicting memberships and does not delete unrelated data. It updates only old `Demo Employee N` placeholder names to generated Indian names. Better Auth operations and Prisma domain writes cannot share one transaction; a failed run reports counts and can be rerun to finish.

## Verify

`npm run build`, `npm run lint`, and `npm test` check the backend and `/hello`. For the isolated `milestone3-boolean-validation` Neon branch only, set `COMPVISTA_ENV_FILE=.env.boolean.test` and run `npm run test:integration`. That test verifies role and employee counts, single membership, password login, closed signup, and blocked organization creation. Do not point it at the linked production branch.

Flyway migration and validation are explicit. Never run Prisma migration commands, `prisma db push`, or Better Auth migration commands. Prisma was introspected after Flyway applied V4, and its client was regenerated; Flyway's history table is intentionally omitted from the application Prisma schema.
