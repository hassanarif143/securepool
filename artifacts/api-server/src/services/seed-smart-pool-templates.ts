/**
 * One-time style seed: inserts default “smart” templates by slug if missing.
 * Does not modify existing rows. Safe to run on every deploy.
 */
import { db, poolTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

type Row = {
  slug: string;
  name: string;
  displayName: string;
  description: string | null;
  category: string;
  scheduleType: string;
  ticketPrice: string;
  totalTickets: number;
  winnerCount: number;
  prizeDistribution: Array<{ place: number; percentage: number }>;
  platformFeePct: string;
  drawDelayMinutes: number | null;
  autoRecreate: boolean;
  minActivePools: number;
  maxActivePools: number;
  cooldownHours: number;
  sortOrder: number;
  poolType: "small" | "large";
  badgeText: string | null;
  badgeColor: string | null;
  tierIcon: string | null;
  tierColor: string | null;
};

function pctFromPrizes(prizes: number[], prizeBudget: number): Array<{ place: number; percentage: number }> {
  if (prizeBudget <= 0) return [{ place: 1, percentage: 100 }];
  return prizes
    .map((amt, i) => ({
      place: i + 1,
      percentage: Math.round((amt / prizeBudget) * 10000) / 100,
    }))
    .filter((r) => r.percentage > 0);
}

function fixedPrizeDistribution(winnerCount: number): Array<{ place: number; percentage: number }> {
  const w = Math.min(3, Math.max(1, Math.floor(Number(winnerCount)) || 3));
  if (w === 1) return [{ place: 1, percentage: 100 }];
  if (w === 2) return [
    { place: 1, percentage: 70 },
    { place: 2, percentage: 30 },
  ];
  return [
    { place: 1, percentage: 60 },
    { place: 2, percentage: 25 },
    { place: 3, percentage: 10 },
  ];
}

function feePerTicketUsdt(ticketPrice: number): number {
  // Must match `calculatePlatformFee` logic in `api-server/src/lib/user-balances.ts`
  const e = Number(ticketPrice);
  if (!Number.isFinite(e) || e <= 0) return 0.5;
  if (e <= 3) return 0.5;
  if (e <= 5) return 1;
  if (e <= 10) return 2;
  if (e <= 15) return 3;
  if (e <= 20) return 4;
  if (e <= 25) return 5;
  return 5 + Math.ceil((e - 25) / 5);
}

function buildRows(): Row[] {
  const rows: Row[] = [];

  const add = (
    slug: string,
    name: string,
    displayName: string,
    description: string,
    category: string,
    scheduleType: string,
    ticketPrice: number,
    totalTickets: number,
    winnerCount: number,
    prizeAbs: number[],
    platformFeeAbs: number,
    opts: Partial<Omit<Row, "slug" | "name" | "displayName" | "description" | "category" | "scheduleType">> & {
      poolType?: "small" | "large";
    } = {},
  ) => {
    // Updated economics (auto-generated pools):
    // - Platform fee is charged per-ticket using fee bands (ceil(ticketPrice/5)).
    // - We store `platformFeePct` such that `createPoolFromTemplate` produces a per-join fee
    //   equal to the band fee (platformFeeAmount/totalTickets = feePerTicket).
    const feePerTicket = feePerTicketUsdt(ticketPrice);
    const pct = ticketPrice > 0 ? (feePerTicket / ticketPrice) * 100 : 0;
    const platformFeePct = Number.isFinite(pct) ? pct.toFixed(2) : "20.00";
    const prizeDistribution = fixedPrizeDistribution(winnerCount);
    rows.push({
      slug,
      name,
      displayName,
      description,
      category,
      scheduleType,
      ticketPrice: ticketPrice.toFixed(2),
      totalTickets,
      winnerCount,
      prizeDistribution,
      platformFeePct,
      drawDelayMinutes: opts.drawDelayMinutes ?? null,
      autoRecreate: opts.autoRecreate ?? true,
      minActivePools: opts.minActivePools ?? 1,
      maxActivePools: opts.maxActivePools ?? 3,
      cooldownHours: opts.cooldownHours ?? 0,
      sortOrder: opts.sortOrder ?? 99,
      poolType: opts.poolType ?? "small",
      badgeText: opts.badgeText ?? null,
      badgeColor: opts.badgeColor ?? null,
      tierIcon: opts.tierIcon ?? null,
      tierColor: opts.tierColor ?? null,
    });
  };

  add(
    "starter",
    "Starter Pool",
    "Starter Pool",
    "Low risk entry — perfect for new users",
    "daily",
    "always_on",
    2,
    12,
    3,
    [8, 4, 2],
    10,
    { drawDelayMinutes: 5, minActivePools: 1, maxActivePools: 2, sortOrder: 1, badgeText: "Beginner", badgeColor: "green", tierIcon: "🟢", tierColor: "#10b981" },
  );
  add(
    "micro",
    "$3 Pool",
    "$3 Pool",
    "Quick entry — steady activity",
    "daily",
    "always_on",
    3,
    12,
    3,
    [0, 0, 0],
    0,
    { drawDelayMinutes: 7, minActivePools: 1, maxActivePools: 2, sortOrder: 2, badgeText: "Popular", badgeColor: "cyan", tierIcon: "✨", tierColor: "#06b6d4" },
  );
  add(
    "standard",
    "Standard Pool",
    "Standard Pool",
    "Balanced risk and reward",
    "daily",
    "always_on",
    5,
    15,
    3,
    [25, 12, 8],
    30,
    { drawDelayMinutes: 10, minActivePools: 1, maxActivePools: 2, sortOrder: 3 },
  );
  add(
    "classic",
    "Classic Pool",
    "Classic Pool",
    "Most popular — best value for your USDT",
    "daily",
    "always_on",
    10,
    20,
    3,
    [70, 35, 20],
    75,
    { drawDelayMinutes: 15, minActivePools: 1, maxActivePools: 3, sortOrder: 4, badgeText: "Best Value", badgeColor: "cyan", tierIcon: "⭐", tierColor: "#06b6d4" },
  );
  add(
    "mid",
    "$15 Pool",
    "$15 Pool",
    "Higher entry — bigger prize pool",
    "daily",
    "always_on",
    15,
    20,
    3,
    [0, 0, 0],
    0,
    { drawDelayMinutes: 15, minActivePools: 1, maxActivePools: 2, sortOrder: 5, badgeText: "High", badgeColor: "gold", tierIcon: "💠", tierColor: "#eab308" },
  );
  add(
    "upper",
    "$20 Pool",
    "$20 Pool",
    "Premium entry — strong rewards",
    "daily",
    "always_on",
    20,
    20,
    3,
    [0, 0, 0],
    0,
    { drawDelayMinutes: 15, minActivePools: 1, maxActivePools: 2, sortOrder: 6, badgeText: "Premium", badgeColor: "gold", tierIcon: "🏅", tierColor: "#eab308" },
  );
  add(
    "pro",
    "Pro Pool",
    "Pro Pool",
    "Higher stakes, bigger rewards",
    "daily",
    "always_on",
    25,
    20,
    3,
    [180, 80, 40],
    200,
    { drawDelayMinutes: 15, minActivePools: 1, maxActivePools: 2, sortOrder: 7, badgeText: "Pro", badgeColor: "purple" },
  );
  add(
    "blitz",
    "Blitz Pool",
    "Blitz Pool",
    "Only 8 players — fills fast, draws fast!",
    "instant",
    "always_on",
    5,
    8,
    2,
    [18, 8],
    14,
    { drawDelayMinutes: 2, autoRecreate: false, minActivePools: 0, maxActivePools: 0, sortOrder: 50, badgeText: "Fast", badgeColor: "orange", tierIcon: "⚡", tierColor: "#f97316" },
  );
  add(
    "weekend-jackpot",
    "Weekend Jackpot",
    "Weekend Jackpot",
    "Big prizes every weekend — Friday to Sunday only!",
    "weekend",
    "weekend",
    10,
    50,
    3,
    [200, 100, 50],
    150,
    {
      drawDelayMinutes: 30,
      autoRecreate: false,
      minActivePools: 1,
      maxActivePools: 1,
      sortOrder: 6,
      badgeText: "Weekend Only",
      badgeColor: "gold",
      poolType: "large",
      tierIcon: "🏆",
      tierColor: "#eab308",
    },
  );

  return rows;
}

export async function ensureSmartPoolTemplates(): Promise<void> {
  const rows = buildRows();
  for (const r of rows) {
    const [exists] = await db.select({ id: poolTemplatesTable.id }).from(poolTemplatesTable).where(eq(poolTemplatesTable.slug, r.slug)).limit(1);
    if (!exists) {
      await db.insert(poolTemplatesTable).values({
        name: r.name,
        displayName: r.displayName,
        slug: r.slug,
        description: r.description,
        category: r.category,
        scheduleType: r.scheduleType,
        ticketPrice: r.ticketPrice,
        totalTickets: r.totalTickets,
        winnerCount: r.winnerCount,
        prizeDistribution: r.prizeDistribution,
        platformFeePct: r.platformFeePct,
        durationHours: 24,
        tierIcon: r.tierIcon,
        tierColor: r.tierColor,
        isActive: true,
        sortOrder: r.sortOrder,
        poolType: r.poolType,
        drawDelayMinutes: r.drawDelayMinutes,
        autoRecreate: r.autoRecreate,
        minActivePools: r.minActivePools,
        maxActivePools: r.maxActivePools,
        cooldownHours: r.cooldownHours,
        badgeText: r.badgeText,
        badgeColor: r.badgeColor,
      } as any);
      logger.info({ slug: r.slug }, "[seed-smart-templates] inserted template");
      continue;
    }

    // Regenerate existing template rows to keep them aligned with updated pool economics.
    await db
      .update(poolTemplatesTable)
      .set({
        name: r.name,
        displayName: r.displayName,
        description: r.description,
        category: r.category,
        scheduleType: r.scheduleType,
        ticketPrice: r.ticketPrice,
        totalTickets: r.totalTickets,
        winnerCount: r.winnerCount,
        prizeDistribution: r.prizeDistribution,
        platformFeePct: r.platformFeePct,
        tierIcon: r.tierIcon,
        tierColor: r.tierColor,
        isActive: true,
        sortOrder: r.sortOrder,
        poolType: r.poolType,
        drawDelayMinutes: r.drawDelayMinutes,
        autoRecreate: r.autoRecreate,
        minActivePools: r.minActivePools,
        maxActivePools: r.maxActivePools,
        cooldownHours: r.cooldownHours,
        badgeText: r.badgeText,
        badgeColor: r.badgeColor,
      } as any)
      .where(eq(poolTemplatesTable.slug, r.slug));
    logger.info({ slug: r.slug }, "[seed-smart-templates] regenerated template");
  }
}
