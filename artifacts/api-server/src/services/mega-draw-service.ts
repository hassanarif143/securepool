import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, megaDrawRoundsTable, megaDrawTicketsTable, usersTable } from "@workspace/db";
import { creditGameWin, debitGameBet } from "./arcade-engine";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const TICKET_PRICE = 2;
export const MEGA_DRAW_MAX_TICKETS_CAP = 200;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Next 21:00 PKT = 16:00 UTC (PKT = UTC+5). */
export function nextDrawAtUtc(): Date {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 16, 0, 0, 0));
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target;
}

function positionalMatches(ticket: string, winning: string): number {
  let c = 0;
  for (let i = 0; i < 4; i++) {
    if (ticket[i] === winning[i]) c++;
  }
  return c;
}

function randomWinningNumber(): string {
  return Array.from({ length: 4 }, () => crypto.randomInt(0, 10)).join("");
}

function validateTicketNumber(s: string): boolean {
  return /^[0-9]{4}$/.test(s);
}

async function insertNewOpenRoundTx(tx: DbTx, initialJackpot = 0): Promise<typeof megaDrawRoundsTable.$inferSelect> {
  const [maxRow] = await tx.select({ m: sql<string>`coalesce(max(${megaDrawRoundsTable.roundNumber})::int, 0)` }).from(megaDrawRoundsTable);
  const nextNum = Math.floor(toNum(maxRow?.m)) + 1;
  const [created] = await tx
    .insert(megaDrawRoundsTable)
    .values({
      roundNumber: nextNum,
      status: "open",
      jackpotPool: initialJackpot.toFixed(2),
      totalPool: "0",
      totalPaidOut: "0",
      totalTickets: 0,
      drawAt: nextDrawAtUtc(),
    })
    .returning();
  if (!created) throw new Error("MEGA_DRAW_ROUND_CREATE_FAILED");
  return created;
}

export async function ensureMegaDrawOpenRound(): Promise<typeof megaDrawRoundsTable.$inferSelect> {
  const [open] = await db
    .select()
    .from(megaDrawRoundsTable)
    .where(eq(megaDrawRoundsTable.status, "open"))
    .orderBy(desc(megaDrawRoundsTable.id))
    .limit(1);
  if (open) return open;
  return db.transaction(async (tx) => insertNewOpenRoundTx(tx));
}

async function ensureOpenRoundTx(tx: DbTx): Promise<typeof megaDrawRoundsTable.$inferSelect> {
  const [open] = await tx
    .select()
    .from(megaDrawRoundsTable)
    .where(eq(megaDrawRoundsTable.status, "open"))
    .orderBy(desc(megaDrawRoundsTable.id))
    .limit(1);
  if (open) return open;
  return insertNewOpenRoundTx(tx);
}

export async function getMegaDrawCurrentPublic(userId: number | null): Promise<{
  round: {
    id: number;
    roundNumber: number;
    status: string;
    totalTickets: number;
    totalPool: number;
    jackpotPool: number;
    displayJackpot: number;
    drawAt: string | null;
    capTickets: number;
  };
  myTickets: { id: number; ticketNumber: string; createdAt: string }[];
}> {
  const round = await ensureMegaDrawOpenRound();
  const totalPool = toNum(round.totalPool);
  const jackpotPool = toNum(round.jackpotPool);
  const displayJackpot = round2(jackpotPool + totalPool);

  let myTicketsRaw: { id: number; ticketNumber: string; createdAt: Date | string | null }[] = [];
  if (userId) {
    myTicketsRaw = await db
      .select({
        id: megaDrawTicketsTable.id,
        ticketNumber: megaDrawTicketsTable.ticketNumber,
        createdAt: megaDrawTicketsTable.createdAt,
      })
      .from(megaDrawTicketsTable)
      .where(and(eq(megaDrawTicketsTable.roundId, round.id), eq(megaDrawTicketsTable.userId, userId)))
      .orderBy(desc(megaDrawTicketsTable.id));
  }

  const myTickets = myTicketsRaw.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    createdAt:
      t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt ?? ""),
  }));

  return {
    round: {
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      totalTickets: round.totalTickets,
      totalPool,
      jackpotPool,
      displayJackpot,
      drawAt: round.drawAt ? (round.drawAt instanceof Date ? round.drawAt : new Date(round.drawAt as string)).toISOString() : null,
      capTickets: MEGA_DRAW_MAX_TICKETS_CAP,
    },
    myTickets,
  };
}

function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (d instanceof Date) return d.toISOString();
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

