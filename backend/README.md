# CompVista API identity foundation

NestJS serves `GET /hello` and mounts Better Auth at `/api/auth/*`. Better Auth 1.7.27 uses Prisma 7.10.1 with the PostgreSQL driver adapter, email/password, organization, and TOTP plugins. Public email signup and user-created organizations are disabled during normal server operation. The frontend origin is explicitly trusted and allowed for credentialed CORS. NestJS can verify sessions in later milestones with `auth.api.getSession({ headers: fromNodeHeaders(request.headers) })` against this same Better Auth instance; no separate JWT is issued.

## Local environment

Copy `.env.example` to `.env`, supply Neon's pooled `DATABASE_URL` and direct `DIRECT_URL`, and generate a random `BETTER_AUTH_SECRET`. The `.env` file is Git ignored. Set `FRONTEND_URL` and `BETTER_AUTH_URL` to the actual local origins. A local development owner can be initialized using `DEV_OWNER_EMAIL`, `DEV_OWNER_NAME`, and a strong `DEV_OWNER_PASSWORD` in `.env`. Do not put these values in source control. No email delivery is configured.

## Flyway owns migrations

Install [Flyway CLI](https://documentation.red-gate.com/flyway/reference/usage/command-line) and put `flyway` on `PATH`, or set `FLYWAY_COMMAND` to its executable path. From `backend/`, run:

```powershell
npm run db:migrate
npm run db:validate
npm run db:info
npx prisma db pull
npx prisma generate
npm run db:check
```

The Flyway wrapper reads `DIRECT_URL` and passes credentials through environment variables. V1 lives in `db/migration/`. Never run Prisma migration, `db push`, or Better Auth migration commands. When introspecting again, remove the `flyway_schema_history` model from `prisma/schema.prisma`; Flyway alone owns that table. The production branch has V1 applied and validated.

The SQL was translated from `npx auth@1.7.27 generate --adapter prisma --config src/auth.ts`. The generated schema was reviewed before V1 was written. Prisma was introspected after Flyway applied V1 on an isolated Neon branch. The physical schema has eight Better Auth tables and Flyway's history table; it has no business-domain tables.

## Development owner

```powershell
npm run bootstrap:dev
npm run dev
```

The bootstrap script uses Better Auth's signup and organization APIs, verifies the owner role, and is idempotent. It requires the three `DEV_OWNER_*` variables and refuses to run with `NODE_ENV=production`. For the linked development database, `CompVista Demo` / `compvista-demo` and one owner were created. The generated owner's password is stored only in the ignored local `.env`.

`member.userId` is unique, so a user can belong to at most one organization. A membership is created when an organization is created or an invitation is accepted; the database cannot require every user to have a membership because Better Auth creates the user before organization assignment. Future activation logic must verify membership before granting an HR role. A second-organization acceptance will fail on the unique index and should be handled as a user-facing conflict in that later workflow.

## Validation

`npm run build`, `npm run lint`, and `npm test` verify compilation, lint, and `/hello`. `npm run test:integration` requires `COMPVISTA_ENV_FILE=.env.test` pointing to the isolated `milestone2-validation` Neon branch; it exercises Better Auth signup/sign-in persistence, the owner role, invitation acceptance, role changes, same-organization membership, the single-membership constraint, and TOTP setup persistence. Do not point it at the production branch: it creates disposable test data.
