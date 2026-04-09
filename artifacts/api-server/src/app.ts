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
  res.status(200).json({ status: "ok" });
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
const PRODUCTION_FRONTEND_ORIGIN = "https://securepool-usdtluck.vercel.app";

function buildAllowedOrigins(): string[] {
  const raw = process.env.FRONTEND_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") {
    list.push("http://localhost:5173", "http://127.0.0.1:5173");
  } else {
    list.push(PRODUCTION_FRONTEND_ORIGIN);
  }
  return Array.from(new Set(list));
}

const allowedOrigins = buildAllowedOrigins();

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
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
    optionsSuccessStatus: 204,
  }),
);

const sessionSecret = process.env.SESSION_SECRET;
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
