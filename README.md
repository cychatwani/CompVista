# CompVista

Salary management for a multi-country organization of about 10,000 people. HR finds anyone in seconds, revises their pay with a full history and an approval step, and answers organization-wide pay questions without ever adding up amounts in different currencies.

**Live demo:** https://compvista.chirag45.dev

Full product and engineering write-up (decisions, data model, tests, performance, AI usage): [`docs/PRODUCT_AND_ENGINEERING.md`](docs/PRODUCT_AND_ENGINEERING.md).

## What it does

| Area | Summary |
|---|---|
| People directory | Server-side search, filters (department, country, currency, salary range, role, status), sorting, pagination and CSV export over 10,000 people |
| Compensation packages | Built from components (Basic, HRA, allowances, employer contributions, deductions, bonuses) with payment frequencies, effective dates and immutable history |
| Approvals | Maker-checker: HR proposes, Admin approves or returns it with line-by-line change requests. Future-dated packages wait as **Upcoming** and go live at midnight |
| Analytics | Dashboard and Insights: spend, average and exact median, salary bands, department and country breakdowns, department × country matrix, pay by job level, cost composition. One currency at a time, never converted |
| Organization | Departments, countries with flags and default currency, job titles, levels and employment status |
| Access | Admin, HR and Employee roles with per-organization permission flags, enforced by the backend. Employees see only their own pay |
| Sign-in | Email and password, forced password change, email verification by code, authenticator-app TOTP (required or optional per role) |
| Demo data | Deterministic, idempotent 10,000-employee seed and an operator page that creates a whole organization with a login for everyone and a credentials CSV |

## Stack

Next.js 16 (React 19, Tailwind v4) · NestJS 11 · PostgreSQL on Neon · Prisma 7 (queries only) · Flyway (the only schema migration tool) · Better Auth · Resend.

```
Browser ──HTTPS──▶ Next.js (pages + same-origin /api proxy) ──▶ NestJS API ──▶ Postgres (Neon)
                                                                   │  ▲
                                                Resend (email) ◀───┘  └── Flyway migrations V1–V19
```

The browser only talks to Next.js, which forwards the session cookie to the API server-to-server. There are no cross-origin cookies and no CORS setup in the browser.

## Repository layout

```
backend/    NestJS API, Better Auth, Prisma client, Flyway migrations (db/migration), seed and provisioning scripts, Dockerfile
frontend/   Next.js app (app router), UI components, API proxy routes
docs/       Product and engineering document
```

## Run locally

Prerequisites: Node.js 24, npm, a PostgreSQL database (Neon recommended) and the [Flyway CLI](https://documentation.red-gate.com/flyway/reference/usage/command-line) on `PATH` (or set `FLYWAY_COMMAND` to its executable).

**1. Backend:** create `backend/.env`:

```env
DATABASE_URL=postgresql://...pooled...      # app queries
DIRECT_URL=postgresql://...direct...        # Flyway
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000
RESEND_API_KEY=...
EMAIL_FROM=CompVista <no-reply@your-domain>
COMPVISTA_PROVISIONING_KEY=<any long random string>
```

```sh
cd backend
npm install
npm run db:migrate      # Flyway applies V1–V19
npm run build           # generates the Prisma client and compiles
npm run dev             # http://localhost:4000
```

**2. Frontend:** create `frontend/.env.local`:

```env
AUTH_API_URL=http://localhost:4000
FRONTEND_URL=http://localhost:3000
```

```sh
cd frontend
npm install
npm run dev             # http://localhost:3000
```

**3. Create an organization.** Open http://localhost:3000/provision, enter the provisioning key, choose how many admins, HR users and employees (100–20,000 in total) and download the credentials CSV. Every person can sign in and goes through the normal first-login flow. From the command line instead:

```powershell
cd backend
$env:COMPVISTA_DEV_SEED = 'YES'
npm run org:create -- --name "ACME" --admins 3 --hrs 25 --employees 9972
```

To wipe a development database (keeps reference data such as currencies and countries): `npm run db:reset-dev -- --yes-delete-everything`.

## Tests

```sh
cd backend  && npm run typecheck && npm run lint && npm test
cd frontend && npm run typecheck && npm run lint && npm test
```

Integration tests run real SQL and must point at a **disposable** database branch, never production:

```powershell
cd backend
$env:COMPVISTA_COMP_TEST_URL = '<disposable branch url>'
npm run test:integration
```

## Deployment

| Part | Host | Notes |
|---|---|---|
| Frontend | Vercel | Root directory `frontend`, functions region close to the database |
| Backend | Railway | Root directory `backend`, built from `backend/Dockerfile`. Run **one** instance: provisioning jobs and the midnight scheduler live in process memory |
| Database | Neon | Migrations are run with `npm run db:migrate`, never at startup |

Backend environment: the variables above, with `FRONTEND_URL` set to the public frontend URL (exact, no trailing slash), `BETTER_AUTH_URL` set to the public API URL, and `TZ` set to the organization's time zone (for example `Asia/Kolkata`) because "today" and midnight are evaluated in server time. Frontend environment: `AUTH_API_URL` (public API URL) and `FRONTEND_URL`.

Build and run the API image locally:

```sh
cd backend
docker build -t compvista-api .
docker run --env-file .env -p 4000:4000 compvista-api   # values in .env must not be quoted
```

## Rules this codebase follows

- Flyway is the only thing that changes the schema. Never run `prisma migrate`, `prisma db push` or Better Auth migrations.
- Amounts in different currencies are never summed. Every money aggregate is grouped by currency or limited to one selected currency.
- Annual CTC is earnings plus employer contributions; employee deductions are reported separately.
- Applied packages are immutable, and the database enforces it with triggers and constraints as well as the API.
