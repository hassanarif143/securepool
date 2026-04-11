import crypto from "node:crypto";
import { db, usersTable, pool as pgPool, shareCardsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { notifyUser } from "../lib/notify";
import { privacyDisplayName } from "../lib/privacy-name";
import { logger } from "../lib/logger";

const PKR_PER_USDT = parseFloat(process.env.PKR_PER_USDT ?? "278");

function buildReferralCode(userId: number): string {
  const rand = crypto.randomInt(1000, 10000);
  return `REF${userId}${rand}`;
}

export async function ensureReferralCode(userId: number): Promise<string> {
  const [me] = await db.select({ referralCode: usersTable.referralCode }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (me?.referralCode?.trim()) return me.referralCode;
  for (let i = 0; i < 8; i++) {
    const candidate = buildReferralCode(userId);
    const [clash] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, candidate)).limit(1);
    if (clash) continue;
    await db.update(usersTable).set({ referralCode: candidate }).where(eq(usersTable.id, userId));
    return candidate;
  }
  return `REF${userId}`;
}

function formatPkr(usdt: number): string {
  return Math.round(usdt * PKR_PER_USDT).toLocaleString("en-PK");
}

export function formatShareCardDisplayDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function createShareCard(
  userId: number,
  cardType: string,
  cardData: Record<string, unknown>,
  referralCode: string | null,
): Promise<number> {
  const [row] = await db
    .insert(shareCardsTable)
    .values({
      userId,
      cardType,
      cardData,
      referralCode: referralCode ?? undefined,
    })
    .returning({ id: shareCardsTable.id });
  return row?.id ?? 0;
}

export async function trackShare(cardId: number, userId: number, platform: string): Promise<void> {
  await pgPool.query(
    `UPDATE share_cards SET share_count = share_count + 1,
     shared_platforms = array_append(COALESCE(shared_platforms, '{}'), $2)
     WHERE id = $1 AND user_id = $3`,
    [cardId, platform, userId],
  );
  await pgPool.query(`INSERT INTO share_analytics (share_card_id, platform) VALUES ($1, $2)`, [cardId, platform]);
}

export async function onPoolDrawCompletedShareCards(opts: {
  poolId: number;
  poolTitle: string;
  totalTickets: number;
  drawHash: string;
  winners: Array<{ userId: number; place: number; prize: string; userName: string }>;
}): Promise<void> {
  for (const w of opts.winners) {
    try {
      const code = await ensureReferralCode(w.userId);
      const amount = parseFloat(String(w.prize));
      const placeOrdinal = w.place === 1 ? "1st" : w.place === 2 ? "2nd" : "3rd";
      const cardData: Record<string, unknown> = {
        username: privacyDisplayName(w.userName),
        amount: amount.toFixed(2),
        currency: "USDT",
        pkr_equivalent: formatPkr(amount),
        pool_name: opts.poolTitle.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, "").trim(),
        pool_id: `#${opts.poolId}`,
        place: placeOrdinal,
        place_label: `${placeOrdinal} Place Winner`,
        draw_hash: opts.drawHash,
        total_participants: opts.totalTickets,
        date: formatShareCardDisplayDate(new Date()),
      };
      const id = await createShareCard(w.userId, "pool_win", cardData, code);
      if (id > 0) {
        await notifyUser(
          w.userId,
          "🏆 Share your win!",
          `Your share card is ready (card #${id}). Open My Shares to post to WhatsApp or download.`,
          "share_prompt",
          opts.poolId,
        );
      }
    } catch (err) {
      logger.warn({ err, userId: w.userId, poolId: opts.poolId }, "[share-card] pool_win failed");
    }
  }
}

