# SecurePool — live deployment notes

## Paid third-party APIs

**This application does not call paid vendor APIs** (no Stripe, PayPal, OpenAI, Anthropic, Google Maps/Places, Twilio, SendGrid-as-a-service, RapidAPI, etc.). Core flows use your own Express API, PostgreSQL, and the frontend build.

What *can* cost money (infrastructure you choose — not “API keys” baked into the app):

- **Hosting:** Vercel (frontend), Railway or any host (Node + Postgres).
- **Email (optional):** Nodemailer with **your** SMTP credentials (`SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`). If these are unset, registration/withdrawal emails are skipped and a warning is logged — the app still runs.
- **Database:** PostgreSQL (`DATABASE_URL`) — standard managed DB, not a separate “paid API product” in code.

Blockchain: users send USDT manually; there is no required paid on-chain indexer or payment processor integration in this repo.

## Notifications table

PostgreSQL column for the message body is **`message`** (not `body`). All server `INSERT INTO notifications` queries use `(user_id, title, message, type)` — aligned with `GET` in `notifications.ts`.

## Pre-flight checklist

| Area | Env / setting |
|------|----------------|
| API | `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`, `PORT` |
| CORS | `FRONTEND_ORIGINS` or `FRONTEND_ORIGIN` (comma-separated for Vercel + local) |
| Uploads | `UPLOAD_DIR` if not using default |
| Frontend (Vercel) | `VITE_API_URL` = your Railway API origin (no trailing issues — app strips slashes) |
| Email (optional) | `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| Admin | `SUPER_ADMIN_USER_IDS` (comma-separated numeric IDs) |

## Access — what you need (hosting + login)

| What | Where you get it |
|------|------------------|
| **Source code** | GitHub repo access (clone / pull `main`). |
| **Production API** | Railway (or any host): set env vars from `artifacts/api-server/.env.example`; connect **Neon** `DATABASE_URL`. |
| **Production frontend** | Vercel: `VITE_API_URL` = public Railway API origin; allow that origin in Railway `FRONTEND_ORIGINS`. |
| **Database** | Neon console: connection string → `DATABASE_URL`. Run SQL migrations via API boot **or** Neon SQL Editor. |
| **Admin panel** | A user with **`is_admin = true`** in DB (or sign up + flip in Neon). **Super-admin** IDs: `SUPER_ADMIN_USER_IDS` on API. |
| **Email (optional)** | Gmail app password → `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM`; admin draw emails: `ADMIN_EMAIL` or `ADMIN_NOTIFY_EMAIL`. |

Local: copy **`artifacts/api-server/.env.example`** → **`artifacts/api-server/.env`** and fill real values (file is gitignored).

## Local development

From the **repository root** (after `pnpm install`):

| Command | What it does |
|---------|----------------|
| `pnpm run dev:frontend` | Starts Vite with defaults **`PORT=5173`** and **`BASE_PATH=/`** (required by `artifacts/usdtluck/vite.config.ts`). Proxies **`/api`** and **`/uploads`** to **`http://localhost:8080`**. Override port: `PORT=5180 pnpm run dev:frontend`. |
| `pnpm run dev:stack` | Runs `scripts/dev-stack.sh`: API on **8080**, frontend on **5173** (override with `API_PORT` / `FE_PORT`). Press **Ctrl+C** to stop both. |

Set **`DATABASE_URL`**, **`SESSION_SECRET`**, and **`JWT_SECRET`** in **`artifacts/api-server/.env`** (see `.env.example`). Vite proxies `/api` to **`http://localhost:8080`** — keep **`PORT=8080`** in that `.env` unless you change `vite.config.ts`.

**Apple Silicon:** If Vite fails with missing optional natives (`@rollup/rollup-darwin-arm64`, `lightningcss`, `@tailwindcss/oxide`), the workspace root lists matching **`devDependencies`** — run **`pnpm install`** again from the repo root.

## Database migrations (wallet / demo flags)

The API runs pending SQL migrations on startup (`runPendingSqlMigrations`). Ensure these migrations have been applied on the target database:

- **`0005_wallet_change_demo.sql`** — `wallet_change_requests`, `users.is_demo`, `winners.payment_status`
- **`0006_activity_loyalty.sql`** — `activity_logs`, `users.referral_points`, `users.free_entries`, `users.pool_join_count` (and backfill join counts)
- **`0007`–`0008`** — engagement / retention columns and related tables (see `lib/db/migrations/`)
- **`0009_admin_wallet_and_draw_financials.sql`** — legacy `admin_wallet_transactions`, `platform_settings`, `pool_draw_financials`, `pool_participants.amount_paid`
- **`0010_central_wallet_user_wallets.sql`** — **`central_wallet_ledger`** (canonical treasury ledger), **`user_wallet`**, **`user_wallet_transactions`**; one-time backfill from legacy admin wallet + user aggregates. New writes go to `central_wallet_ledger` only.

