import {
  cashoutBetsTable,
  cashoutBoostUsageTable,
  cashoutRoundsTable,
  db,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { appendDepositFromTicketPurchase, appendWithdrawalForPayout } from "./admin-wallet-service";
import { mirrorAvailableFromUser } from "./user-wallet-service";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ADV_LOCK_CASHOUT = 948_221_099;
const ROUND_GROWTH_K = 0.13;
const TARGET_MARGIN_BPS = 1200;
const ONBOARDING_ROUNDS = 3;
const ONBOARDING_MIN_MULTIPLIER = 1.1;
const ONBOARDING_SETTLE_MULTIPLIER = 1.06;

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function randomCrashMultiplier(): number {
  const r = Math.random();
  if (r < 0.55) return round4(1.1 + Math.random() * 0.8);
  if (r < 0.85) return round4(1.9 + Math.random() * 1.5);
  if (r < 0.97) return round4(3.4 + Math.random() * 2.6);
  return round4(6 + Math.random() * 4);
}

function effectiveMultiplier(raw: number, bet: typeof cashoutBetsTable.$inferSelect): number {
  let m = raw;
  if (bet.usedSlowMotion) m *= 1.08;
  if (bet.usedDoubleBoost && raw >= 1.4 && raw <= 1.8) m *= 2;
  return m;
}

async function lockCashout(tx: DbTx): Promise<void> {
  await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${ADV_LOCK_CASHOUT})`));
}

async function debitWithdrawable(tx: DbTx, userId: number, amount: number, note: string, txType: "cashout_bet_lock"): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  if (wd < amount - 0.0001) throw new Error("INSUFFICIENT_BALANCE");
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd - amount;
  const nextWallet = (bonus + nextWd).toFixed(2);
  await tx.update(usersTable).set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet }).where(eq(usersTable.id, userId));
  await tx.insert(transactionsTable).values({ userId, txType, amount: amount.toFixed(2), status: "completed", note });
  await mirrorAvailableFromUser(tx, userId);
}

async function creditWithdrawable(
  tx: DbTx,
  userId: number,
  amount: number,
  txType: "cashout_payout_credit" | "cashout_shield_refund",
  note: string,
): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd + amount;
  const nextWallet = (bonus + nextWd).toFixed(2);
  await tx.update(usersTable).set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet }).where(eq(usersTable.id, userId));
  await tx.insert(transactionsTable).values({ userId, txType, amount: amount.toFixed(2), status: "completed", note });
  await mirrorAvailableFromUser(tx, userId);
}

export function currentMultiplierForRound(round: typeof cashoutRoundsTable.$inferSelect, now = Date.now()): number {
  const start = new Date(round.startedAt).getTime();
  const crash = new Date(round.crashAt).getTime();
  if (now >= crash) return toNum(round.crashMultiplier);
  const tSec = Math.max(0, (now - start) / 1000);
  return round4(Math.max(1, Math.exp(ROUND_GROWTH_K * tSec)));
}

async function getOrCreateRunningRound(tx: DbTx): Promise<typeof cashoutRoundsTable.$inferSelect> {
  const now = new Date();
  const [running] = await tx
    .select()
    .from(cashoutRoundsTable)
    .where(and(eq(cashoutRoundsTable.status, "running"), sql`${cashoutRoundsTable.crashAt} > ${now}`))
    .orderBy(desc(cashoutRoundsTable.id))
    .limit(1);
  if (running) return running;

  const crashMultiplier = randomCrashMultiplier();
  const secsToCrash = Math.log(crashMultiplier) / ROUND_GROWTH_K;
  const crashAt = new Date(now.getTime() + Math.max(6000, Math.min(18000, Math.round(secsToCrash * 1000))));
  const maxCashoutMultiplier = Math.max(1.01, round4(crashMultiplier - 0.03));
  const [created] = await tx
    .insert(cashoutRoundsTable)
    .values({
      status: "running",
      startedAt: now,
      crashAt,
      crashMultiplier: String(crashMultiplier),
      maxCashoutMultiplier: String(maxCashoutMultiplier),
      targetMarginBps: TARGET_MARGIN_BPS,
    })
    .returning();
  return created;
}

async function settleCrashedRounds(tx: DbTx): Promise<void> {
  const now = new Date();
  const rounds = await tx
    .select()
    .from(cashoutRoundsTable)
    .where(and(eq(cashoutRoundsTable.status, "running"), lte(cashoutRoundsTable.crashAt, now)))
    .orderBy(cashoutRoundsTable.id);

  for (const round of rounds) {
    await tx.update(cashoutRoundsTable).set({ status: "crashed" }).where(eq(cashoutRoundsTable.id, round.id));
    const [agg] = await tx
      .select({
        totalStake: sql<string>`coalesce(sum(${cashoutBetsTable.stakeAmount}::numeric + ${cashoutBetsTable.boostFee}::numeric), 0)`,
        paidOut: sql<string>`coalesce(sum(case when ${cashoutBetsTable.status} in ('cashed_out', 'shield_refunded') then ${cashoutBetsTable.payoutAmount}::numeric else 0 end), 0)`,
      })
      .from(cashoutBetsTable)
      .where(eq(cashoutBetsTable.roundId, round.id));
    const maxPayoutPool = toNum(agg?.totalStake) * (1 - toNum(round.targetMarginBps) / 10000);
    let remaining = Math.max(0, maxPayoutPool - toNum(agg?.paidOut));

    const activeBets = await tx.select().from(cashoutBetsTable).where(and(eq(cashoutBetsTable.roundId, round.id), eq(cashoutBetsTable.status, "active")));
    for (const bet of activeBets) {
      const priorSettled = await userSettledBetsBefore(tx, bet.userId, new Date(bet.createdAt));
      if (priorSettled < ONBOARDING_ROUNDS && remaining > 0) {
        const onboardingPayout = Math.min(remaining, round2(toNum(bet.stakeAmount) * ONBOARDING_SETTLE_MULTIPLIER));
        if (onboardingPayout > 0.009) {
          await creditWithdrawable(tx, bet.userId, onboardingPayout, "cashout_payout_credit", `Cashout Arena onboarding payout — round #${round.id}`);
          await appendWithdrawalForPayout(tx, {
            amount: onboardingPayout,
            referenceId: bet.id,
            userId: bet.userId,
            description: `Cashout Arena onboarding payout — bet #${bet.id} round #${round.id}`,
          });
          await tx
            .update(cashoutBetsTable)
            .set({
              status: "cashed_out",
              payoutAmount: String(round2(onboardingPayout)),
              cashoutMultiplier: String(round4(onboardingPayout / Math.max(0.0001, toNum(bet.stakeAmount)))),
              settledAt: new Date(),
            })
            .where(eq(cashoutBetsTable.id, bet.id));
          remaining -= onboardingPayout;
          continue;
        }
      }
      if (bet.usedShield && remaining > 0) {
        const refund = Math.min(remaining, toNum(bet.stakeAmount));
        if (refund > 0.009) {
          await creditWithdrawable(tx, bet.userId, refund, "cashout_shield_refund", `Cashout Arena round #${round.id} shield refund`);
          await appendWithdrawalForPayout(tx, {
            amount: refund,
            referenceId: bet.id,
            userId: bet.userId,
            description: `Cashout Arena shield refund — bet #${bet.id} round #${round.id}`,
          });
          await tx
            .update(cashoutBetsTable)
            .set({
              status: "shield_refunded",
              payoutAmount: String(round2(refund)),
              cashoutMultiplier: "1.0000",
              settledAt: new Date(),
            })
            .where(eq(cashoutBetsTable.id, bet.id));
          await tx
            .update(cashoutBoostUsageTable)
            .set({ consumed: true })
            .where(and(eq(cashoutBoostUsageTable.roundId, round.id), eq(cashoutBoostUsageTable.userId, bet.userId), eq(cashoutBoostUsageTable.boostType, "shield")));
          remaining -= refund;
          continue;
        }
      }
      await tx.update(cashoutBetsTable).set({ status: "lost", settledAt: new Date() }).where(eq(cashoutBetsTable.id, bet.id));
    }

    await tx.update(cashoutRoundsTable).set({ status: "settled", settledAt: new Date() }).where(eq(cashoutRoundsTable.id, round.id));
  }
}

