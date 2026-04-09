import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const strictFinancialLimiter = rateLimit({
  windowMs: 60_000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id ?? req.session?.userId;
    if (userId) return `u:${userId}`;
    return `ip:${ipKeyGenerator(req.ip ?? "127.0.0.1")}`;
  },
  message: { error: "RATE_LIMITED", message: "Too many attempts. Please retry shortly." },
});

export const authBurstLimiter = rateLimit({
  windowMs: 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "127.0.0.1"),
  message: { error: "RATE_LIMITED", message: "Too many login attempts." },
});
