import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, scratchCardsTable, scratchRoundsTable, transactionsTable, usersTable } from "@workspace/db";
import { appendDepositFromTicketPurchase, appendWithdrawalForPayout } from "./admin-wallet-service";
import { mirrorAvailableFromUser } from "./user-wallet-service";
import { fairFloatFromSeed, hashServerSeed, makeClientSeed, makeServerSeed, protectServerSeed, revealServerSeed } from "../lib/provably-fair";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const ADV_LOCK_SCRATCH = 948_221_144;
const ROUND_MS = 60_000;
const CARD_MS = 15_000;
const TARGET_MARGIN_BPS = 1200;
const ONBOARDING_ROUNDS = 3;
const RARE_HIT_CHANCE = 0.28;

const SYMBOLS = ["gem", "crown", "rocket", "diamond", "cherry", "star", "coin"] as const;
const RARE_SYMBOL = "phoenix";

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
async function nextRoundRandom(tx: DbTx, round: typeof scratchRoundsTable.$inferSelect): Promise<number> {
  const serverSeed = revealServerSeed(String(round.serverSeedReveal ?? ""));
  const clientSeed = String(round.clientSeed ?? "");
  if (!serverSeed || !clientSeed) return 0.5;
  const nonce = Number(round.nonce ?? 0);
  const value = fairFloatFromSeed({ serverSeed, clientSeed, nonce });
  await tx.update(scratchRoundsTable).set({ nonce: nonce + 1 }).where(eq(scratchRoundsTable.id, round.id));
  (round as typeof round & { nonce: number }).nonce = nonce + 1;
  return value;
}

async function pick<T>(tx: DbTx, round: typeof scratchRoundsTable.$inferSelect, arr: readonly T[]): Promise<T> {
  return arr[Math.floor((await nextRoundRandom(tx, round)) * arr.length)] as T;
}

