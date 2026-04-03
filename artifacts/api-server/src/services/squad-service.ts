import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import {
  db,
  squadsTable,
  squadMembersTable,
  squadBonusesTable,
  usersTable,
  winnersTable,
  poolParticipantsTable,
} from "@workspace/db";
import { count } from "drizzle-orm";
import { privacyDisplayName } from "../lib/privacy-name";
import { notifyUser } from "../lib/notify";
import { grantReferralPointsWithExpiry } from "./points-ledger-service";

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function createSquad(leaderId: number, name: string) {
  const trimmed = name.trim().slice(0, 50);
  if (trimmed.length < 2) return { ok: false as const, error: "Name too short" };

  const [asLeader] = await db.select().from(squadsTable).where(eq(squadsTable.leaderId, leaderId)).limit(1);
  if (asLeader) return { ok: false as const, error: "You already lead a squad" };

  const [inSquad] = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, leaderId)).limit(1);
  if (inSquad) return { ok: false as const, error: "Leave your current squad first" };

  let code = randomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [squad] = await db
        .insert(squadsTable)
        .values({ name: trimmed, code, leaderId, maxMembers: 5 })
        .returning();
      await db.insert(squadMembersTable).values({ squadId: squad!.id, userId: leaderId });
      return { ok: true as const, squad: squad! };
    } catch {
      code = randomCode();
    }
  }
  return { ok: false as const, error: "Could not generate code — try again" };
}

export async function joinSquadByCode(userId: number, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (code.length !== 8) return { ok: false as const, error: "Invalid code" };

  const [inSquad] = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, userId)).limit(1);
  if (inSquad) return { ok: false as const, error: "Already in a squad" };

  const [squad] = await db.select().from(squadsTable).where(eq(squadsTable.code, code)).limit(1);
  if (!squad) return { ok: false as const, error: "Squad not found" };

  const [{ n }] = await db
    .select({ n: count() })
    .from(squadMembersTable)
    .where(eq(squadMembersTable.squadId, squad.id));
  if (Number(n) >= squad.maxMembers) return { ok: false as const, error: "Squad is full" };

  try {
    await db.insert(squadMembersTable).values({ squadId: squad.id, userId });
    return { ok: true as const, squadId: squad.id };
  } catch {
    return { ok: false as const, error: "Could not join" };
  }
}

export async function leaveSquad(userId: number) {
  const [m] = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, userId)).limit(1);
  if (!m) return { ok: false as const, error: "Not in a squad" };

  const [squad] = await db.select().from(squadsTable).where(eq(squadsTable.id, m.squadId)).limit(1);
  if (squad?.leaderId === userId) return { ok: false as const, error: "Leaders cannot leave (contact support to transfer)" };

  await db.delete(squadMembersTable).where(and(eq(squadMembersTable.squadId, m.squadId), eq(squadMembersTable.userId, userId)));
  return { ok: true as const };
}

export async function getSquadForUser(userId: number) {
  const [m] = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, userId)).limit(1);
  if (!m) return null;

  const [squad] = await db.select().from(squadsTable).where(eq(squadsTable.id, m.squadId)).limit(1);
  if (!squad) return null;

  const members = await db
    .select({
      userId: squadMembersTable.userId,
      joinedAt: squadMembersTable.joinedAt,
      name: usersTable.name,
      poolVipTier: usersTable.poolVipTier,
      totalWins: usersTable.totalWins,
    })
    .from(squadMembersTable)
    .innerJoin(usersTable, eq(squadMembersTable.userId, usersTable.id))
    .where(eq(squadMembersTable.squadId, squad.id));

  let squadWins = 0;
  for (const mem of members) {
    squadWins += mem.totalWins ?? 0;
  }

  const bonuses = await db
    .select()
    .from(squadBonusesTable)
    .where(eq(squadBonusesTable.squadId, squad.id))
    .orderBy(desc(squadBonusesTable.createdAt))
    .limit(20);

  return { squad, members, squadWins, recentBonuses: bonuses };
}

export async function notifySquadOnMemberWin(opts: {
  winnerUserId: number;
  poolId: number;
  poolTitle: string;
  prize: number;
}) {
  const [m] = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, opts.winnerUserId)).limit(1);
  if (!m) return;

  const [winner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, opts.winnerUserId)).limit(1);
  const who = privacyDisplayName(winner?.name ?? "Member");

  const others = await db
    .select({ userId: squadMembersTable.userId })
    .from(squadMembersTable)
    .where(and(eq(squadMembersTable.squadId, m.squadId), ne(squadMembersTable.userId, opts.winnerUserId)));

  for (const o of others) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, o.userId)).limit(1);
    if (!u) continue;
    await db
      .update(usersTable)
      .set({ referralPoints: (u.referralPoints ?? 0) + 1 })
      .where(eq(usersTable.id, o.userId));
    await grantReferralPointsWithExpiry(o.userId, 1, "squad_win", `Squad mate won in ${opts.poolTitle}`);
    await db.insert(squadBonusesTable).values({
      squadId: m.squadId,
      userId: o.userId,
      triggeredByUserId: opts.winnerUserId,
      poolId: opts.poolId,
      bonusType: "mate_win",
      bonusValue: "1",
    });
    void notifyUser(
      o.userId,
      "Squad celebration",
      `${who} earned ${opts.prize} USDT in ${opts.poolTitle}. You earned 1 bonus point for being on the same squad.`,
      "success",
    );
  }
}