/** Single round snapshot + optional user tickets + match-tier counts (completed rounds). */
export async function getMegaDrawRoundResults(
  roundId: number,
  userId: number | null,
): Promise<{
  round: {
    id: number;
    roundNumber: number;
    status: string;
    winningNumber: string | null;
    totalTickets: number;
    totalPool: number;
    jackpotPool: number;
    totalPaidOut: number;
    drawAt: string | null;
    drawnAt: string | null;
    createdAt: string;
  };
  myTickets: {
    id: number;
    ticketNumber: string;
    matchCount: number | null;
    winAmount: number;
    createdAt: string;
  }[];
  matchCounts: { match4: number; match3: number; match2: number; match1: number; match0: number };
} | null> {
  const [round] = await db.select().from(megaDrawRoundsTable).where(eq(megaDrawRoundsTable.id, roundId)).limit(1);
  if (!round) return null;

  const tierRows = await db
    .select({ mc: megaDrawTicketsTable.matchCount })
    .from(megaDrawTicketsTable)
    .where(eq(megaDrawTicketsTable.roundId, roundId));
  const matchCounts = { match4: 0, match3: 0, match2: 0, match1: 0, match0: 0 };
  for (const row of tierRows) {
    const m = row.mc;
    if (m === 4) matchCounts.match4++;
    else if (m === 3) matchCounts.match3++;
    else if (m === 2) matchCounts.match2++;
    else if (m === 1) matchCounts.match1++;
    else if (m === 0) matchCounts.match0++;
  }

  let myTicketsRaw: {
    id: number;
    ticketNumber: string;
    matchCount: number | null;
    winAmount: string | null;
    createdAt: Date | string | null;
  }[] = [];
  if (userId) {
    myTicketsRaw = await db
      .select({
        id: megaDrawTicketsTable.id,
        ticketNumber: megaDrawTicketsTable.ticketNumber,
        matchCount: megaDrawTicketsTable.matchCount,
        winAmount: megaDrawTicketsTable.winAmount,
        createdAt: megaDrawTicketsTable.createdAt,
      })
      .from(megaDrawTicketsTable)
      .where(and(eq(megaDrawTicketsTable.roundId, roundId), eq(megaDrawTicketsTable.userId, userId)))
      .orderBy(desc(megaDrawTicketsTable.id));
  }

  const myTickets = myTicketsRaw.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    matchCount: t.matchCount,
    winAmount: toNum(t.winAmount),
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt ?? ""),
  }));

  return {
    round: {
      id: round.id,
      roundNumber: round.roundNumber,
      status: round.status,
      winningNumber: round.winningNumber ?? null,
      totalTickets: round.totalTickets,
      totalPool: toNum(round.totalPool),
      jackpotPool: toNum(round.jackpotPool),
      totalPaidOut: toNum(round.totalPaidOut),
      drawAt: iso(round.drawAt as Date | string | null),
      drawnAt: iso(round.drawnAt as Date | string | null),
      createdAt: iso(round.createdAt as Date | string | null) ?? new Date().toISOString(),
    },
    myTickets,
    matchCounts,
  };
}

