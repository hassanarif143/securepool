import { db, pool } from "@workspace/db";
import { appendBonusGrant } from "../services/admin-wallet-service";
import { recordBonusFromPlatform } from "../services/user-wallet-service";

export const TIER_CONFIG = [
  { id: "aurora",   label: "Bronze",   minPoints: 0,   icon: "🥉", free_ticket: false },
  { id: "lumen",    label: "Silver",   minPoints: 50,  icon: "🥈", free_ticket: true  },
  { id: "nova",     label: "Gold",     minPoints: 150, icon: "🥇", free_ticket: true  },
  { id: "celestia", label: "Platinum", minPoints: 350, icon: "💎", free_ticket: true  },
  { id: "orion",    label: "Diamond",  minPoints: 750, icon: "👑", free_ticket: true  },
] as const;

export type TierId = typeof TIER_CONFIG[number]["id"];

export const FREE_TICKET_USDT = 10;
export const POINTS_POOL_JOIN  = 15;
export const POINTS_PER_USDT   = 2;  // points awarded per USDT deposited

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
 * Returns { newTier, previousTier, tierChanged, freeTicketGranted }
 */
export async function awardTierPoints(userId: number, points: number) {
  try {
    /* Fetch current state — requires migration 0004_user_tier.sql */
    const { rows } = await pool.query(
      "SELECT tier, tier_points, free_tickets_claimed, wallet_balance, name FROM users WHERE id = $1",
      [userId],
    );
    if (!rows[0]) return null;

    const currentTier = rows[0].tier as TierId;
    const currentPoints = parseInt(rows[0].tier_points ?? "0");
    const claimedRaw: string = rows[0].free_tickets_claimed ?? "";
    const claimed = claimedRaw ? claimedRaw.split(",") : [];

    const newPoints = currentPoints + points;
    const newTier = computeTier(newPoints);
    const tierChanged = newTier !== currentTier;

    let freeTicketGranted = false;
    let newBalance = parseFloat(rows[0].wallet_balance);

    /* Grant free ticket if tier upgraded and not yet claimed for this tier */
    if (tierChanged && !claimed.includes(newTier)) {
      const tierCfg = getTierConfig(newTier);
      if (tierCfg.free_ticket) {
        newBalance += FREE_TICKET_USDT;
        freeTicketGranted = true;
        claimed.push(newTier);

        /* Log as transaction */
        await pool.query(
          `INSERT INTO transactions (user_id, tx_type, amount, status, note)
         VALUES ($1, 'reward', $2, 'completed', $3)`,
          [userId, String(FREE_TICKET_USDT), `🎁 Tier upgrade bonus — reached ${tierCfg.label} tier`],
        );
      }
    }

    /* Persist updated points, tier, claimed list, and possibly balance */
    await pool.query(
      `UPDATE users
     SET tier_points = $1, tier = $2, free_tickets_claimed = $3, wallet_balance = $4
     WHERE id = $5`,
      [newPoints, newTier, claimed.join(","), String(newBalance), userId],
    );

    if (freeTicketGranted) {
      const tierCfg = getTierConfig(newTier);
      try {
        await db.transaction(async (trx) => {
          await appendBonusGrant(trx, {
            userId,
            amount: FREE_TICKET_USDT,
            description: `Tier upgrade free ticket credit — ${tierCfg.label} tier`,
          });
          await recordBonusFromPlatform(trx, {
            userId,
            amount: FREE_TICKET_USDT,
            balanceAfter: newBalance,
            description: `Tier upgrade bonus — ${FREE_TICKET_USDT} USDT (${tierCfg.label})`,
            referenceType: "tier",
          });
        });
      } catch (e) {
        console.warn("[tier] central/user wallet ledger for tier bonus:", e);
      }
    }

    return { newTier, previousTier: currentTier, tierChanged, freeTicketGranted, newPoints };
  } catch (err) {
    /* Missing tier columns or DB error — do not break pool join / deposits */
    console.warn("[tier] awardTierPoints skipped:", err);
    return null;
  }
}
