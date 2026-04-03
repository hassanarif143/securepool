// ⚠️ DEMO DATA ONLY — Run `pnpm seed:cleanup` (from api-server) before production launch.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  db,
  pool,
  usersTable,
  poolsTable,
  poolParticipantsTable,
  winnersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

/** DB-safe prefix (avoid `[` in LIKE patterns). */
const DEMO_TITLE_PREFIX = "DEMO —";

const DEMO_NAMES = [
  "Ahmed Raza",
  "Fatima Khan",
  "Usman Ali",
  "Ayesha Malik",
  "Bilal Sheikh",
  "Sana Tariq",
  "Hamza Qureshi",
  "Zainab Hussain",
  "Danish Iqbal",
  "Mehreen Butt",
  "Saad Aslam",
  "Hira Naveed",
  "Faisal Javed",
  "Nadia Riaz",
  "Imran Siddiqui",
  "Maham Akbar",
  "Kamran Yousaf",
  "Rabia Shahid",
  "Tariq Mehmood",
  "Alina Farooq",
  "Omer Hassan",
  "Sadia Noor",
  "Waqas Ahmed",
  "Mariam Aziz",
  "Hassan Rauf",
];

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const usedAddresses = new Set<string>();

function fakeTrc20(): string {
  let body = "";
  for (let i = 0; i < 33; i++) body += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  const addr = `T${body}`;
  if (usedAddresses.has(addr)) return fakeTrc20();
  usedAddresses.add(addr);
  return addr;
}

function refCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function emailFromName(name: string, idx: number): string {
  const base = name.toLowerCase().replace(/\s+/g, ".");
  const domains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"];
  return `${base}.${idx}@${domains[idx % domains.length]}`;
}

async function main() {
  const { rows: existing } = await pool.query(`SELECT COUNT(*)::int AS c FROM users WHERE is_demo = true`);
  const count = (existing[0] as { c: number }).c;
  if (count > 0) {
    console.error("Demo users already exist. Run `pnpm seed:cleanup` in api-server first.");
    process.exit(1);
  }

  const now = Date.now();
  const userIds: number[] = [];

  for (let i = 0; i < DEMO_NAMES.length; i++) {
    const name = DEMO_NAMES[i]!;
    const email = emailFromName(name, i);
    const cryptoAddress = fakeTrc20();
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
    let code = refCode();
    for (let attempt = 0; attempt < 20; attempt++) {
      const clash = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
      if (clash.length === 0) break;
      code = refCode();
    }
    const joinedAt = new Date(now - Math.random() * 30 * 24 * 60 * 60 * 1000);
    const [u] = await db
      .insert(usersTable)
      .values({
        name,
        email,
        passwordHash,
        cryptoAddress,
        referralCode: code,
        isDemo: true,
        walletBalance: String((Math.random() * 50 + 5).toFixed(2)),
        joinedAt,
      })
      .returning({ id: usersTable.id });
    if (u) userIds.push(u.id);
  }

  const completedCount = 6;
  const completedPoolIds: number[] = [];

  for (let n = 1; n <= completedCount; n++) {
    const end = new Date(now - (completedCount - n + 1) * 2.5 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 5 * 24 * 60 * 60 * 1000);
    const [p] = await db
      .insert(poolsTable)
      .values({
        title: `${DEMO_TITLE_PREFIX} Pool #${n}`,
        startTime: start,
        endTime: end,
        status: "completed",
        entryFee: "10",
        maxUsers: 100,
        prizeFirst: "100",
        prizeSecond: "50",
        prizeThird: "30",
      })
      .returning({ id: poolsTable.id });
    if (!p) continue;
    completedPoolIds.push(p.id);

    const size = 15 + Math.floor(Math.random() * 26);
    const picked = shuffle(userIds).slice(0, Math.min(size, userIds.length));
    for (const uid of picked) {
      await db.insert(poolParticipantsTable).values({ poolId: p.id, userId: uid, ticketCount: 1, amountPaid: "10" });
    }
    const top = shuffle(picked).slice(0, 3);
    const prizes = ["100.00", "50.00", "30.00"] as const;
    for (let place = 1; place <= 3; place++) {
      await db.insert(winnersTable).values({
        poolId: p.id,
        userId: top[place - 1]!,
        place,
        prize: prizes[place - 1]!,
        paymentStatus: "paid",
      });
    }
  }

  const activeEnd = new Date(now + 4 * 24 * 60 * 60 * 1000);
  const activeStart = new Date(now - 24 * 60 * 60 * 1000);
  const [active] = await db
    .insert(poolsTable)
    .values({
      title: `${DEMO_TITLE_PREFIX} Active Pool`,
      startTime: activeStart,
      endTime: activeEnd,
      status: "open",
      entryFee: "10",
      maxUsers: 100,
      prizeFirst: "100",
      prizeSecond: "50",
      prizeThird: "30",
    })
    .returning({ id: poolsTable.id });

  if (active) {
    const joinN = 8 + Math.floor(Math.random() * 8);
    const picked = shuffle(userIds).slice(0, Math.min(joinN, userIds.length));
    for (const uid of picked) {
      await db.insert(poolParticipantsTable).values({ poolId: active.id, userId: uid, ticketCount: 1, amountPaid: "10" });
    }
  }

  console.log(
    `Seeded ${userIds.length} demo users, ${completedPoolIds.length} completed pools, 1 active pool (winners + participants).`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