async function lockScratch(tx: DbTx): Promise<void> {
  await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${ADV_LOCK_SCRATCH})`));
}

async function assertScratchEnabledForUser(tx: DbTx, userId: number): Promise<void> {
  const [u] = await tx
    .select({ id: usersTable.id, isScratchDisabled: usersTable.isScratchDisabled })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  if (u.isScratchDisabled) throw new Error("SCRATCH_DISABLED_FOR_USER");
}

async function debitWithdrawable(tx: DbTx, userId: number, amount: number): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  if (wd < amount - 0.0001) throw new Error("INSUFFICIENT_BALANCE");
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd - amount;
  await tx
    .update(usersTable)
    .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: (bonus + nextWd).toFixed(2) })
    .where(eq(usersTable.id, userId));
  await tx.insert(transactionsTable).values({
    userId,
    txType: "scratch_bet_lock",
    amount: amount.toFixed(2),
    status: "completed",
    note: "Scratch Card stake lock",
  });
  await mirrorAvailableFromUser(tx, userId);
}

async function creditWithdrawable(tx: DbTx, userId: number, amount: number, note: string): Promise<void> {
  const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!u) throw new Error("USER_NOT_FOUND");
  const wd = toNum(u.withdrawableBalance);
  const bonus = toNum(u.bonusBalance);
  const nextWd = wd + amount;
  await tx
    .update(usersTable)
    .set({ withdrawableBalance: nextWd.toFixed(2), walletBalance: (bonus + nextWd).toFixed(2) })
    .where(eq(usersTable.id, userId));
  await tx.insert(transactionsTable).values({
    userId,
    txType: "scratch_payout_credit",
    amount: amount.toFixed(2),
    status: "completed",
    note,
  });
  await mirrorAvailableFromUser(tx, userId);
}

async function getOrCreateRound(tx: DbTx) {
  const now = new Date();
  const [running] = await tx
    .select()
    .from(scratchRoundsTable)
    .where(and(eq(scratchRoundsTable.status, "running"), sql`${scratchRoundsTable.endsAt} > ${now}`))
    .orderBy(desc(scratchRoundsTable.id))
    .limit(1);
  if (running) return running;
  const serverSeed = makeServerSeed();
  const clientSeed = makeClientSeed();
  const [created] = await tx
    .insert(scratchRoundsTable)
    .values({
      status: "running",
      serverSeedHash: hashServerSeed(serverSeed),
      serverSeedReveal: protectServerSeed(serverSeed),
      clientSeed,
      nonce: 0,
      targetMarginBps: TARGET_MARGIN_BPS,
      maxPayoutMultiplier: "4.0000",
      startedAt: now,
      endsAt: new Date(now.getTime() + ROUND_MS),
    })
    .returning();
  return created;
}

async function priorSettledCards(tx: DbTx, userId: number, createdAt: Date): Promise<number> {
  const [row] = await tx
    .select({ c: sql<string>`count(*)` })
    .from(scratchCardsTable)
    .where(and(eq(scratchCardsTable.userId, userId), sql`${scratchCardsTable.createdAt} < ${createdAt}`, inArray(scratchCardsTable.status, ["won", "lost"])));
  return Number(row?.c ?? 0);
}

async function roundPool(tx: DbTx, roundId: number): Promise<{ stake: number; paid: number }> {
  const [agg] = await tx
    .select({
      stake: sql<string>`coalesce(sum(${scratchCardsTable.stakeAmount}::numeric + ${scratchCardsTable.boostFee}::numeric), 0)`,
      paid: sql<string>`coalesce(sum(case when ${scratchCardsTable.status}='won' then ${scratchCardsTable.payoutAmount}::numeric else 0 end), 0)`,
    })
    .from(scratchCardsTable)
    .where(eq(scratchCardsTable.roundId, roundId));
  return { stake: toNum(agg?.stake), paid: toNum(agg?.paid) };
}

async function buildSymbols(
  tx: DbTx,
  round: typeof scratchRoundsTable.$inferSelect,
  boxCount: number,
  required: number,
  multiplier: number,
): Promise<{ symbols: string[]; winSymbol: string | null; rare: boolean }> {
  const symbols: string[] = [];
  for (let i = 0; i < boxCount; i++) symbols.push(String(await pick(tx, round, SYMBOLS)));
  if (multiplier <= 1.0001) {
    const miss = await pick(tx, round, SYMBOLS);
    for (let i = 0; i < Math.min(required - 1, boxCount); i++) symbols[i] = miss;
    return { symbols, winSymbol: null, rare: false };
  }
  const rare = multiplier >= 3.5 && (await nextRoundRandom(tx, round)) < RARE_HIT_CHANCE;
  const winSymbol = rare ? RARE_SYMBOL : await pick(tx, round, SYMBOLS);
  for (let i = 0; i < required; i++) symbols[i] = winSymbol;
  const decorated = await Promise.all(symbols.map(async (s) => ({ s, w: await nextRoundRandom(tx, round) })));
  decorated.sort((a, b) => a.w - b.w);
  return { symbols: decorated.map((d) => d.s), winSymbol, rare };
}

async function settleExpiredCards(tx: DbTx): Promise<void> {
  const now = new Date();
  const active = await tx.select().from(scratchCardsTable).where(and(eq(scratchCardsTable.status, "active"), lte(scratchCardsTable.expiresAt, now))).limit(50);
  for (const card of active) {
    const payout = round2(toNum(card.stakeAmount) * toNum(card.payoutMultiplier));
    if (payout > 0.009) {
      await creditWithdrawable(tx, card.userId, payout, `Scratch Card auto-settle payout #${card.id}`);
      await appendWithdrawalForPayout(tx, { amount: payout, referenceId: card.id, userId: card.userId, description: `Scratch Card payout #${card.id}` });
      await tx.update(scratchCardsTable).set({ status: "won", payoutAmount: payout.toFixed(2), settledAt: now }).where(eq(scratchCardsTable.id, card.id));
    } else {
      await tx.update(scratchCardsTable).set({ status: "lost", payoutAmount: "0", settledAt: now }).where(eq(scratchCardsTable.id, card.id));
    }
  }
  const nowRound = new Date();
  const rounds = await tx.select().from(scratchRoundsTable).where(and(eq(scratchRoundsTable.status, "running"), lte(scratchRoundsTable.endsAt, nowRound)));
  for (const round of rounds) {
    const plainSeed = revealServerSeed(String(round.serverSeedReveal ?? ""));
    await tx
      .update(scratchRoundsTable)
      .set({ status: "settled", settledAt: nowRound, serverSeedReveal: plainSeed })
      .where(eq(scratchRoundsTable.id, round.id));
  }
}

