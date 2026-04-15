import { db, stakingPlansTable, userStakesTable, stakingTransactionsTable, usersTable, transactionsTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { mirrorAvailableFromUser } from "./user-wallet-service";
import { getStakingSafetyConfig } from "./staking-safety";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function listVisiblePlans() {
  const rows = await db
    .select()
    .from(stakingPlansTable)
    .where(and(eq(stakingPlansTable.isVisible, true), eq(stakingPlansTable.isActive, true)))
    .orderBy(stakingPlansTable.displayOrder, stakingPlansTable.id);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    badgeText: p.badgeText,
    badgeColor: p.badgeColor,
    lockDays: p.lockDays,
    minStake: toNum(p.minStake),
    maxStake: toNum(p.maxStake),
    estimatedApy: toNum(p.estimatedApy),
    minApy: toNum(p.minApy),
    maxApy: toNum(p.maxApy),
    currentApy: toNum(p.currentApy),
    totalPoolCapacity: p.totalPoolCapacity == null ? null : toNum(p.totalPoolCapacity),
    currentPoolAmount: toNum(p.currentPoolAmount),
    maxStakers: p.maxStakers ?? null,
    currentStakers: p.currentStakers ?? 0,
    isActive: p.isActive,
    isVisible: p.isVisible,
    displayOrder: p.displayOrder ?? 0,
  }));
}

export async function createStakeV2(args: { userId: number; planId: number; amount: number; createdBy?: number; isBotStake?: boolean }) {
  const now = new Date();
  const amt = round2(args.amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("INVALID_AMOUNT");

  const safety = await getStakingSafetyConfig();
  if (!safety.enabled) throw new Error("STAKING_DISABLED");
  if (safety.emergencyStop) throw new Error("EMERGENCY_STOP");

  return await db.transaction(async (tx) => {
    const [plan] = await tx.select().from(stakingPlansTable).where(eq(stakingPlansTable.id, args.planId)).limit(1);
    if (!plan || !plan.isActive) throw new Error("PLAN_NOT_FOUND");

    const min = toNum(plan.minStake);
    const max = toNum(plan.maxStake);
    if (amt < min - 0.0001) throw new Error("AMOUNT_TOO_LOW");
    if (amt > max + 0.0001) throw new Error("AMOUNT_TOO_HIGH");

    const cap = plan.totalPoolCapacity == null ? null : toNum(plan.totalPoolCapacity);
    const curPool = toNum(plan.currentPoolAmount);
    if (cap != null && curPool + amt > cap + 0.0001) throw new Error("PLAN_CAPACITY_FULL");
    const maxStakers = plan.maxStakers ?? null;
    const curStakers = plan.currentStakers ?? 0;
    if (maxStakers != null && curStakers + 1 > maxStakers) throw new Error("PLAN_STAKERS_FULL");

    const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, args.userId)).limit(1);
    if (!u) throw new Error("USER_NOT_FOUND");

    const isBot = Boolean((u as any).isBot) || args.isBotStake === true;
    if (!isBot) {
      if (safety.stakeCreateThrottleSec > 0) {
        const since = new Date(Date.now() - safety.stakeCreateThrottleSec * 1000);
        const recent = await tx.execute(sql`
          select 1
          from staking_transactions stx
          inner join user_stakes s on s.id = stx.stake_id
          where stx.user_id = ${args.userId}
            and s.is_bot_stake = false
            and stx.type = 'stake_lock'
            and stx.created_at >= ${since}
          limit 1
        `);
        if ((recent.rows as any[]).length > 0) throw new Error("THROTTLED");
      }
      const wd = toNum(u.withdrawableBalance);
      if (wd < amt - 0.0001) throw new Error("INSUFFICIENT_BALANCE");
      const bonus = toNum(u.bonusBalance);
      const nextWd = wd - amt;
      const nextWallet = round2(bonus + nextWd);
      await tx
        .update(usersTable)
        .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet.toFixed(2) })
        .where(eq(usersTable.id, args.userId));
    }

    const lockDays = plan.lockDays;
    const endsAt = new Date(now.getTime() + lockDays * 24 * 60 * 60 * 1000);
    const lockedApy = toNum(plan.currentApy);

    const [stake] = await tx
      .insert(userStakesTable)
      .values({
        userId: args.userId,
        planId: plan.id,
        isBotStake: isBot,
        stakedAmount: amt.toFixed(2),
        startedAt: now,
        endsAt,
        lockedApy: lockedApy.toFixed(2),
        earnedAmount: "0",
        status: "active",
        createdBy: args.createdBy ?? args.userId,
      })
      .returning();

    await tx
      .update(stakingPlansTable)
      .set({
        currentPoolAmount: sql`${stakingPlansTable.currentPoolAmount}::numeric + ${amt.toFixed(2)}::numeric`,
        currentStakers: sql`${stakingPlansTable.currentStakers} + 1`,
        updatedAt: now,
      })
      .where(eq(stakingPlansTable.id, plan.id));

    await tx.insert(stakingTransactionsTable).values({
      stakeId: stake.id,
      userId: args.userId,
      type: "stake_lock",
      amount: (-amt).toFixed(2),
      description: `Stake locked — ${plan.name} (${lockDays}d) @ ${lockedApy.toFixed(2)}% APY`,
    });

    if (!isBot) {
      await tx.insert(transactionsTable).values({
        userId: args.userId,
        txType: "stake_lock",
        amount: amt.toFixed(2),
        status: "completed",
        note: `Stake locked #${stake.id} — ${plan.name} (${lockDays} days)`,
      });
      await mirrorAvailableFromUser(tx, args.userId);
    }

    const projectedEarning = round2((amt * (lockedApy / 100) / 365) * lockDays);
    return {
      stakeId: stake.id,
      plan: { id: plan.id, name: plan.name, lockDays, lockedApy },
      amount: amt,
      starts: now.toISOString(),
      ends: endsAt.toISOString(),
      projectedEarning,
      projectedTotal: round2(amt + projectedEarning),
      isBot,
    };
  });
}

