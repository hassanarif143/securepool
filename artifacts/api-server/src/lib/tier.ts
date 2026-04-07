import { pool } from "@workspace/db";

export const TIER_CONFIG = [
  { id: "aurora", label: "Bronze", minPoints: 0, icon: "🥉", free_ticket: false },
  { id: "lumen", label: "Silver", minPoints: 50, icon: "🥈", free_ticket: true },
  { id: "nova", label: "Gold", minPoints: 150, icon: "🥇", free_ticket: true },
  { id: "celestia", label: "Platinum", minPoints: 350, icon: "💎", free_ticket: true },
  { id: "orion", label: "Diamond", minPoints: 750, icon: "👑", free_ticket: true },
] as const;

export type TierId = (typeof TIER_CONFIG)[number]["id"];

export const POINTS_POOL_JOIN = 15;
export const POINTS_PER_USDT = 2; // points awarded per USDT deposited

export function computeTier(points: number): TierId {
  let tier: TierId = "aurora";
  for (const t of TIER_CONFIG) {
    if (points >= t.minPoints) tier = t.id;
  }
  return tier;
}

export function getTierConfig(tierId: TierId) {
  return TIER_CONFIG.find((t) => t.id === tierId) ?? TIER_CONFIG[0];
}

export function getNextTier(tierId: TierId) {
  const idx = TIER_CONFIG.findIndex((t) => t.id === tierId);
  return idx < TIER_CONFIG.length - 1 ? TIER_CONFIG[idx + 1] : null;
}

/**
 * Award points to a user, recompute tier, and handle free-ticket grant on upgrade.
 * Activity-tier ticket credit is withdrawable USDT (not bonus_balance).
 * Returns { newTier, previousTier, tierChanged, freeTicketGranted }
 */
export async function awardTierPoints(userId: number, points: number) {
  try {
    let rows: Record<string, unknown>[];
    try {
      const r = await pool.query(
        `SELECT tier, tier_points, free_tickets_claimed,
                wallet_balance, bonus_balance, reward_points, withdrawable_balance, name
         FROM users WHERE id = $1`,
        [userId],
      );
      rows = r.rows as Record<string, unknown>[];
    } catch {
      const r = await pool.query(
        `SELECT tier, tier_points, free_tickets_claimed, wallet_balance, bonus_balance, name
         FROM users WHERE id = $1`,
        [userId],
      );
      rows = (r.rows as Record<string, unknown>[]).map((row) => ({
        ...row,
        reward_points: 0,
        withdrawable_balance: Math.max(
          0,
          parseFloat(String(row.wallet_balance ?? "0")) - parseFloat(String(row.bonus_balance ?? "0")),
        ),
      }));
    }
    if (!rows[0]) return null;

    const currentTier = rows[0].tier as TierId;
    const currentPoints = parseInt(String(rows[0].tier_points ?? "0"));
    const claimedRaw: string = String(rows[0].free_tickets_claimed ?? "");
    const claimed = claimedRaw ? claimedRaw.split(",") : [];

    const newPoints = currentPoints + points;
    const newTier = computeTier(newPoints);
    const tierChanged = newTier !== currentTier;

    let freeTicketGranted = false;
    const bonusB = parseFloat(String(rows[0].bonus_balance ?? "0"));
    let withdrawableB = parseFloat(String(rows[0].withdrawable_balance ?? "0"));
    let rewardPoints = parseInt(String(rows[0].reward_points ?? "0"), 10) || 0;

    /* Grant free ticket if tier upgraded and not yet claimed for this tier */
    if (tierChanged && !claimed.includes(newTier)) {
      const tierCfg = getTierConfig(newTier);
      if (tierCfg.free_ticket) {
        rewardPoints += 10;
        freeTicketGranted = true;
        claimed.push(newTier);

        await pool.query(
          `INSERT INTO transactions (user_id, tx_type, amount, status, note)
         VALUES ($1, 'reward', $2, 'completed', $3)`,
          [userId, "0", `🎁 Tier upgrade reward points — reached ${tierCfg.label} tier (+10 points)`],
        );
      }
    }

    const newWallet = (bonusB + withdrawableB).toFixed(2);

    try {
      await pool.query(
        `UPDATE users
       SET tier_points = $1, tier = $2, free_tickets_claimed = $3,
           reward_points = $4,
           withdrawable_balance = $5::numeric(18,2),
           wallet_balance = $6::numeric(18,2)
       WHERE id = $7`,
        [newPoints, newTier, claimed.join(","), rewardPoints, withdrawableB.toFixed(2), newWallet, userId],
      );
    } catch {
      await pool.query(
        `UPDATE users SET tier_points = $1, tier = $2, free_tickets_claimed = $3, reward_points = $4, wallet_balance = $5 WHERE id = $6`,
        [newPoints, newTier, claimed.join(","), rewardPoints, newWallet, userId],
      );
    }

    if (freeTicketGranted) {
      const tierCfg = getTierConfig(newTier);
      console.info("[tier] granted +10 reward points for tier upgrade:", tierCfg.label);
    }

    return { newTier, previousTier: currentTier, tierChanged, freeTicketGranted, newPoints };
  } catch (err) {
    console.warn("[tier] awardTierPoints skipped:", err);
    return null;
  }
}
