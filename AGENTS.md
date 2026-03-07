# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Sober Founders KPI Dashboard — a React + Vite frontend (`/dashboard`) backed by a remote Supabase project (Postgres + 25 Edge Functions). A secondary WIP frontend lives at `/sober-kpi-dist` (boilerplate, not yet connected). See `README.md` for full tech stack and deploy notes.

### Running services

| Service | Command | URL | Notes |
|---|---|---|---|
| Dashboard (primary) | `cd dashboard && npm run dev` | http://localhost:5173 | Requires `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| sober-kpi-dist (secondary) | `cd sober-kpi-dist && npm run dev` | http://localhost:5174 | Boilerplate, optional |

### Environment variables

The dashboard `.env` must contain at minimum `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointing to the remote Supabase project `ldnucnghzpkuixmnfjbs`. Additional recommended vars are listed in `README.md` (lookback days, AI toggles, etc.).

### Lint, test, build

- **Lint (dashboard):** `cd dashboard && npm run lint` — ESLint 8 with react/react-hooks plugins. The codebase has pre-existing lint errors (unused vars, conditional hooks); these are known.
- **Lint (sober-kpi-dist):** `cd sober-kpi-dist && npm run lint` — passes clean.
- **Build (dashboard):** `cd dashboard && npm run build` — Vite production build, outputs to `dashboard/dist/`.
- **Build (sober-kpi-dist):** `cd sober-kpi-dist && npm run build`
- **E2E tests (dashboard):** `cd dashboard && npx playwright test` — requires Playwright Chromium (`npx playwright install chromium --with-deps`). Tests run against `http://localhost:5173`; Playwright config auto-starts the dev server if not already running.

### Gotchas

- The root `package.json` only has a `pg` dependency for ad-hoc scripts; it is not a workspace root.
- No monorepo tooling (no Turborepo/Nx) — each directory has its own `npm install`.
- The Supabase backend is remote-only for this project; `supabase start` (local stack) is not needed for frontend development.
- Package manager is `npm` (lockfiles are `package-lock.json`).
