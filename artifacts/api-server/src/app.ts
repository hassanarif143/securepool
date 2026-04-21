import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";
import { getUploadsDir } from "./paths";
import { attachAuth, rejectIfBlocked } from "./middleware/auth";
import { csrfProtection, issueCsrfToken } from "./middleware/csrf";
import { verifyRequestSignature } from "./middleware/request-signature";
import { auditTrail } from "./middleware/audit";

const app: Express = express();

const PgStore = connectPgSimple(session);

app.disable("x-powered-by");

// Fast liveness for Railway — no session, DB, or CSRF (must stay before heavy middleware).
app.get("/health", (_req, res) => {
  const sha =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.GIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    null;
  res.status(200).json({ status: "ok", sha, now: new Date().toISOString() });
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  helmet({
    // Railway / Vercel already terminate TLS; enable HSTS only in prod
    hsts: process.env.NODE_ENV === "production",
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow serving /uploads
  }),
);

app.use(cookieParser());

/** Production SPA — must match browser Origin for credentialed cross-origin requests. */
const PRODUCTION_FRONTEND_ORIGIN = "https://securepool.vercel.app";

function buildAllowedOrigins(): string[] {
  const raw = process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") {
    list.push(
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    );
  } else {
    list.push(PRODUCTION_FRONTEND_ORIGIN);
  }
  return Array.from(new Set(list));
}

const allowedOrigins = buildAllowedOrigins();

function isMaintenanceMode(): boolean {
  const v = String(process.env.API_MAINTENANCE_MODE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

// CORS must run before session/auth so OPTIONS preflight and credentialed responses get proper headers (Vercel → Railway).
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (process.env.NODE_ENV === "production") {
        if (origin === PRODUCTION_FRONTEND_ORIGIN) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        logger.warn({ origin, allowedOrigins }, "[cors] blocked origin");
        return cb(null, false);
      }
      if (allowedOrigins.includes(origin)) return cb(null, true);
      logger.warn({ origin, allowedOrigins }, "[cors] blocked origin");
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // `x-idempotency-key` is required for /api/games/* POSTs (idempotencyGuard); browsers block it if not allowed here.
    // Some browsers (and service workers) include cache-control / pragma in preflight — allow them.
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token", "x-idempotency-key", "cache-control", "pragma"],
    optionsSuccessStatus: 204,
  }),
);

if (isMaintenanceMode()) {
  logger.error("[startup] API_MAINTENANCE_MODE active — serving 503 for /api");
  app.use("/api", (_req, res) => {
    res.status(503).json({
      error: "Service Unavailable",
      message: "Service is temporarily unavailable due to database capacity limits. Please retry shortly.",
      code: "DB_CAPACITY_EXCEEDED",
    });
  });
} else {
  const isProd = process.env.NODE_ENV === "production";
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && !isProd) {
    sessionSecret = "local-dev-only-insecure-session-secret";
    logger.warn(
      "[session] SESSION_SECRET unset — using insecure dev default. Set SESSION_SECRET in artifacts/api-server/.env for stable sessions.",
    );
  }
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  // Before session — required on Railway so `req.secure` / cookie behavior matches the client-facing HTTPS URL.
  app.set("trust proxy", 1);

  const sessionCookieCrossSite = process.env.NODE_ENV === "production";

  app.use(
    session({
      name: "connect.sid",
      store: new PgStore({
        pool,
        // Session table is created via SQL migration (`0067_express_session_table.sql`).
        //
        // IMPORTANT: do not enable `createTableIfMissing` when bundling the API with esbuild:
        // `connect-pg-simple` reads `table.sql` via `__dirname`, which resolves inside `dist/`
        // and crashes with ENOENT on Railway.
        createTableIfMissing: false,
      }),
      proxy: sessionCookieCrossSite,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: sessionCookieCrossSite,
        sameSite: sessionCookieCrossSite ? "none" : "lax",
        httpOnly: true,
        maxAge: 86_400_000, // 24h
        path: "/",
      },
    }),
  );

  app.use(attachAuth);
  app.use(issueCsrfToken);

  // Basic rate limit for all API routes (tighten per-route later)
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/uploads", express.static(getUploadsDir()));
  app.use(csrfProtection);
  app.use(verifyRequestSignature);
  app.use(auditTrail);

  app.use("/api", rejectIfBlocked);
  app.use("/api", router);
}

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;
  logger.error({ err, path: req.originalUrl }, "unhandled error");
  const message = err instanceof Error ? err.message : String(err);
  if (req.originalUrl?.startsWith("/api")) {
    res.status(500).json({
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : message,
    });
    return;
  }
  res.status(500).type("text").send("Internal Server Error");
});

export default app;
