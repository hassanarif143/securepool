#!/usr/bin/env node
/**
 * Authenticated HTTP smoke: login → GET /api/games/state → POST /api/games/play (optional).
 *
 * Requires a running API (see PORT in .env). Set credentials:
 *   ARCADE_SMOKE_EMAIL=you@example.com ARCADE_SMOKE_PASSWORD=secret
 *
 * Optional:
 *   API_BASE_URL=http://127.0.0.1:8080   (default; must match server listen URL)
 *   ARCADE_SMOKE_PUBLIC_ONLY=1           no login: GET /api/health + /api/auth/csrf-token only
 *   ARCADE_SMOKE_SKIP_PLAY=1             only login + games/state (no wager)
 *   ARCADE_SMOKE_BET=1                   bet amount (must be 1, 2, or 5)
 *   ARCADE_SMOKE_GAME=spin_wheel         spin_wheel | mystery_box | scratch_card
 *
 * Dev only (local DB — resets first admin password via dist/reset-user-password.mjs):
 *   ARCADE_SMOKE_DEV_RESET_ADMIN=1 ARCADE_SMOKE_PASSWORD='min-8-chars'
 *   Requires pnpm run build; uses DATABASE_URL from .env. Do not use against production.
 *
 * CSRF + Origin match the Express middleware (Origin = API origin works for local calls).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(apiRoot, ".env") });

const API_BASE_URL = (process.env.API_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? "8080"}`).replace(/\/+$/, "");
const ORIGIN = new URL(API_BASE_URL).origin;
const SKIP_PLAY = process.env.ARCADE_SMOKE_SKIP_PLAY === "1" || process.env.ARCADE_SMOKE_SKIP_PLAY === "true";
const PUBLIC_ONLY = process.env.ARCADE_SMOKE_PUBLIC_ONLY === "1" || process.env.ARCADE_SMOKE_PUBLIC_ONLY === "true";
const BET = Number(process.env.ARCADE_SMOKE_BET ?? "1");
const GAME = process.env.ARCADE_SMOKE_GAME ?? "spin_wheel";

/** @type {Map<string, string>} */
const jar = new Map();