export async function listMyStakesV2(userId: number) {
  // Light maturity sync: mark ended stakes as matured on read.
  // Earnings are credited by cron; this only updates status to unlock claiming.
  const now = new Date();
  await db
    .update(userStakesTable)
    .set({ status: "matured", updatedAt: now })
    .where(and(eq(userStakesTable.userId, userId), eq(userStakesTable.status, "active"), sql`${userStakesTable.endsAt} <= now()`));

  const rows = await db
    .select()
    .from(userStakesTable)
    .where(eq(userStakesTable.userId, userId))
    .orderBy(desc(userStakesTable.createdAt));
  return rows.map((s) => ({
    id: s.id,
    planId: s.planId,
    stakedAmount: toNum(s.stakedAmount),
    lockedApy: toNum(s.lockedApy),
    earnedAmount: toNum(s.earnedAmount),
    startedAt: s.startedAt?.toISOString?.() ?? String(s.startedAt),
    endsAt: s.endsAt?.toISOString?.() ?? String(s.endsAt),
    status: s.status as string,
    claimedAt: s.claimedAt?.toISOString?.() ?? null,
    claimedAmount: s.claimedAmount == null ? null : toNum(s.claimedAmount),
    isBotStake: Boolean(s.isBotStake),
  }));
}

export async function claimStakeV2(args: { userId: number; stakeId: number }) {
  const now = new Date();
  const safety = await getStakingSafetyConfig();
  if (!safety.enabled) throw new Error("STAKING_DISABLED");
  if (safety.emergencyStop) throw new Error("EMERGENCY_STOP");
  return await db.transaction(async (tx) => {
    const [stake] = await tx
      .select()
      .from(userStakesTable)
      .where(and(eq(userStakesTable.id, args.stakeId), eq(userStakesTable.userId, args.userId)))
      .limit(1);
    if (!stake) throw new Error("STAKE_NOT_FOUND");

    const status = String(stake.status);
    if (status !== "matured") throw new Error("STAKE_NOT_MATURED");

    const principal = toNum(stake.stakedAmount);
    const earned = toNum(stake.earnedAmount);
    const total = round2(principal + earned);

    const isBot = Boolean(stake.isBotStake);
    if (!isBot) {
      if (safety.maxDailyPayoutUsdt > 0) {
        const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
        const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
        const sumRows = await tx.execute(sql`
          select coalesce(sum(
            case
              when stx.type = 'maturity_claim' then stx.amount::numeric
              when stx.type = 'earning_withdraw' then -stx.amount::numeric
              else 0
            end
          ),0)::text as t
          from staking_transactions stx
          inner join user_stakes s on s.id = stx.stake_id
          where s.is_bot_stake = false
            and stx.created_at >= ${dayStart}
            and stx.created_at <= ${dayEnd}
            and stx.type in ('maturity_claim','earning_withdraw')
        `);
        const used = Number((sumRows.rows as any[])[0]?.t ?? 0);
        if (used + total > safety.maxDailyPayoutUsdt + 0.0001) throw new Error("DAILY_PAYOUT_LIMIT");
      }
      const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, args.userId)).limit(1);
      if (!u) throw new Error("USER_NOT_FOUND");
      const wd = toNum(u.withdrawableBalance);
      const bonus = toNum(u.bonusBalance);
      const nextWd = wd + total;
      const nextWallet = round2(bonus + nextWd);
      await tx
        .update(usersTable)
        .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet.toFixed(2) })
        .where(eq(usersTable.id, args.userId));
    }

    await tx
      .update(userStakesTable)
      .set({
        status: "claimed",
        claimedAt: now,
        claimedAmount: total.toFixed(2),
        updatedAt: now,
      })
      .where(eq(userStakesTable.id, stake.id));

    await tx.insert(stakingTransactionsTable).values({
      stakeId: stake.id,
      userId: args.userId,
      type: "maturity_claim",
      amount: total.toFixed(2),
      description: `Claimed at maturity — principal ${principal.toFixed(2)} + earned ${earned.toFixed(2)} USDT`,
    });

    const [plan] = await tx.select().from(stakingPlansTable).where(eq(stakingPlansTable.id, stake.planId)).limit(1);
    if (plan) {
      await tx
        .update(stakingPlansTable)
        .set({
          currentPoolAmount: sql`${stakingPlansTable.currentPoolAmount}::numeric - ${principal.toFixed(2)}::numeric`,
          currentStakers: sql`GREATEST(0, ${stakingPlansTable.currentStakers} - 1)`,
          updatedAt: now,
        })
        .where(eq(stakingPlansTable.id, plan.id));
    }

    if (!isBot) {
      await tx.insert(transactionsTable).values({
        userId: args.userId,
        txType: "stake_release",
        amount: total.toFixed(2),
        status: "completed",
        note: `Stake claimed #${stake.id} — ${total.toFixed(2)} USDT`,
      });
      await mirrorAvailableFromUser(tx, args.userId);
    }

    return { ok: true as const, claimedAmount: total, principal, earned, isBotStake: isBot };
  });
}