**API (finance):** `GET /api/admin/finance/overview` (full dashboard payload), `GET /api/admin/wallet/balance` and `GET /api/admin/wallet/summary` (headline + period totals). **User:** `GET /api/user/wallet` (includes balance breakdown fields), `GET /api/user/wallet/transactions`. Regenerate clients after OpenAPI changes: **`pnpm --filter @workspace/api-spec run codegen`**.

If you change Drizzle schema under `lib/db`, run **`pnpm exec tsc -b lib/db`** (or root **`pnpm run typecheck:libs`**) so declaration files stay in sync. The **`@workspace/api-server`** `typecheck` script builds `lib/db` first, then typechecks the API.

## Fresh start — only one admin (live testing)

To **delete every user except** **`admin@usdtluck.com`** (Neon / Postgres), use a backup first, then run:

`scripts/reset-to-single-admin.sql`

It matches that email **case-insensitively**, removes related rows for all other users (transactions, pool entries, referrals, wallets, etc.), clears **`"session"`** so everyone must log in again, and resets the **`users` id sequence**. Optional commented block at the bottom can also wipe **pools** and **treasury ledgers** for an empty slate.

To keep a **different** email, edit `keep_email` at the top of the `DO` block in the script.

## Demo seed data (development only)

From repo root, after a successful API build and with **`DATABASE_URL`** set:

```bash
pnpm --filter @workspace/api-server run build
cd artifacts/api-server && pnpm seed:demo
```

Demo pools are titled with prefix **`DEMO —`** (em dash). Remove everything before production:

```bash
cd artifacts/api-server && pnpm seed:cleanup
```

Demo users have **`is_demo = true`** and **cannot log in**.

## Verification run (local)

- `pnpm run typecheck:libs` — TypeScript project references for `lib/*`
- `pnpm --filter @workspace/api-server run typecheck` — builds `lib/db` then typechecks the API
- `pnpm --filter @workspace/api-server run build`
- `cd artifacts/usdtluck && pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run dev:frontend` then production build: `pnpm --filter @workspace/usdtluck run build` (or `PORT=5173 BASE_PATH=/` inline if you prefer)

**CI:** On push/PR to `main` or `master`, GitHub Actions runs `pnpm run typecheck`, API `build`, and frontend `build` (see `.github/workflows/ci.yml`).

There is no automated `jest`/`vitest` suite in this repo yet; validation is typecheck + production builds.

## Manual QA checklist (staging / production)

Run these in the **browser** on the real deploy (e.g. frontend `https://securepool-usdtluck.vercel.app`, API `https://securepool-production.up.railway.app`). Use DevTools → **Application → Cookies** if a step fails: session should be set on the API host with `SameSite=None; Secure` in production.

### Auth & session

1. Open the app, **Sign up** or **Log in** with a test user.
2. Confirm you land on dashboard and **refresh** — user should stay logged in.
3. **Log out**, log in again — works.

### Cross-origin API (Vercel → Railway)

4. **Wallet → Deposit**: submit a small test deposit (screenshot + amount). Should succeed or show a clear validation error — not a silent failure.
5. **Wallet → Withdraw**: submit a small withdrawal (if balance allows). Should create a pending withdrawal.

### Profile — TRC20 wallet

6. As a normal user, open **Profile**: wallet field is read-only; **Request Address Change** opens the modal (double address + reason). After submit, a **pending** badge appears until an admin acts.

### Admin — wallet change requests

7. As **admin**, open **Admin → Wallets**: pending requests list; **Approve** updates the user’s `crypto_address`, **Reject** optionally stores an admin note.

### Admin — pending transactions

8. Log in as **admin**, open **Admin → Pending** (or the tab that lists pending deposits/withdrawals).
9. **Deposit (pending):** **Approve** — row should disappear or show completed; user balance should increase (and **$2 bonus** row may appear per product rules).
10. **Withdrawal (pending):** **Approve** — status should move to **Under review** (still in list).
11. Same row: **Mark complete** — row should leave the pending list; user gets completed withdrawal flow.
12. Optional: **Reject** on a pending item — row clears; user balance restored for withdrawals per backend rules.

### Notifications

13. Bell icon: **unread count** updates (polls every ~30s). Open dropdown — list loads from API (not empty error in Network tab).
14. **Mark all read** — count goes to zero.

### Static assets

15. Open a **deposit screenshot** in Admin (thumbnail or link). Image URL should hit **Railway** (`/uploads/...` on API origin), not Vercel 404.

### CSRF

16. Any **POST** from the SPA (approve, deposit, etc.) should return **200/201**, not **403** from CSRF. If 403 on POST only, check `x-csrf-token` and cookie flow in `main.tsx`.

Tick all boxes before calling a release “verified.”