async function ensureState(tx: DbTx): Promise<typeof cashoutRoundsTable.$inferSelect> {
  await settleCrashedRounds(tx);
  return getOrCreateRunningRound(tx);
}

async function userSettledBetsBefore(tx: DbTx, userId: number, createdAt: Date): Promise<number> {
  const [row] = await tx
    .select({ c: sql<string>`count(*)` })
    .from(cashoutBetsTable)
    .where(
      and(
        eq(cashoutBetsTable.userId, userId),
        lt(cashoutBetsTable.createdAt, createdAt),
        inArray(cashoutBetsTable.status, ["cashed_out", "lost", "shield_refunded"]),
      ),
    );
  return Number(row?.c ?? 0);
}

async function cashoutBetInTx(
  tx: DbTx,
  userId: number,
  betId: number,
  now = Date.now(),
): Promise<{ payout: number; multiplier: number }> {
  const [bet] = await tx.select().from(cashoutBetsTable).where(eq(cashoutBetsTable.id, betId)).limit(1);
  if (!bet) throw new Error("BET_NOT_FOUND");
  if (bet.userId !== userId) throw new Error("FORBIDDEN");
  if (bet.status === "cashed_out") {
    const payout = toNum(bet.payoutAmount);
    const multiplier = bet.cashoutMultiplier ? toNum(bet.cashoutMultiplier) : round4(payout / Math.max(0.0001, toNum(bet.stakeAmount)));
    return { payout: round2(payout), multiplier: round4(multiplier) };
  }
  if (bet.status === "shield_refunded") throw new Error("BET_ALREADY_REFUNDED");
  if (bet.status === "lost") throw new Error("ROUND_CRASHED");
  if (bet.status !== "active") throw new Error("INVALID_STATE");

  const [round] = await tx.select().from(cashoutRoundsTable).where(eq(cashoutRoundsTable.id, bet.roundId)).limit(1);
  if (!round) throw new Error("ROUND_NOT_FOUND");
  if (new Date(round.crashAt).getTime() <= now || round.status !== "running") throw new Error("ROUND_CRASHED");

  const rawMult = currentMultiplierForRound(round, now);
  const priorSettled = await userSettledBetsBefore(tx, userId, new Date(bet.createdAt));
  const boosted = Math.min(
    toNum(round.maxCashoutMultiplier),
    Math.max(priorSettled < ONBOARDING_ROUNDS ? ONBOARDING_MIN_MULTIPLIER : 1, effectiveMultiplier(rawMult, bet)),
  );
  const requestedPayout = round2(toNum(bet.stakeAmount) * boosted);

  const [agg] = await tx
    .select({
      totalStake: sql<string>`coalesce(sum(${cashoutBetsTable.stakeAmount}::numeric + ${cashoutBetsTable.boostFee}::numeric), 0)`,
      paidOut: sql<string>`coalesce(sum(case when ${cashoutBetsTable.status} in ('cashed_out', 'shield_refunded') then ${cashoutBetsTable.payoutAmount}::numeric else 0 end), 0)`,
    })
    .from(cashoutBetsTable)
    .where(eq(cashoutBetsTable.roundId, bet.roundId));

  const maxPayoutPool = toNum(agg?.totalStake) * (1 - toNum(round.targetMarginBps) / 10000);
  const remainingPool = Math.max(0, maxPayoutPool - toNum(agg?.paidOut));
  const payout = round2(Math.min(requestedPayout, remainingPool));
  if (payout <= 0.009) throw new Error("CASHOUT_BLOCKED");

  await creditWithdrawable(tx, userId, payout, "cashout_payout_credit", `Cashout Arena round #${round.id} payout`);
  await appendWithdrawalForPayout(tx, {
    amount: payout,
    referenceId: bet.id,
    userId,
    description: `Cashout Arena payout — bet #${bet.id} round #${round.id}`,
  });
  await tx
    .update(cashoutBetsTable)
    .set({
      status: "cashed_out",
      payoutAmount: payout.toFixed(2),
      cashoutMultiplier: String(round4(payout / toNum(bet.stakeAmount))),
      settledAt: new Date(),
    })
    .where(eq(cashoutBetsTable.id, bet.id));

  return { payout, multiplier: round4(payout / toNum(bet.stakeAmount)) };
}

