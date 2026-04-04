import type { Response } from "express";

/**
 * Email OTP verification is temporarily disabled — do not block pool join / deposits / withdrawals.
 * Re-enable DB checks here when OTP is restored.
 */
export async function assertEmailVerified(_res: Response, _userId: number): Promise<boolean> {
  return true;
}