async function chooseBaseMultiplier(tx: DbTx, round: typeof scratchRoundsTable.$inferSelect, onboarding: boolean): Promise<number> {
  const r = await nextRoundRandom(tx, round);
  if (onboarding) {
    // Trust-building phase: keep first rounds mostly positive, mostly small wins.
    if (r < 0.7) return round4(1.12 + (await nextRoundRandom(tx, round)) * 0.24);
    if (r < 0.94) return round4(1.35 + (await nextRoundRandom(tx, round)) * 0.5);
    return round4(1.9 + (await nextRoundRandom(tx, round)) * 0.8);
  }
  if (r < 0.66) return 0;
  if (r < 0.91) return round4(1.06 + (await nextRoundRandom(tx, round)) * 0.6);
  if (r < 0.985) return round4(1.7 + (await nextRoundRandom(tx, round)) * 1.5);
  return round4(3.4 + (await nextRoundRandom(tx, round)) * 1.5);
}

export async function getScratchCardState(userId: number) {
  return db.transaction(async (tx) => {
    await lockScratch(tx);
    await assertScratchEnabledForUser(tx, userId);
    await settleExpiredCards(tx);
    const round = await getOrCreateRound(tx);
    const [u] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!u) throw new Error("USER_NOT_FOUND");
    const [activeCard] = await tx
      .select()
      .from(scratchCardsTable)
      .where(and(eq(scratchCardsTable.userId, userId), eq(scratchCardsTable.status, "active")))
      .orderBy(desc(scratchCardsTable.id))
      .limit(1);
    const [locked] = await tx
      .select({ amt: sql<string>`coalesce(sum(${scratchCardsTable.stakeAmount}::numeric + ${scratchCardsTable.boostFee}::numeric), 0)` })
      .from(scratchCardsTable)
      .where(and(eq(scratchCardsTable.userId, userId), eq(scratchCardsTable.status, "active")));
    const history = await tx
      .select()
      .from(scratchCardsTable)
      .where(eq(scratchCardsTable.userId, userId))
      .orderBy(desc(scratchCardsTable.id))
      .limit(12);
    const leaderboard = await tx.execute(sql`
      select c.user_id as "userId", u.name as "name", coalesce(sum(c.payout_amount::numeric),0)::text as "totalWin"
      from scratch_cards c
      inner join users u on u.id = c.user_id
      where c.status = 'won' and c.created_at > now() - interval '1 day'
      group by c.user_id, u.name
      order by coalesce(sum(c.payout_amount::numeric),0) desc
      limit 8
    `);
  const streakResult = await tx.execute(sql`
      with last_days as (
        select date(created_at) as d
        from scratch_cards
        where user_id = ${userId}
        group by 1
        order by 1 desc
        limit 14
      )
      select coalesce(count(*),0)::text as c from last_days
      where d >= current_date - interval '6 day'
    `);
    const streakRow = (streakResult.rows?.[0] ?? null) as { c?: string } | null;
    return {
      round: {
        id: String(round.id),
        serverSeedHash: round.serverSeedHash ?? null,
        clientSeed: round.clientSeed ?? null,
        fairNonce: Number(round.nonce ?? 0),
        revealedServerSeed: round.status === "settled" ? (round.serverSeedReveal ?? null) : null,
        endsAt: new Date(round.endsAt).getTime(),
        targetMarginBps: round.targetMarginBps,
        maxPotentialMultiplier: toNum(round.maxPayoutMultiplier),
      },
      wallet: {
        withdrawableBalance: toNum(u.withdrawableBalance),
        nonWithdrawableBalance: toNum(u.bonusBalance),
        lockedBalance: toNum(locked?.amt),
      },
      activeCard: activeCard
        ? {
            id: String(activeCard.id),
            stakeAmount: toNum(activeCard.stakeAmount),
            boostFee: toNum(activeCard.boostFee),
            boxCount: activeCard.boxCount,
            requiredMatches: activeCard.requiredMatches,
            revealed: activeCard.revealed ?? [],
            symbols: (activeCard.symbols ?? []).map((s, i) => ((activeCard.revealed ?? [])[i] ? s : null)),
            expiresAt: new Date(activeCard.expiresAt).getTime(),
            usedExtraReveal: activeCard.usedExtraReveal,
            usedMultiplierBoost: activeCard.usedMultiplierBoost,
          }
        : null,
      history: history.map((h) => ({
        id: h.id,
        status: h.status,
        stakeAmount: toNum(h.stakeAmount),
        payoutAmount: toNum(h.payoutAmount),
        payoutMultiplier: toNum(h.payoutMultiplier),
        rareHit: h.rareHit,
        createdAt: new Date(h.createdAt).getTime(),
      })),
      leaderboard: (leaderboard.rows as Array<{ userId: number; name: string; totalWin: string }>).map((r) => ({
        userId: r.userId,
        name: `${r.name.slice(0, 4)}***`,
        totalWin: toNum(r.totalWin),
      })),
      streak: Math.max(0, Number(streakRow?.c ?? 0)),
      tuning: {
        onboardingRounds: ONBOARDING_ROUNDS,
        rareHitChance: RARE_HIT_CHANCE,
      },
    };
  });
}

