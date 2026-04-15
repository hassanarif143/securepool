import { db, stakingSimConfigTable, stakingSimEventsTable, stakingSimDailyFinanceTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const NAMES = ["Ali", "Zain", "Sara", "Hassan", "Ayesha", "Usman", "Hamza", "Noor", "Ahmed", "Maryam", "Bilal", "Saad", "Zoya"];
const PLANS: Array<{ label: "Basic" | "Pro" | "Advanced"; risk: "low" | "medium" | "high" }> = [
  { label: "Basic", risk: "low" },
  { label: "Pro", risk: "medium" },
  { label: "Advanced", risk: "high" },
];

function randName() {
  return NAMES[Math.floor(Math.random() * NAMES.length)]!;
}
function randPlan() {
  return PLANS[Math.floor(Math.random() * PLANS.length)]!;
}

export async function getSimConfig() {
  const [row] = await db.select().from(stakingSimConfigTable).where(eq(stakingSimConfigTable.id, 1)).limit(1);
  if (!row) return null;
  return {
    enabled: row.enabled,
    activeUsersTarget: row.activeUsersTarget,
    stakeFrequencySec: row.stakeFrequencySec,
    earningFrequencySec: row.earningFrequencySec,
    upgradeFrequencySec: row.upgradeFrequencySec,
    minAmount: toNum(row.minAmount),
    maxAmount: toNum(row.maxAmount),
    winRate: toNum(row.winRate),
  };
}

export async function updateSimConfig(patch: Partial<Awaited<ReturnType<typeof getSimConfig>>>) {
  const now = new Date();
  const next: any = { updatedAt: now };
  const p = patch ?? {};
  if (typeof p.enabled === "boolean") next.enabled = p.enabled;
  if (typeof p.activeUsersTarget === "number") next.activeUsersTarget = p.activeUsersTarget;
  if (typeof p.stakeFrequencySec === "number") next.stakeFrequencySec = p.stakeFrequencySec;
  if (typeof p.earningFrequencySec === "number") next.earningFrequencySec = p.earningFrequencySec;
  if (typeof p.upgradeFrequencySec === "number") next.upgradeFrequencySec = p.upgradeFrequencySec;
  if (typeof p.minAmount === "number") next.minAmount = p.minAmount.toFixed(2);
  if (typeof p.maxAmount === "number") next.maxAmount = p.maxAmount.toFixed(2);
  if (typeof p.winRate === "number") next.winRate = p.winRate.toFixed(2);
  await db.update(stakingSimConfigTable).set(next).where(eq(stakingSimConfigTable.id, 1));
  return await getSimConfig();
}

export async function getRecentSimEvents(limit = 30) {
  const rows = await db.select().from(stakingSimEventsTable).orderBy(desc(stakingSimEventsTable.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    type: r.eventType,
    displayName: r.displayName,
    planLabel: r.planLabel,
    amount: toNum(r.amount),
    earned: toNum(r.earned),
    createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
  }));
}

export async function pushSimEvent(event: { type: "stake" | "earn" | "upgrade"; displayName: string; planLabel: string; amount?: number; earned?: number }) {
  const now = new Date();
  await db.insert(stakingSimEventsTable).values({
    eventType: event.type,
    displayName: event.displayName,
    planLabel: event.planLabel,
    amount: (event.amount ?? 0).toFixed(2),
    earned: (event.earned ?? 0).toFixed(2),
    createdAt: now,
  } as any);
}

export async function tickSimulationOnce() {
  const cfg = await getSimConfig();
  if (!cfg?.enabled) return { ran: false as const };

  const r = Math.random();
  const p = randPlan();
  const name = randName();
  const amount = round2(cfg.minAmount + Math.random() * Math.max(0, cfg.maxAmount - cfg.minAmount));
  let stakedAdd = 0;
  let paidAdd = 0;
  let profitAdd = 0;
  if (r < 0.55) {
    await pushSimEvent({ type: "stake", displayName: name, planLabel: p.label, amount });
    stakedAdd = amount;
    // pretend platform profit increases slightly from usage
    profitAdd = round2(amount * 0.015);
  } else if (r < 0.9) {
    const earned = round2(Math.max(0.05, amount * 0.012));
    await pushSimEvent({ type: "earn", displayName: name, planLabel: p.label, earned });
    paidAdd = earned;
    profitAdd = round2(-earned);
  } else {
    await pushSimEvent({ type: "upgrade", displayName: name, planLabel: "Pro" });
  }

  // Update today simulated finance snapshot (system-only).
  await db.execute(sql`
    insert into staking_sim_daily_finance (day, total_staked, paid_out, profit, updated_at)
    values (current_date, ${stakedAdd.toFixed(2)}::numeric, ${paidAdd.toFixed(2)}::numeric, ${profitAdd.toFixed(2)}::numeric, now())
    on conflict (day) do update set
      total_staked = staking_sim_daily_finance.total_staked::numeric + ${stakedAdd.toFixed(2)}::numeric,
      paid_out = staking_sim_daily_finance.paid_out::numeric + ${paidAdd.toFixed(2)}::numeric,
      profit = staking_sim_daily_finance.profit::numeric + ${profitAdd.toFixed(2)}::numeric,
      updated_at = now()
  `);
  return { ran: true as const };
}

export async function getSimTodayFinance() {
  const rows = await db.execute(sql`
    select total_staked::text as total_staked, paid_out::text as paid_out, profit::text as profit
    from staking_sim_daily_finance
    where day = current_date
  `);
  const r = (rows.rows as any[])[0] ?? {};
  return { total_staked: toNum(r.total_staked), paid_out: toNum(r.paid_out), profit: toNum(r.profit) };
}