export async function buyMegaDrawTickets(
  userId: number,
  ticketNumbers: string[],
): Promise<{ ok: true; roundId: number; bought: number; newBalance: number } | { ok: false; error: string }> {
  const cleaned = ticketNumbers.map((s) => String(s).replace(/\D/g, "").padStart(4, "0").slice(-4));
  if (cleaned.length === 0 || cleaned.length > 20) return { ok: false, error: "INVALID_TICKETS" };
  for (const t of cleaned) {
    if (!validateTicketNumber(t)) return { ok: false, error: "INVALID_TICKETS" };
  }

  try {
    return await db.transaction(async (tx) => {
      const round = await ensureOpenRoundTx(tx);
      if (round.status !== "open") return { ok: false, error: "ROUND_CLOSED" };
      if (round.totalTickets + cleaned.length > MEGA_DRAW_MAX_TICKETS_CAP) {
        return { ok: false, error: "CAP_REACHED" };
      }

      const spend = round2(TICKET_PRICE * cleaned.length);
      await debitGameBet(tx, userId, spend, `Mega Draw — ${cleaned.length} ticket(s) round ${round.roundNumber}`);

      for (const num of cleaned) {
        await tx.insert(megaDrawTicketsTable).values({
          roundId: round.id,
          userId,
          ticketNumber: num,
          ticketPrice: TICKET_PRICE.toFixed(2),
        });
      }

      const newTotal = round.totalTickets + cleaned.length;
      const newPool = toNum(round.totalPool) + spend;
      await tx
        .update(megaDrawRoundsTable)
        .set({
          totalTickets: newTotal,
          totalPool: newPool.toFixed(2),
        })
        .where(eq(megaDrawRoundsTable.id, round.id));

      const [u] = await tx.select({ wd: usersTable.withdrawableBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);

      const out = { ok: true as const, roundId: round.id, bought: cleaned.length, newBalance: toNum(u?.wd) };

      if (newTotal >= MEGA_DRAW_MAX_TICKETS_CAP) {
        await runMegaDrawForRoundTx(tx, round.id);
      }

      return out;
    });
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : "ERR";
    if (m === "INSUFFICIENT_BALANCE") return { ok: false, error: "INSUFFICIENT_BALANCE" };
    console.error("[mega-draw] buy", e);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export async function runMegaDrawDue(): Promise<{ ran: boolean; roundId?: number }> {
  const now = new Date();
  const openRounds = await db
    .select()
    .from(megaDrawRoundsTable)
    .where(eq(megaDrawRoundsTable.status, "open"))
    .orderBy(megaDrawRoundsTable.id);

  const due = openRounds.find(
    (r) =>
      (r.drawAt != null && (r.drawAt as Date) <= now) ||
      r.totalTickets >= MEGA_DRAW_MAX_TICKETS_CAP,
  );
  if (!due) return { ran: false };

  await db.transaction(async (tx) => {
    await runMegaDrawForRoundTx(tx, due.id);
  });
  return { ran: true, roundId: due.id };
}

export async function runMegaDrawForRoundTx(tx: DbTx, roundId: number): Promise<void> {
  const [round] = await tx.select().from(megaDrawRoundsTable).where(eq(megaDrawRoundsTable.id, roundId)).limit(1);
  if (!round || round.status !== "open") return;

  const winning = randomWinningNumber();
  const tickets = await tx.select().from(megaDrawTicketsTable).where(eq(megaDrawTicketsTable.roundId, roundId));

  const jackpotBase = toNum(round.jackpotPool);
  const sales = toNum(round.totalPool);
  const grandPot = round2(jackpotBase + sales);

  const winners4: (typeof tickets)[number][] = [];
  let paid = 0;

  for (const t of tickets) {
    const m = positionalMatches(t.ticketNumber, winning);
    if (m === 4) winners4.push(t);
    else if (m === 3) {
      const w = 20;
      paid += w;
      await tx
        .update(megaDrawTicketsTable)
        .set({ matchCount: m, winAmount: w.toFixed(2) })
        .where(eq(megaDrawTicketsTable.id, t.id));
      await creditGameWin(tx, t.userId, w, `Mega Draw 3/4 — round ${round.roundNumber}`);
    } else if (m === 2) {
      const w = 6;
      paid += w;
      await tx
        .update(megaDrawTicketsTable)
        .set({ matchCount: m, winAmount: w.toFixed(2) })
        .where(eq(megaDrawTicketsTable.id, t.id));
      await creditGameWin(tx, t.userId, w, `Mega Draw 2/4 — round ${round.roundNumber}`);
    } else if (m === 1) {
      const w = 2;
      paid += w;
      await tx
        .update(megaDrawTicketsTable)
        .set({ matchCount: m, winAmount: w.toFixed(2) })
        .where(eq(megaDrawTicketsTable.id, t.id));
      await creditGameWin(tx, t.userId, w, `Mega Draw 1/4 — round ${round.roundNumber}`);
    } else {
      await tx
        .update(megaDrawTicketsTable)
        .set({ matchCount: m, winAmount: "0.00" })
        .where(eq(megaDrawTicketsTable.id, t.id));
    }
  }

  if (winners4.length > 0) {
    const each = round2(grandPot / winners4.length);
    for (const t of winners4) {
      paid += each;
      await tx
        .update(megaDrawTicketsTable)
        .set({ matchCount: 4, winAmount: each.toFixed(2) })
        .where(eq(megaDrawTicketsTable.id, t.id));
      await creditGameWin(tx, t.userId, each, `Mega Draw JACKPOT 4/4 — round ${round.roundNumber}`);
    }
  }

  const nextJackpot = winners4.length === 0 ? round2(jackpotBase + sales * 0.2) : 0;

  await tx
    .update(megaDrawRoundsTable)
    .set({
      status: "completed",
      winningNumber: winning,
      totalPaidOut: paid.toFixed(2),
      drawnAt: new Date(),
    })
    .where(eq(megaDrawRoundsTable.id, roundId));

  await insertNewOpenRoundTx(tx, nextJackpot);
}