export async function buyScratchCard(
  userId: number,
  input: { stakeAmount: number; boxCount: number; extraReveal?: boolean; multiplierBoost?: boolean },
) {
  return db.transaction(async (tx) => {
    await lockScratch(tx);
    await assertScratchEnabledForUser(tx, userId);
    await settleExpiredCards(tx);
    const [existing] = await tx
      .select({ id: scratchCardsTable.id })
      .from(scratchCardsTable)
      .where(and(eq(scratchCardsTable.userId, userId), eq(scratchCardsTable.status, "active")))
      .limit(1);
    if (existing) throw new Error("CARD_ALREADY_ACTIVE");

    const stake = round2(input.stakeAmount);
    if (!Number.isFinite(stake) || stake < 1 || stake > 5) throw new Error("INVALID_STAKE");
    const boxCount = Math.max(3, Math.min(9, Math.round(input.boxCount)));
    const requiredMatches = boxCount <= 4 ? 2 : 3;
    const boostFee = round2((input.extraReveal ? stake * 0.05 : 0) + (input.multiplierBoost ? stake * 0.1 : 0));
    const totalDebit = round2(stake + boostFee);

    const round = await getOrCreateRound(tx);
    const now = new Date();
    const prior = await priorSettledCards(tx, userId, now);
    const onboarding = prior < ONBOARDING_ROUNDS;
    const pool = await roundPool(tx, round.id);
    const totalStakeAfter = pool.stake + totalDebit;
    const maxPayoutPool = totalStakeAfter * (1 - round.targetMarginBps / 10000);
    const remainingPool = Math.max(0, maxPayoutPool - pool.paid);
    const hardCapMultiplier = Math.max(0, Math.min(toNum(round.maxPayoutMultiplier), remainingPool / Math.max(0.0001, stake)));
    const raw = await chooseBaseMultiplier(tx, round, onboarding);
    const boosted = input.multiplierBoost ? raw + 0.2 : raw;
    const payoutMultiplier = round4(Math.min(Math.max(onboarding ? 1.04 : 0, boosted), hardCapMultiplier));
    const finalMultiplier = payoutMultiplier < 1.01 ? 0 : payoutMultiplier;
    const { symbols, winSymbol, rare } = await buildSymbols(tx, round, boxCount, requiredMatches, finalMultiplier);
    const revealed = Array.from({ length: boxCount }, () => false);

    if (input.extraReveal && boxCount > 0) {
      revealed[Math.floor((await nextRoundRandom(tx, round)) * boxCount)] = true;
    }

    await debitWithdrawable(tx, userId, totalDebit);
    await appendDepositFromTicketPurchase(tx, {
      amount: totalDebit,
      referenceId: round.id,
      userId,
      description: `Scratch Card stake lock — round #${round.id}`,
    });
    const [card] = await tx
      .insert(scratchCardsTable)
      .values({
        userId,
        roundId: round.id,
        status: "active",
        stakeAmount: String(stake),
        boostFee: String(boostFee),
        payoutMultiplier: String(finalMultiplier),
        boxCount,
        requiredMatches,
        symbols,
        revealed,
        usedExtraReveal: input.extraReveal === true,
        usedMultiplierBoost: input.multiplierBoost === true,
        rareHit: rare,
        winSymbol: winSymbol ?? null,
        expiresAt: new Date(Date.now() + CARD_MS),
      })
      .returning();
    return {
      cardId: String(card.id),
      onboardingMode: onboarding,
      onboardingRoundsLeft: Math.max(0, ONBOARDING_ROUNDS - (prior + 1)),
      requiredMatches,
    };
  });
}

