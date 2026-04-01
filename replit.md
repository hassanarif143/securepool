# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Session-based (express-session + connect-pg-simple)
- **Password hashing**: bcryptjs

## Applications

### USDTLuck (`artifacts/usdtluck`)
A full-stack USDT reward pool web app. Users join prize pools for 10 USDT, 3 random winners receive 100/50/30 USDT.

**Features:**
- User auth (signup/login/logout) with session cookies
- Wallet management with screenshot-based deposit verification flow
- Deposits: user submits amount + payment screenshot → pending → admin approves → balance credited
- Withdrawals: balance deducted immediately, admin processes payout
- USDT wallet address stored on user profile for identity verification
- Pool joining with countdown timers
- Random reward distribution (admin triggered)
- Admin panel: Pending deposits/withdrawals tab (approve/reject with screenshot preview), Stats, Pools, Users, Transactions
- Recent winners feed
- Transaction history with status badges and receipt links
- Reviews/testimonials system with star ratings, "Verified Winner" badges, admin moderation
- Referral program with referral codes and bonus crediting
- **Tier progression system**: 5 tiers (Aurora→Lumen→Nova→Celestia→Orion), awarded for pool joins (+15 pts) and deposits (+2 pts/USDT); free 10 USDT ticket on each tier upgrade; animated TierUpgradeModal with confetti
- **Tier Leaderboard**: public leaderboard ranked by tier points with tier badges and threshold display

**Demo accounts (password: `password123`):**
- Admin: `admin@usdtluck.com`
- User: `ahmed@example.com`

### API Server (`artifacts/api-server`)
Express 5 REST API serving all USDTLuck functionality.

**Routes:**
- `/api/auth` — signup, login, logout, /me (returns cryptoAddress)
- `/api/users/:id` — get/update user (name, cryptoAddress), user transactions
- `/api/pools` — CRUD pools, join pool, distribute rewards, participants
- `/api/transactions/deposit` — multipart/form-data (amount + screenshot image); creates pending tx
- `/api/transactions/withdraw` — JSON body; deducts balance immediately, creates pending tx
- `/api/winners` — recent winners feed
- `/api/dashboard/stats` — admin dashboard stats
- `/api/admin/users` — admin user listing
- `/api/admin/transactions/pending` — pending deposits & withdrawals for review
- `/api/admin/transactions/:id/approve` — approve tx, credit wallet for deposits
- `/api/admin/transactions/:id/reject` — reject tx, mark as failed
- `/uploads/*` — static file serving for uploaded screenshots
- `/api/reviews` — GET public reviews, POST submit review, GET /mine
- `/api/referral` — referral stats and code
- `/api/tier/me` — current user's tier info and progress
- `/api/tier/leaderboard` — top 20 users by tier points
- `/api/admin/users/:id/tier` — PATCH admin tier override
- `/api/admin/reviews` — full CRUD for reviews (hide/show/feature/delete)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server
│   └── usdtluck/           # React + Vite frontend
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package
```

## Database Schema

- **users**: id, name, email, password_hash, wallet_balance, crypto_address (TRC-20 wallet), is_admin, joined_at
- **pools**: id, title, entry_fee, max_users, start_time, end_time, status (open/closed/completed), prize_first/second/third, created_at
- **pool_participants**: id, pool_id, user_id, ticket_count, joined_at
- **transactions**: id, user_id, tx_type (deposit/withdraw/reward/pool_entry), amount, status (pending/completed/failed), note, screenshot_url, created_at
- **winners**: id, pool_id, user_id, place (1/2/3), prize, awarded_at
- **session**: sid, sess, expire (connect-pg-simple session store — created manually, do NOT drizzle push)

**Important**: `session` table was created manually via SQL. Never run `drizzle push` as it will try to drop it. Use direct ALTER TABLE SQL for schema changes.

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API client from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes

## Color Theme

- Primary: Emerald green (`152 76% 36%`)
- Background: Near-white (`0 0% 98%`)
- Foreground: Deep navy (`222 47% 11%`)
- Finance/crypto aesthetic: clean, trustable, professional
