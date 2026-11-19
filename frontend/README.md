# CompVista frontend

Minimal Next.js application using TypeScript, App Router, Tailwind CSS, and ESLint.
The homepage displays only `Hello World`.

## Development

Requires Node.js 20.9 or later and npm. Run from `frontend/`:

```sh
npm ci
npm run dev
```

Open http://localhost:3000.

## Validation

```sh
npm run typecheck
npm run lint
npm run build
```

## Production

After building:

```sh
npm start
```

Frontend source and configuration live in this directory, leaving the repository
root available for a separate backend.