export async function revealScratchBox(userId: number, cardId: number, boxIndex: number) {
  return db.transaction(async (tx) => {
    await lockScratch(tx);
    await assertScratchEnabledForUser(tx, userId);
    await settleExpiredCards(tx);
    const [card] = await tx.select().from(scratchCardsTable).where(eq(scratchCardsTable.id, cardId)).limit(1);
    if (!card) throw new Error("CARD_NOT_FOUND");
    if (card.userId !== userId) throw new Error("FORBIDDEN");
    if (card.status !== "active") {
      return {
        status: card.status,
        payoutAmount: toNum(card.payoutAmount),
      };
    }
    if (boxIndex < 0 || boxIndex >= card.boxCount) throw new Error("INVALID_BOX");
    const revealed = [...(card.revealed ?? [])];
    if (revealed[boxIndex]) throw new Error("ALREADY_REVEALED");
    revealed[boxIndex] = true;
    await tx.update(scratchCardsTable).set({ revealed }).where(eq(scratchCardsTable.id, card.id));

    const visible = (card.symbols ?? []).filter((_, i) => revealed[i]);
    const counts = new Map<string, number>();
    for (const s of visible) counts.set(s, (counts.get(s) ?? 0) + 1);
    const maxMatch = Math.max(0, ...Array.from(counts.values()));
    const allRevealed = revealed.filter(Boolean).length >= card.boxCount;
    const shouldSettle = allRevealed || maxMatch >= card.requiredMatches || new Date(card.expiresAt).getTime() <= Date.now();
    if (!shouldSettle) {
      return {
        status: "active",
        symbol: (card.symbols ?? [])[boxIndex] ?? null,
        nearMiss: maxMatch === card.requiredMatches - 1,
      };
    }
    const payout = round2(toNum(card.stakeAmount) * toNum(card.payoutMultiplier));
    if (payout > 0.009) {
      await creditWithdrawable(tx, userId, payout, `Scratch Card payout #${card.id}`);
      await appendWithdrawalForPayout(tx, {
        amount: payout,
        referenceId: card.id,
        userId,
        description: `Scratch Card payout #${card.id}`,
      });
      await tx
        .update(scratchCardsTable)
        .set({ status: "won", payoutAmount: payout.toFixed(2), settledAt: new Date(), revealed: revealed.map(() => true) })
        .where(eq(scratchCardsTable.id, card.id));
      return { status: "won", symbol: (card.symbols ?? [])[boxIndex] ?? null, payoutAmount: payout, multiplier: toNum(card.payoutMultiplier), rareHit: card.rareHit };
    }
    await tx
      .update(scratchCardsTable)
      .set({ status: "lost", payoutAmount: "0", settledAt: new Date(), revealed: revealed.map(() => true) })
      .where(eq(scratchCardsTable.id, card.id));
    return { status: "lost", symbol: (card.symbols ?? [])[boxIndex] ?? null, payoutAmount: 0, multiplier: 0, nearMiss: maxMatch === card.requiredMatches - 1 };
  });
}

export async function verifyScratchRound(roundId: number) {
  const [round] = await db.select().from(scratchRoundsTable).where(eq(scratchRoundsTable.id, roundId)).limit(1);
  if (!round) throw new Error("ROUND_NOT_FOUND");
  const revealed = String(round.serverSeedReveal ?? "");
  if (!revealed || revealed.startsWith("enc:")) {
    return {
      roundId,
      revealed: false,
      message: "Server seed is revealed only after settlement.",
      serverSeedHash: round.serverSeedHash ?? null,
      clientSeed: round.clientSeed ?? null,
    };
  }
  const firstFloat = fairFloatFromSeed({ serverSeed: revealed, clientSeed: String(round.clientSeed ?? ""), nonce: 0 });
  return {
    roundId,
    revealed: true,
    serverSeed: revealed,
    serverSeedHash: round.serverSeedHash ?? null,
    computedServerSeedHash: hashServerSeed(revealed),
    clientSeed: round.clientSeed ?? null,
    firstDeterministicFloat: firstFloat,
    commitmentValid: hashServerSeed(revealed) === String(round.serverSeedHash ?? ""),
  };
}
