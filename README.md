# Ziyada ERP — Phase 1 (ERP Dagang Konveksi)

Internal ERP for the Konveksi business: sales, purchases, inventory, and finance (AR/AP). Phase 1 is *locked scope*—refer to `.agent/rules/PHASE-1-SCOPE-PROJECT.md` and `.agent/rules/IMPLEMENTATION-CHECKLIST-PHASE-1.md` before adding anything new.

## Highlights

- **Tech**: Vite + React + TypeScript front-end, Supabase/Postgres backend with SQL migrations and RPCs under `supabase/`.
- **Guardrails**:
  * Admin + Owner only.
  * Transactions flow through `DRAFT → POSTED`; `POSTED` rows become immutable.
  * Period lock enforces write-blocks when a period is `CLOSED`.
  * No free-entry receipts/payments or manual journals.
- **Focus areas**: Master data, Sales, Purchases, Inventory adjustments, Receipts/Payments, Finance reporting, Period locking.
- **Master data**: `items.type` now includes `FINISHED_GOOD`, `RAW_MATERIAL`, and `TRADED`. `TRADED` entries are treated as non-stocked goods (posting skips inventory adjustments and manual stock/or opening-stock edits are rejected), so the existing posting contracts stay stable while we expand into trading/manufacturing later.
- **Stock Card**: Added size and color badges to the "Item" column in the Stock Card table for better variant identification.

## Getting started

```bash
npm install
npm run dev
```

## Running in Docker (local development)

1. Fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` inside `.env` (this file is already wired into the compose service via `env_file`).
2. Build the image and start the dev server with `docker compose up --build`. The container runs `vite dev --host 0.0.0.0 --port 4173` and exposes it on the host via port `4173`.
3. Open <http://localhost:4173> in your browser. Changes to source files (and other tracked assets) are synced into the container because the project root is mounted as a volume; `CHOKIDAR_USEPOLLING` keeps Vite’s file watcher happy across the bind mount.
4. When you are done, run `docker compose down` to shut the service down. Re-run `docker compose up` after editing `.env` so the container picks up the latest values.

The Dockerfiles and Compose service are optimized for local development only (hot reload, source sync, etc.). For production builds you can still run `npm run build` outside Docker and deploy the `dist/` output to a static host.

## Supabase local stack

1. Supabase offers a local stack via the CLI (`supabase start`). Install it with `npm install supabase --save-dev` (or just use `npx supabase`) and keep your Node.js runtime at 20+ so the CLI can run successfully. citeturn0search0
2. Run `supabase start` from the repo root. The CLI uses Docker to launch Postgres, GoTrue, Studio, and other services and prints the local API URL plus the anon and service role keys you will paste into `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and your server-side `SUPABASE_SERVICE_ROLE_KEY`) so the app can talk to the local stack. citeturn0search0
3. While the stack is running, `supabase db reset` drops and recreates the Postgres container, applies every SQL file under `supabase/migrations`, and executes `supabase/seed.sql` (our seed file seeds the owner + admin accounts). Use this whenever you need a fresh “Phase 1” state before exercising guarded workflows. citeturn0search3
4. Stop the containers with `supabase stop` when you are done; the CLI preserves the downloaded images, so future `supabase start` runs much faster. citeturn0search0

`supabase/config.toml` is already populated so the CLI uses port 54321 for the API, 54322 for Postgres, and seeds the database automatically. Update it only if your local port layout or auth settings need to change.

### Product-centric master data

The UI now treats "Products" as the canonical record: the `/products` page lists `product_parents` plus the count of variants, and the `ProductForm` (header + variant table) saves both parent and item rows via `rpc_save_product_complete` so every variant has a parent. The old `Items` routes/forms are being deprecated; follow the new flow to guarantee `parent_id` is always present before any item touches posting or inventory logic.

Supabase migrations live under `supabase/migrations`. Follow the order in the `.agent` rule documents before touching production data.

## Documentation

- `PHASE_1_LOCKED.md`: concise scope lock summary (new).
- `PHASE_1_FEATURES.md`: feature checklist derived from the official phase documentation (new).
- `.agent/rules/PHASE-1-SCOPE-PROJECT.md`: primary scope statement.
- `.agent/rules/IMPLEMENTATION-CHECKLIST-PHASE-1.md`: detailed checklist and guardrails.
- `.agent/rules/docs/ARCHITECTURE_LOCK.md`: infrastructure & architectural constraints.

## Manual checks

Before closing Phase 1 work, complete these:

1. Sales & Purchase flows operate end-to-end (draft to posted).
2. Inventory adjusts correctly from purchases/sales/returns.
3. Receipts/payments update AR/AP (petty cash capped at IDR 500k).
4. Financial reporting derives exclusively from journals + AR/AP data.
5. Period closing prevents posts/edits and logs exports.

Phase 1 is done when the owner can close a period and all reports remain reconciled without extra adjustments.