export async function withdrawEarningsV2(args: { userId: number; stakeId: number }) {
  const now = new Date();
  const safety = await getStakingSafetyConfig();
  if (!safety.enabled) throw new Error("STAKING_DISABLED");
  if (safety.emergencyStop) throw new Error("EMERGENCY_STOP");
  return await db.transaction(async (tx) => {
    const [stake] = await tx
      .select()
      .from(userStakesTable)
      .where(and(eq(userStakesTable.id, args.stakeId), eq(userStakesTable.userId, args.userId)))
      .limit(1);
    if (!stake) throw new Error("STAKE_NOT_FOUND");
    if (String(stake.status) !== "active") throw new Error("STAKE_NOT_ACTIVE");

    const isBot = Boolean(stake.isBotStake);
    if (isBot) throw new Error("BOT_STAKE");

    const earned = round2(toNum(stake.earnedAmount));
    if (earned <= 0.009) throw new Error("NOTHING_TO_WITHDRAW");

    if (safety.withdrawThrottleSec > 0) {
      const since = new Date(Date.now() - safety.withdrawThrottleSec * 1000);
      const recent = await tx.execute(sql`
        select 1
        from staking_transactions stx
        inner join user_stakes s on s.id = stx.stake_id
        where stx.user_id = ${args.userId}
          and s.is_bot_stake = false
          and stx.type = 'earning_withdraw'
          and stx.created_at >= ${since}
        limit 1
      `);
      if ((recent.rows as any[]).length > 0) throw new Error("THROTTLED");
    }

    if (safety.maxDailyPayoutUsdt > 0) {
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      const sumRows = await tx.execute(sql`
        select coalesce(sum(
          case
            when stx.type = 'maturity_claim' then stx.amount::numeric
            when stx.type = 'early_exit' then stx.amount::numeric
            when stx.type = 'earning_withdraw' then -stx.amount::numeric
            else 0
          end
        ),0)::text as t
        from staking_transactions stx
        inner join user_stakes s on s.id = stx.stake_id
        where s.is_bot_stake = false
          and stx.created_at >= ${dayStart}
          and stx.created_at <= ${dayEnd}
          and stx.type in ('maturity_claim','early_exit','earning_withdraw')
      `);
      const used = Number((sumRows.rows as any[])[0]?.t ?? 0);
      if (used + earned > safety.maxDailyPayoutUsdt + 0.0001) throw new Error("DAILY_PAYOUT_LIMIT");
    }

    const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, args.userId)).limit(1);
    if (!u) throw new Error("USER_NOT_FOUND");

    const wd = toNum(u.withdrawableBalance);
    const bonus = toNum(u.bonusBalance);
    const nextWd = wd + earned;
    const nextWallet = round2(bonus + nextWd);

    await tx
      .update(usersTable)
      .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet.toFixed(2) })
      .where(eq(usersTable.id, args.userId));

    await tx
      .update(userStakesTable)
      .set({ earnedAmount: "0", updatedAt: now })
      .where(eq(userStakesTable.id, stake.id));

    await tx.insert(stakingTransactionsTable).values({
      stakeId: stake.id,
      userId: args.userId,
      type: "earning_withdraw",
      amount: (-earned).toFixed(2),
      description: `Earnings withdrawn to wallet`,
    });

    await tx.insert(transactionsTable).values({
      userId: args.userId,
      txType: "stake_release",
      amount: earned.toFixed(2),
      status: "completed",
      note: `Staking earnings withdrawal — stake #${stake.id}`,
    });

    await mirrorAvailableFromUser(tx, args.userId);
    return { ok: true as const, withdrawn: earned, balanceAfter: nextWd };
  });
}

