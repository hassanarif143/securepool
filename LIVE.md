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

To **delete every user except** **`admin@usdtluck.com`** and get a **clean slate for real testing** (Neon / Postgres), take a backup first, then run:

`scripts/reset-to-single-admin.sql`

It matches that email **case-insensitively**, **deletes all pools** and pool-related rows (CASCADE where defined), **truncates** **`central_wallet_ledger`** and **`admin_wallet_transactions`**, clears **`user_wallet`** / **`user_wallet_transactions`**, wipes **transactions**, **referrals**, **activity** / **loyalty** tables, **notifications** and **reviews** (if those tables exist), **`lucky_hours`**, **squads**, **`"session"`** when present, then removes every other **`users`** row. The kept admin gets **wallet and stats reset to defaults** (password unchanged) and a fresh **`user_wallet`** row at zero. Sequences for **`users`** and **`pools`** are adjusted.

To keep a **different** email, edit `keep_email` in the `DO` block in the script.

**If nothing in the app changes after you “ran” the script:** the SQL almost certainly did not run against the **same** database your API uses. In Neon, open the project whose **connection string matches** Railway `DATABASE_URL` (same host, database name, and branch if you use branching). Then run `scripts/list-users.sql` — you should see exactly what the API will return on **`GET /api/admin/users`**.

**If `hassanarif143@yahoo.com` (or any extra account) is still listed:** either the full reset never applied, or it **aborted** because **`admin@usdtluck.com` does not exist** on that database (the script rolls back the whole transaction and leaves all users untouched). Fix: create/sign up **`admin@usdtluck.com`** on production, or change `keep_email` in the script to the account you want to keep, then run `scripts/reset-to-single-admin.sql` again.

**To remove only one non-admin account** without wiping pools or treasury, edit `target_email` in `scripts/purge-user-by-email.sql` and run it on the correct Neon database.

### Full wipe + brand-new admin (email + password)

Use this when you want **zero users** in the database and **one new admin** with credentials you choose (bcrypt hash matches the API). Requires **Node** and the same **`DATABASE_URL`** as production.

From **repo root** (after `pnpm install`):

```bash
pnpm --filter @workspace/api-server run build
cd artifacts/api-server
FRESH_CONFIRM=YES ADMIN_EMAIL='your-admin@example.com' ADMIN_PASSWORD='your-secure-pass' ADMIN_NAME='Admin' pnpm run fresh:start
```

The command prints **`userId`**, **`email`**, and **`password`**. Then:

1. Set **`SUPER_ADMIN_USER_IDS`** on Railway to that **`userId`** (comma-separated if you add more admins later).
2. Log out of the site (or clear cookies) and sign in with the new email and password.
3. Redeploy the API if you only changed env vars.

This clears the same data as `scripts/reset-to-single-admin.sql` (pools, ledgers, transactions, all users) but **recreates** the admin row instead of keeping `admin@usdtluck.com`.

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