async function canUseShieldToday(tx: DbTx, userId: number): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await tx
    .select({ id: cashoutBoostUsageTable.id })
    .from(cashoutBoostUsageTable)
    .where(and(eq(cashoutBoostUsageTable.userId, userId), eq(cashoutBoostUsageTable.boostType, "shield"), sql`${cashoutBoostUsageTable.createdAt} > ${since}`))
    .limit(1);
  return !row;
}

export async function getCashoutArenaState(userId: number) {
  return db.transaction(async (tx) => {
    await lockCashout(tx);
    const round = await ensureState(tx);
    let nowMult = currentMultiplierForRound(round);

    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) throw new Error("USER_NOT_FOUND");
    let [myBet] = await tx
      .select()
      .from(cashoutBetsTable)
      .where(and(eq(cashoutBetsTable.roundId, round.id), eq(cashoutBetsTable.userId, userId)))
      .limit(1);

    if (myBet && myBet.status === "active" && myBet.autoCashoutAt != null && nowMult >= toNum(myBet.autoCashoutAt)) {
      await cashoutBetInTx(tx, userId, myBet.id);
      [myBet] = await tx
        .select()
        .from(cashoutBetsTable)
        .where(and(eq(cashoutBetsTable.roundId, round.id), eq(cashoutBetsTable.userId, userId)))
        .limit(1);
      nowMult = currentMultiplierForRound(round);
    }

    const [hist] = await tx
      .select({
        rounds: sql<any>`coalesce(json_agg(json_build_object('id', r.id, 'crashMultiplier', r.crash_multiplier, 'startedAt', r.started_at) order by r.id desc), '[]'::json)`,
      })
      .from(sql`(select id, crash_multiplier, started_at from cashout_rounds where status = 'settled' order by id desc limit 20) r`);
    let leaderboardRows: Array<{ userId: number; name: string; totalWin: string }> = [];
    try {
      const leaderboard = await tx.execute(sql`
        select
          b.user_id as "userId",
          u.name as "name",
          coalesce(sum(coalesce(b.payout_amount, 0)::numeric), 0)::text as "totalWin"
        from cashout_bets b
        inner join users u on u.id = b.user_id
        where b.status in ('cashed_out', 'shield_refunded')
          and b.created_at > now() - interval '1 day'
        group by b.user_id, u.name
        order by coalesce(sum(coalesce(b.payout_amount, 0)::numeric), 0) desc
        limit 8
      `);
      leaderboardRows = leaderboard.rows as Array<{ userId: number; name: string; totalWin: string }>;
    } catch {
      leaderboardRows = [];
    }

    const [locked] = await tx
      .select({ amt: sql<string>`coalesce(sum(${cashoutBetsTable.stakeAmount}::numeric + ${cashoutBetsTable.boostFee}::numeric), 0)` })
      .from(cashoutBetsTable)
      .where(and(eq(cashoutBetsTable.userId, userId), eq(cashoutBetsTable.status, "active")));

    const shieldAvailable = await canUseShieldToday(tx, userId);
    return {
      round: {
        id: String(round.id),
        startedAt: new Date(round.startedAt).getTime(),
        crashAt: new Date(round.crashAt).getTime(),
        multiplier: nowMult,
        maxMultiplier: toNum(round.maxCashoutMultiplier),
        zone: nowMult < 1.8 ? "safe" : nowMult < 3 ? "medium" : "high",
      },
      wallet: {
        withdrawableBalance: toNum(user.withdrawableBalance),
        nonWithdrawableBalance: toNum(user.bonusBalance),
        lockedBalance: toNum(locked?.amt),
      },
      myBet: myBet
        ? {
            id: String(myBet.id),
            status: myBet.status,
            stakeAmount: toNum(myBet.stakeAmount),
            boostFee: toNum(myBet.boostFee),
            autoCashoutAt: myBet.autoCashoutAt ? toNum(myBet.autoCashoutAt) : null,
            payoutAmount: myBet.payoutAmount ? toNum(myBet.payoutAmount) : null,
          }
        : null,
      boosts: {
        shieldAvailable,
        slowMotionInfo: "Temporarily improves effective multiplier by +8%",
        doubleBoostInfo: "Doubles multiplier only in 1.4x-1.8x window",
      },
      history: (hist?.rounds ?? []) as Array<{ id: number; crashMultiplier: string; startedAt: string }>,
      leaderboard: leaderboardRows.map((r) => ({
        userId: r.userId,
        name: `${String(r.name).slice(0, 4)}***`,
        totalWin: toNum(r.totalWin),
      })),
    };
  });
}