export async function onReferralBonusCredited(opts: {
  referrerId: number;
  referredUserId: number;
  bonusUsdt: number;
}): Promise<void> {
  try {
    const code = await ensureReferralCode(opts.referrerId);
    const [referrer] = await db.select().from(usersTable).where(eq(usersTable.id, opts.referrerId)).limit(1);
    const [friend] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, opts.referredUserId)).limit(1);
    if (!referrer) return;

    const { rows } = await pgPool.query<{ s: string }>(
      `SELECT COALESCE(SUM(CAST(bonus_referrer AS numeric)), 0)::text AS s FROM referrals WHERE referrer_id = $1 AND bonus_given = true`,
      [opts.referrerId],
    );
    const totalEarned = parseFloat(rows[0]?.s ?? "0") || 0;
    const { rows: cnt } = await pgPool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM referrals WHERE referrer_id = $1 AND bonus_given = true`,
      [opts.referrerId],
    );
    const totalRefs = parseInt(cnt[0]?.c ?? "0", 10) || 0;

    const cardData: Record<string, unknown> = {
      username: privacyDisplayName(referrer.name),
      amount: opts.bonusUsdt.toFixed(2),
      currency: "USDT",
      total_referrals: totalRefs,
      total_earned: totalEarned.toFixed(2),
      referral_tier: "Referrer",
      friend_username: privacyDisplayName(friend?.name ?? "Friend"),
      date: formatShareCardDisplayDate(new Date()),
    };
    const id = await createShareCard(opts.referrerId, "referral_earned", cardData, code);
    if (id > 0) {
      await notifyUser(
        opts.referrerId,
        "🤝 Referral bonus!",
        `You earned ${opts.bonusUsdt.toFixed(2)} USDT. Share card #${id} — see My Shares.`,
        "share_prompt",
      );
    }
  } catch (err) {
    logger.warn({ err, referrerId: opts.referrerId }, "[share-card] referral_earned failed");
  }
}

export async function onWithdrawalSuccess(opts: {
  userId: number;
  amountUsdt: number;
  txId: number;
}): Promise<void> {
  try {
    const code = await ensureReferralCode(opts.userId);
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, opts.userId)).limit(1);
    if (!u) return;

    const { rows } = await pgPool.query<{ s: string }>(
      `SELECT COALESCE(SUM(CAST(amount AS numeric)), 0)::text AS s FROM transactions
       WHERE user_id = $1 AND tx_type = 'withdraw' AND status = 'completed'`,
      [opts.userId],
    );
    const lifetime = parseFloat(rows[0]?.s ?? "0") || 0;

    const cardData: Record<string, unknown> = {
      username: privacyDisplayName(u.name),
      amount: opts.amountUsdt.toFixed(2),
      currency: "USDT",
      pkr_equivalent: formatPkr(opts.amountUsdt),
      withdrawal_method: "TRC20 Wallet",
      processing_time: "< 5 minutes",
      total_withdrawn_lifetime: lifetime.toFixed(2),
      date: formatShareCardDisplayDate(new Date()),
    };
    const id = await createShareCard(opts.userId, "withdrawal_success", cardData, code);
    if (id > 0) {
      await notifyUser(
        opts.userId,
        "💸 Withdrawal sent!",
        `Share proof with card #${id} — open My Shares.`,
        "share_prompt",
      );
    }
  } catch (err) {
    logger.warn({ err, userId: opts.userId }, "[share-card] withdrawal failed");
  }
}

/** Optional hooks for future achievement / XP / streak systems. */
export async function onAchievementUnlocked(
  userId: number,
  data: Record<string, unknown>,
): Promise<number> {
  const code = await ensureReferralCode(userId);
  return createShareCard(userId, "achievement_unlocked", data, code);
}

export async function onLevelUp(userId: number, data: Record<string, unknown>): Promise<number> {
  const code = await ensureReferralCode(userId);
  return createShareCard(userId, "level_up", data, code);
}

export async function onStreakMilestone(userId: number, data: Record<string, unknown>): Promise<number> {
  const code = await ensureReferralCode(userId);
  return createShareCard(userId, "login_streak", data, code);
}

/** Pool join streak (join within 7-day window). */
export async function onPoolStreakMilestone(userId: number, data: Record<string, unknown>): Promise<number> {
  const code = await ensureReferralCode(userId);
  return createShareCard(userId, "pool_streak", data, code);
}

/**
 * When a new user signs up via a tracked share link (?sc=cardId), record conversion on share_analytics.
 */
export async function recordShareCardSignupConversion(opts: {
  shareCardId: number;
  newUserId: number;
  referrerId: number;
  referralCodeUsed: string;
}): Promise<boolean> {
  const { rows } = await pgPool.query<{ user_id: number; referral_code: string | null }>(
    `SELECT user_id, referral_code FROM share_cards WHERE id = $1`,
    [opts.shareCardId],
  );
  const row = rows[0];
  if (!row || row.user_id !== opts.referrerId) return false;
  const stored = String(row.referral_code ?? "").trim().toUpperCase();
  const used = opts.referralCodeUsed.trim().toUpperCase();
  if (!stored || stored !== used) return false;

  await pgPool.query(
    `INSERT INTO share_analytics (share_card_id, platform, resulted_in_signup, new_user_id)
     VALUES ($1, $2, true, $3)`,
    [opts.shareCardId, "signup_conversion", opts.newUserId],
  );
  return true;
}
