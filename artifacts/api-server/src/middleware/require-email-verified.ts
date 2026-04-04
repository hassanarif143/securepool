import type { Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export async function assertEmailVerified(res: Response, userId: number): Promise<boolean> {
  const [u] = await db
    .select({ emailVerified: usersTable.emailVerified })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u || u.emailVerified === false) {
    res.status(403).json({
      error: "Email not verified",
      code: "EMAIL_NOT_VERIFIED",
      message: "Please verify your email to start playing.",
    });
    return false;
  }
  return true;
}
