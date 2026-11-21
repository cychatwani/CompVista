# CompVista

## Milestone 1 login state

The frontend POSTs credentials to `/api/login`, which forwards them to Better Auth's `/api/auth/sign-in/email`. Invalid credentials stay errors; they never imply `RESET_PASSWORD`. Better Auth's two-factor redirect maps to `VERIFY_TOTP`. A successful session with an unverified email maps to `VERIFY_EMAIL`; a verified email without enabled TOTP maps to `SETUP_TOTP`; only a verified email with enabled TOTP maps to `AUTHENTICATED`. `/app` checks the backend `/api/access` endpoint on every request. That endpoint reads the Better Auth session and current user flags before allowing access. Future protected API endpoints must use the same server-side access check.

The current schema does not record a password-reset requirement, so login cannot reliably emit `RESET_PASSWORD`. The reset page is UI only. Email verification, TOTP setup, and TOTP verification are unfinished; their routes do not grant application access. Existing seeded users have unverified email by default and therefore reach `VERIFY_EMAIL` after valid credentials. Set `AUTH_API_URL` for the frontend server if the backend is not at `http://localhost:4000`.
