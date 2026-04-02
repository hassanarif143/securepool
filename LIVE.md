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

## Verification run (local)

- `pnpm run typecheck:libs` — TypeScript project references for `lib/*`
- `pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @workspace/api-server run build`
- `cd artifacts/usdtluck && pnpm exec tsc -p tsconfig.json --noEmit`
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/usdtluck run build`

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

### Admin — pending transactions

6. Log in as **admin**, open **Admin → Pending** (or the tab that lists pending deposits/withdrawals).
7. **Deposit (pending):** **Approve** — row should disappear or show completed; user balance should increase (and **$2 bonus** row may appear per product rules).
8. **Withdrawal (pending):** **Approve** — status should move to **Under review** (still in list).
9. Same row: **Mark complete** — row should leave the pending list; user gets completed withdrawal flow.
10. Optional: **Reject** on a pending item — row clears; user balance restored for withdrawals per backend rules.

### Notifications

11. Bell icon: **unread count** updates (polls every ~30s). Open dropdown — list loads from API (not empty error in Network tab).
12. **Mark all read** — count goes to zero.

### Static assets

13. Open a **deposit screenshot** in Admin (thumbnail or link). Image URL should hit **Railway** (`/uploads/...` on API origin), not Vercel 404.

### CSRF

14. Any **POST** from the SPA (approve, deposit, etc.) should return **200/201**, not **403** from CSRF. If 403 on POST only, check `x-csrf-token` and cookie flow in `main.tsx`.

Tick all boxes before calling a release “verified.”