function cookieHeader() {
  if (jar.size === 0) return "";
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Multiple Set-Cookie headers are sometimes folded into one comma-separated string; Expires= also contains commas. */
function splitSetCookieHeader(flat) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < flat.length - 1; i++) {
    if (flat[i] !== ",") continue;
    const rest = flat.slice(i + 1).trimStart();
    if (/^[^=,\s]+=/.test(rest)) {
      parts.push(flat.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(flat.slice(start).trim());
  return parts.filter(Boolean);
}

/**
 * @param {Headers} headers
 */
function mergeSetCookie(headers) {
  let lines = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  if (!lines.length) {
    const raw = headers.get("set-cookie");
    if (raw) lines = splitSetCookieHeader(raw);
  }
  for (const line of lines) {
    const first = line.split(";")[0];
    const eq = first.indexOf("=");
    if (eq === -1) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
}

/**
 * @param {string} pathSuffix
 * @param {RequestInit} [init]
 */
async function apiFetch(pathSuffix, init = {}) {
  const url = `${API_BASE_URL}${pathSuffix.startsWith("/") ? pathSuffix : `/${pathSuffix}`}`;
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", ORIGIN);
  const c = cookieHeader();
  if (c) headers.set("Cookie", c);
  const res = await fetch(url, { ...init, headers });
  mergeSetCookie(res.headers);
  return res;
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function idemKey() {
  return crypto.randomUUID();
}

/** reset-user-password prints pretty JSON; extract first complete `{ ... }` object. */
function parseResetPasswordJson(out) {
  const start = out.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < out.length; i++) {
    const c = out[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(out.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

async function main() {
  console.log("API:", API_BASE_URL);

  if (PUBLIC_ONLY) {
    let health;
    try {
      health = await apiFetch("/api/health", { method: "GET" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Request failed — is the API running?", msg);
      process.exit(1);
    }
    if (!health.ok) {
      console.error("GET /api/health failed:", health.status, await health.text());
      process.exit(1);
    }
    const healthBody = await readJson(health);
    console.log("Health:", healthBody);

    let csrfRes;
    try {
      csrfRes = await apiFetch("/api/auth/csrf-token", { method: "GET" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("CSRF request failed:", msg);
      process.exit(1);
    }
    if (!csrfRes.ok) {
      console.error("GET /api/auth/csrf-token failed:", csrfRes.status, await csrfRes.text());
      process.exit(1);
    }
    const csrfJson = await readJson(csrfRes);
    if (typeof csrfJson.csrfToken !== "string" || csrfJson.csrfToken.length < 10) {
      console.error("Invalid csrf response:", csrfJson);
      process.exit(1);
    }
    console.log("OK: public arcade HTTP smoke (health + CSRF). Start API and add credentials for full flow.");
    process.exit(0);
  }

  let authEmail = process.env.ARCADE_SMOKE_EMAIL?.trim() ?? "";
  let authPassword = process.env.ARCADE_SMOKE_PASSWORD ?? "";

  const devReset =
    process.env.ARCADE_SMOKE_DEV_RESET_ADMIN === "1" || process.env.ARCADE_SMOKE_DEV_RESET_ADMIN === "true";
  if (devReset) {
    if (!authPassword || authPassword.length < 8) {
      console.error("ARCADE_SMOKE_DEV_RESET_ADMIN requires ARCADE_SMOKE_PASSWORD (min 8 characters).");
      process.exit(1);
    }
    const resetScript = path.join(apiRoot, "dist", "reset-user-password.mjs");
    let out;
    try {
      out = execFileSync(process.execPath, ["--enable-source-maps", resetScript], {
        cwd: apiRoot,
        encoding: "utf8",
        env: { ...process.env, RESET_FIRST_ADMIN: "1", NEW_PASSWORD: authPassword },
      });
    } catch (e) {
      console.error("reset-user-password failed:", e instanceof Error ? e.message : e);
      process.exit(1);
    }
    const j = parseResetPasswordJson(out);
    if (!j) {
      console.error("reset-user-password did not emit parseable JSON. Output:\n", out);
      process.exit(1);
    }
    if (!j.ok || typeof j.email !== "string") {
      console.error("reset failed:", j);
      process.exit(1);
    }
    authEmail = j.email;
    console.log("DEV: first admin password reset; user id", j.userId);
  }

  if (!authEmail || !authPassword) {
    console.error(
      "Set ARCADE_SMOKE_EMAIL and ARCADE_SMOKE_PASSWORD, ARCADE_SMOKE_DEV_RESET_ADMIN=1 (dev), or ARCADE_SMOKE_PUBLIC_ONLY=1 (see script header).",
    );
    process.exit(1);
  }

  let csrfRes = await apiFetch("/api/auth/csrf-token", { method: "GET" });
  if (!csrfRes.ok) {
    console.error("GET /api/auth/csrf-token failed:", csrfRes.status, await csrfRes.text());
    process.exit(1);
  }
  const csrfJson = await readJson(csrfRes);
  const csrfToken = typeof csrfJson.csrfToken === "string" ? csrfJson.csrfToken : "";
  if (!csrfToken) {
    console.error("No csrfToken in response:", csrfJson);
    process.exit(1);
  }

  const loginRes = await apiFetch("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify({ email: authEmail, password: authPassword }),
  });
  const loginBody = await readJson(loginRes);
  if (!loginRes.ok) {
    console.error("Login failed:", loginRes.status, loginBody);
    process.exit(1);
  }
  console.log("Login OK — user id:", loginBody.user?.id ?? "?");

  const stateRes = await apiFetch("/api/games/state", { method: "GET" });
  const stateBody = await readJson(stateRes);
  if (!stateRes.ok) {
    console.error("GET /api/games/state failed:", stateRes.status, stateBody);
    process.exit(1);
  }
  console.log("Games state:", {
    canPlay: stateBody.canPlay,
    reason: stateBody.reason,
    allowedBets: stateBody.allowedBets,
  });

  if (SKIP_PLAY) {
    console.log("OK (ARCADE_SMOKE_SKIP_PLAY): skipped POST /api/games/play");
    process.exit(0);
  }

  if (!stateBody.canPlay) {
    console.log("Skip play: canPlay is false —", stateBody.reason ?? "unknown");
    process.exit(0);
  }

  if (![1, 2, 5].includes(BET)) {
    console.error("ARCADE_SMOKE_BET must be 1, 2, or 5");
    process.exit(1);
  }
  const allowed = Array.isArray(stateBody.allowedBets) ? stateBody.allowedBets : [1, 2, 5];
  if (!allowed.includes(BET)) {
    console.error("Bet", BET, "not in allowedBets:", allowed);
    process.exit(1);
  }

  const gameTypes = new Set(["spin_wheel", "mystery_box", "scratch_card"]);
  if (!gameTypes.has(GAME)) {
    console.error("ARCADE_SMOKE_GAME must be spin_wheel, mystery_box, or scratch_card");
    process.exit(1);
  }

  const csrfRes2 = await apiFetch("/api/auth/csrf-token", { method: "GET" });
  const csrfJson2 = await readJson(csrfRes2);
  const csrf2 = typeof csrfJson2.csrfToken === "string" ? csrfJson2.csrfToken : csrfToken;

  const playRes = await apiFetch("/api/games/play", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf2,
      "x-idempotency-key": idemKey(),
    },
    body: JSON.stringify({ gameType: GAME, betAmount: BET }),
  });
  const playBody = await readJson(playRes);
  if (!playRes.ok) {
    console.error("POST /api/games/play failed:", playRes.status, playBody);
    if (playBody.error === "INSUFFICIENT_BALANCE") {
      console.log("Tip: fund withdrawable balance for this user, or use ARCADE_SMOKE_SKIP_PLAY=1");
    }
    process.exit(1);
  }
  console.log("Play OK:", {
    roundId: playBody.roundId,
    resultType: playBody.resultType,
    multiplier: playBody.multiplier,
    winAmount: playBody.winAmount,
    newBalance: playBody.newBalance,
  });
  console.log("OK: arcade HTTP smoke finished.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