export async function earlyExitStakeV2(args: { userId: number; stakeId: number }) {
  const now = new Date();
  const safety = await getStakingSafetyConfig();
  if (!safety.enabled) throw new Error("STAKING_DISABLED");
  if (safety.emergencyStop) throw new Error("EMERGENCY_STOP");

  return await db.transaction(async (tx) => {
    const [stake] = await tx
      .select()
      .from(userStakesTable)
      .where(and(eq(userStakesTable.id, args.stakeId), eq(userStakesTable.userId, args.userId)))
      .limit(1);
    if (!stake) throw new Error("STAKE_NOT_FOUND");
    if (String(stake.status) !== "active") throw new Error("STAKE_NOT_ACTIVE");

    const isBot = Boolean(stake.isBotStake);
    if (isBot) throw new Error("BOT_STAKE");

    const principal = round2(toNum(stake.stakedAmount));
    const earned = round2(toNum(stake.earnedAmount));

    // Keep it simple for users: you can unstake anytime, but earnings may be reduced.
    const penaltyPctRaw = toNum((stake as any).earlyExitPenaltyPercent);
    const penaltyPct = Number.isFinite(penaltyPctRaw) && penaltyPctRaw >= 0 ? Math.min(90, penaltyPctRaw) : 50;
    const penalty = round2((earned * penaltyPct) / 100);
    const paidEarnings = round2(Math.max(0, earned - penalty));
    const totalPaid = round2(principal + paidEarnings);

    if (safety.withdrawThrottleSec > 0) {
      const since = new Date(Date.now() - safety.withdrawThrottleSec * 1000);
      const recent = await tx.execute(sql`
        select 1
        from staking_transactions stx
        inner join user_stakes s on s.id = stx.stake_id
        where stx.user_id = ${args.userId}
          and s.is_bot_stake = false
          and stx.type in ('earning_withdraw','early_exit','maturity_claim')
          and stx.created_at >= ${since}
        limit 1
      `);
      if ((recent.rows as any[]).length > 0) throw new Error("THROTTLED");
    }

    if (safety.maxDailyPayoutUsdt > 0) {
      const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
      const sumRows = await tx.execute(sql`
        select coalesce(sum(
          case
            when stx.type = 'maturity_claim' then stx.amount::numeric
            when stx.type = 'early_exit' then stx.amount::numeric
            when stx.type = 'earning_withdraw' then -stx.amount::numeric
            else 0
          end
        ),0)::text as t
        from staking_transactions stx
        inner join user_stakes s on s.id = stx.stake_id
        where s.is_bot_stake = false
          and stx.created_at >= ${dayStart}
          and stx.created_at <= ${dayEnd}
          and stx.type in ('maturity_claim','early_exit','earning_withdraw')
      `);
      const used = Number((sumRows.rows as any[])[0]?.t ?? 0);
      if (used + totalPaid > safety.maxDailyPayoutUsdt + 0.0001) throw new Error("DAILY_PAYOUT_LIMIT");
    }

    const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, args.userId)).limit(1);
    if (!u) throw new Error("USER_NOT_FOUND");

    const wd = toNum(u.withdrawableBalance);
    const bonus = toNum(u.bonusBalance);
    const nextWd = wd + totalPaid;
    const nextWallet = round2(bonus + nextWd);

    await tx
      .update(usersTable)
      .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: nextWallet.toFixed(2) })
      .where(eq(usersTable.id, args.userId));

    await tx
      .update(userStakesTable)
      .set({
        status: "early_exit",
        earlyExitAt: now as any,
        earlyExitPenaltyPercent: penaltyPct.toFixed(2) as any,
        claimedAt: now,
        claimedAmount: totalPaid.toFixed(2),
        updatedAt: now,
      } as any)
      .where(eq(userStakesTable.id, stake.id));

    await tx.insert(stakingTransactionsTable).values({
      stakeId: stake.id,
      userId: args.userId,
      type: "early_exit",
      amount: totalPaid.toFixed(2),
      description: `Unstaked early — principal ${principal.toFixed(2)} + earnings ${paidEarnings.toFixed(2)} (penalty ${penalty.toFixed(2)}) USDT`,
    });

    const [plan] = await tx.select().from(stakingPlansTable).where(eq(stakingPlansTable.id, stake.planId)).limit(1);
    if (plan) {
      await tx
        .update(stakingPlansTable)
        .set({
          currentPoolAmount: sql`${stakingPlansTable.currentPoolAmount}::numeric - ${principal.toFixed(2)}::numeric`,
          currentStakers: sql`GREATEST(0, ${stakingPlansTable.currentStakers} - 1)`,
          updatedAt: now,
        })
        .where(eq(stakingPlansTable.id, plan.id));
    }

    await tx.insert(transactionsTable).values({
      userId: args.userId,
      txType: "stake_release",
      amount: totalPaid.toFixed(2),
      status: "completed",
      note: `Unstaked early — stake #${stake.id}`,
    });

    await mirrorAvailableFromUser(tx, args.userId);
    return { ok: true as const, totalPaid, principal, earned, penaltyPct, penalty, paidEarnings };
  });
}

