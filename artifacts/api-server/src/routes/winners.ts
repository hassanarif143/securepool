import { Router, type IRouter } from "express";
import { db, winnersTable, usersTable, poolsTable } from "@workspace/db";
import { poolTicketsTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getAuthedUserId, requireAuth, type AuthedRequest } from "../middleware/auth";
import { privacyDisplayName } from "../lib/privacy-name";

const router: IRouter = Router();

function truncateWallet(addr: string | null | undefined): string | null {
  if (!addr || addr.length < 14) return addr ?? null;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function maskUsername(name: string): string {
  if (name.length <= 2) return `${name}***`;
  if (name.length <= 4) return `${name.slice(0, 2)}***`;
  return `${name.slice(0, 2)}***${name.slice(-2)}`;
}

router.get("/recent", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: winnersTable.id,
        userName: usersTable.name,
        poolName: poolsTable.title,
        amountWon: winnersTable.prize,
        completedAt: winnersTable.awardedAt,
      })
      .from(winnersTable)
      .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
      .innerJoin(poolsTable, eq(winnersTable.poolId, poolsTable.id))
      .where(eq(winnersTable.paymentStatus, "paid"))
      .orderBy(desc(winnersTable.awardedAt))
      .limit(20);

    res.json(
      rows.map((row) => ({
        id: row.id,
        maskedUsername: maskUsername(row.userName),
        poolName: row.poolName,
        amountWon: parseFloat(String(row.amountWon)),
        completedAt: row.completedAt,
      })),
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch recent winners" });
  }
});

router.get("/recent-payouts", async (req, res) => {
  const raw = parseInt(String(req.query.limit ?? "10"), 10);
  const lim = Number.isNaN(raw) ? 10 : Math.min(raw, 30);
  const rows = await db
    .select({
      id: winnersTable.id,
      userName: usersTable.name,
      place: winnersTable.place,
      prize: winnersTable.prize,
      awardedAt: winnersTable.awardedAt,
      paymentStatus: winnersTable.paymentStatus,
      poolTitle: poolsTable.title,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .innerJoin(poolsTable, eq(winnersTable.poolId, poolsTable.id))
    .where(eq(winnersTable.paymentStatus, "paid"))
    .orderBy(desc(winnersTable.awardedAt))
    .limit(lim);

  res.json(
    rows.map((w) => ({
      id: w.id,
      userName: privacyDisplayName(w.userName),
      place: w.place,
      prizeAmount: parseFloat(w.prize),
      poolName: w.poolTitle,
      drawnAt: w.awardedAt,
      status: w.paymentStatus,
    })),
  );
});

router.get("/pool/:poolId", async (req, res) => {
  const poolId = parseInt(req.params.poolId, 10);
  if (isNaN(poolId)) {
    res.status(400).json({ error: "Invalid pool ID" });
    return;
  }
  const rows = await db
    .select({
      place: winnersTable.place,
      prize: winnersTable.prize,
      awardedAt: winnersTable.awardedAt,
      userName: usersTable.name,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .where(eq(winnersTable.poolId, poolId))
    .orderBy(winnersTable.place);

  res.json(
    rows.map((r) => ({
      position: r.place,
      user_name: privacyDisplayName(r.userName),
      prize_amount: parseFloat(r.prize),
      drawn_at: r.awardedAt,
    })),
  );
});

router.get(
  "/me/payouts",
  (req, res, next) => {
    requireAuth(req as AuthedRequest, res, next);
  },
  async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select({
      id: winnersTable.id,
      poolTitle: poolsTable.title,
      place: winnersTable.place,
      prize: winnersTable.prize,
      awardedAt: winnersTable.awardedAt,
      paymentStatus: winnersTable.paymentStatus,
    })
    .from(winnersTable)
    .innerJoin(poolsTable, eq(winnersTable.poolId, poolsTable.id))
    .where(eq(winnersTable.userId, userId))
    .orderBy(desc(winnersTable.awardedAt))
    .limit(50);

    res.json(
      rows.map((w) => ({
        id: w.id,
        poolName: w.poolTitle,
        position: w.place,
        prizeAmount: parseFloat(w.prize),
        drawnAt: w.awardedAt,
        paymentStatus: w.paymentStatus,
      })),
    );
  },
);

router.get("/", async (req, res) => {
  const raw = parseInt(String(req.query.limit ?? "50"), 10);
  const lim = Number.isNaN(raw) ? 50 : Math.min(raw, 100);
  const winners = await db
    .select({
      id: winnersTable.id,
      poolId: winnersTable.poolId,
      poolTitle: poolsTable.title,
      userId: winnersTable.userId,
      userName: usersTable.name,
      cryptoAddress: usersTable.cryptoAddress,
      place: winnersTable.place,
      prize: winnersTable.prize,
      awardedAt: winnersTable.awardedAt,
      paymentStatus: winnersTable.paymentStatus,
    })
    .from(winnersTable)
    .innerJoin(usersTable, eq(winnersTable.userId, usersTable.id))
    .innerJoin(poolsTable, eq(winnersTable.poolId, poolsTable.id))
    .orderBy(desc(winnersTable.awardedAt))
    .limit(lim);

  const enriched = await Promise.all(
    winners.map(async (w) => {
      const ticketRows = await db
        .select({ ticketNumber: poolTicketsTable.ticketNumber })
        .from(poolTicketsTable)
        .where(and(eq(poolTicketsTable.poolId, w.poolId), eq(poolTicketsTable.userId, w.userId)))
        .orderBy(poolTicketsTable.ticketNumber);
      return {
      id: w.id,
      poolId: w.poolId,
      poolTitle: w.poolTitle,
      userId: w.userId,
      userName: privacyDisplayName(w.userName),
      // Backward-compatible aliases used by older/mobile ticker UIs.
      winnerName: privacyDisplayName(w.userName),
      place: w.place,
      prize: parseFloat(w.prize),
      amount: parseFloat(w.prize),
      awardedAt: w.awardedAt,
      createdAt: w.awardedAt,
      withdrawalStatus: w.paymentStatus,
      walletAddressTruncated: truncateWallet(w.cryptoAddress),
      screenshotUrl: null as string | null,
      winnerTicketCount: ticketRows.length,
      winnerTicketNumbers: ticketRows.map((t) => t.ticketNumber).filter((n): n is number => Number.isInteger(n)),
    };
    }),
  );
  res.json(enriched);
});

export default router;