export async function placeBet(
  userId: number,
  input: { stakeAmount: number; autoCashoutAt?: number | null; shield?: boolean; slowMotion?: boolean; doubleBoost?: boolean },
): Promise<{ roundId: string; betId: string; onboardingMode: boolean; onboardingRoundsLeft: number }> {
  const stakeAmount = round2(input.stakeAmount);
  if (!Number.isFinite(stakeAmount) || stakeAmount < 1 || stakeAmount > 5) throw new Error("INVALID_STAKE");
  if (input.autoCashoutAt != null && (!Number.isFinite(input.autoCashoutAt) || input.autoCashoutAt < 1.05 || input.autoCashoutAt > 10)) {
    throw new Error("INVALID_AUTO_CASHOUT");
  }

  return db.transaction(async (tx) => {
    await lockCashout(tx);
    const round = await ensureState(tx);
    const [existing] = await tx
      .select({ id: cashoutBetsTable.id })
      .from(cashoutBetsTable)
      .where(and(eq(cashoutBetsTable.roundId, round.id), eq(cashoutBetsTable.userId, userId)))
      .limit(1);
    if (existing) throw new Error("BET_ALREADY_PLACED");

    const shield = input.shield === true;
    const slowMotion = input.slowMotion === true;
    const doubleBoost = input.doubleBoost === true;
    if (slowMotion && doubleBoost) throw new Error("BOOST_CONFLICT");
    if (shield && !(await canUseShieldToday(tx, userId))) throw new Error("SHIELD_UNAVAILABLE");

    const boostFee = round2((shield ? stakeAmount * 0.2 : 0) + (slowMotion ? stakeAmount * 0.08 : 0) + (doubleBoost ? stakeAmount * 0.15 : 0));
    const totalDebit = round2(stakeAmount + boostFee);
    await debitWithdrawable(tx, userId, totalDebit, `Cashout Arena round #${round.id} bet lock`, "cashout_bet_lock");
    await appendDepositFromTicketPurchase(tx, {
      amount: totalDebit,
      referenceId: round.id,
      userId,
      description: `Cashout Arena bet lock + boost fee — round #${round.id}`,
    });

    const [bet] = await tx
      .insert(cashoutBetsTable)
      .values({
        roundId: round.id,
        userId,
        stakeAmount: stakeAmount.toFixed(2),
        boostFee: boostFee.toFixed(2),
        autoCashoutAt: input.autoCashoutAt != null ? String(round4(input.autoCashoutAt)) : null,
        usedShield: shield,
        usedSlowMotion: slowMotion,
        usedDoubleBoost: doubleBoost,
      })
      .returning();

    if (shield) {
      await tx.insert(cashoutBoostUsageTable).values({ userId, roundId: round.id, boostType: "shield", consumed: false });
    }
    const [countRow] = await tx.select({ c: sql<string>`count(*)` }).from(cashoutBetsTable).where(eq(cashoutBetsTable.userId, userId));
    const totalBets = Number(countRow?.c ?? 0);
    return {
      roundId: String(round.id),
      betId: String(bet.id),
      onboardingMode: totalBets <= ONBOARDING_ROUNDS,
      onboardingRoundsLeft: Math.max(0, ONBOARDING_ROUNDS - totalBets),
    };
  });
}

export async function cashoutBet(userId: number, betId: number): Promise<{ payout: number; multiplier: number }> {
  return db.transaction(async (tx) => {
    await lockCashout(tx);
    await settleCrashedRounds(tx);
    return cashoutBetInTx(tx, userId, betId);
  });
}