/** Grant joiner a one-time squad bonus if a squad mate is already in this pool. */
export async function applySquadCoPoolBonus(opts: {
  userId: number;
  poolId: number;
  poolTitle: string;
  entryFee: number;
}) {
  const [m] = await db.select().from(squadMembersTable).where(eq(squadMembersTable.userId, opts.userId)).limit(1);
  if (!m) return;

  const squadMateIds = await db
    .select({ userId: squadMembersTable.userId })
    .from(squadMembersTable)
    .where(and(eq(squadMembersTable.squadId, m.squadId), ne(squadMembersTable.userId, opts.userId)));

  const ids = squadMateIds.map((x) => x.userId);
  if (ids.length === 0) return;

  const inPool = await db
    .select({ userId: poolParticipantsTable.userId })
    .from(poolParticipantsTable)
    .where(and(eq(poolParticipantsTable.poolId, opts.poolId), inArray(poolParticipantsTable.userId, ids)));

  if (inPool.length === 0) return;

  const [existing] = await db
    .select({ id: squadBonusesTable.id })
    .from(squadBonusesTable)
    .where(
      and(
        eq(squadBonusesTable.userId, opts.userId),
        eq(squadBonusesTable.poolId, opts.poolId),
        eq(squadBonusesTable.bonusType, "copool"),
      ),
    )
    .limit(1);
  if (existing) return;

  const pts = Math.max(1, Math.round(opts.entryFee * 0.05));
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, opts.userId)).limit(1);
  if (!u) return;

  await db
    .update(usersTable)
    .set({ referralPoints: (u.referralPoints ?? 0) + pts })
    .where(eq(usersTable.id, opts.userId));
  await grantReferralPointsWithExpiry(opts.userId, pts, "squad_copool", `Squad bonus — ${opts.poolTitle}`);
  await db.insert(squadBonusesTable).values({
    squadId: m.squadId,
    userId: opts.userId,
    triggeredByUserId: opts.userId,
    poolId: opts.poolId,
    bonusType: "copool",
    bonusValue: String(pts),
  });

  void notifyUser(
    opts.userId,
    "Squad bonus",
    `You and a squad mate are both in ${opts.poolTitle}. You earned ${pts} bonus points.`,
    "success",
  );

  /* Squad mates already in this pool get the same bonus once when you join */
  for (const row of inPool) {
    const [dupMate] = await db
      .select({ id: squadBonusesTable.id })
      .from(squadBonusesTable)
      .where(
        and(
          eq(squadBonusesTable.userId, row.userId),
          eq(squadBonusesTable.poolId, opts.poolId),
          eq(squadBonusesTable.bonusType, "copool"),
        ),
      )
      .limit(1);
    if (dupMate) continue;
    const [mu] = await db.select().from(usersTable).where(eq(usersTable.id, row.userId)).limit(1);
    if (!mu) continue;
    await db
      .update(usersTable)
      .set({ referralPoints: (mu.referralPoints ?? 0) + pts })
      .where(eq(usersTable.id, row.userId));
    await grantReferralPointsWithExpiry(row.userId, pts, "squad_copool", `Squad bonus — ${opts.poolTitle}`);
    await db.insert(squadBonusesTable).values({
      squadId: m.squadId,
      userId: row.userId,
      triggeredByUserId: opts.userId,
      poolId: opts.poolId,
      bonusType: "copool",
      bonusValue: String(pts),
    });
    void notifyUser(
      row.userId,
      "Squad bonus",
      `A squad mate joined ${opts.poolTitle}. You earned ${pts} bonus points.`,
      "success",
    );
  }
}

export async function squadLeaderboardThisMonth() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const allSquads = await db.select().from(squadsTable);
  const out: { squadId: number; name: string; code: string; winsThisMonth: number; memberCount: number }[] = [];

  for (const s of allSquads) {
    const members = await db
      .select({ userId: squadMembersTable.userId })
      .from(squadMembersTable)
      .where(eq(squadMembersTable.squadId, s.id));
    if (members.length === 0) continue;
    const userIds = members.map((x) => x.userId);
    const [{ w }] = await db
      .select({ w: sql<number>`count(*)::int` })
      .from(winnersTable)
      .where(and(inArray(winnersTable.userId, userIds), gte(winnersTable.awardedAt, start)));
    out.push({
      squadId: s.id,
      name: s.name,
      code: s.code,
      winsThisMonth: Number(w),
      memberCount: members.length,
    });
  }

  out.sort((a, b) => b.winsThisMonth - a.winsThisMonth);
  return out.slice(0, 20);
}
