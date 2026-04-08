import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { getAuthedUserId, requireAuth, type AuthedRequest } from "../middleware/auth";
import { assertEmailVerified } from "../middleware/require-email-verified";
import { getUploadsDir } from "../paths";
import {
  createP2pAppeal,
  createP2pOffer,
  createP2pOrderFromOffer,
  cancelP2pOrder,
  getP2pSummary,
  listMyP2pOffers,
  listP2pOffers,
  listP2pOrdersForUser,
  markP2pOrderPaid,
  postP2pMessage,
  releaseP2pOrder,
  setMyP2pOfferActive,
  subscribeP2pRealtime,
  updateMyP2pOffer,
} from "../services/p2p-service";

const router: IRouter = Router();
router.use((req, res, next) => requireAuth(req as AuthedRequest, res, next));

const uploadDir = getUploadsDir();
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `p2p-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: msg });
      return;
    }
    next();
  });
}

function mapErr(e: unknown): { status: number; error: string } {
  const m = e instanceof Error ? e.message : "ERR";
  const table: Record<string, number> = {
    INVALID_SIDE: 400,
    INVALID_PRICE: 400,
    INVALID_MIN: 400,
    INVALID_MAX: 400,
    INVALID_AVAILABLE: 400,
    INVALID_METHODS: 400,
    INVALID_AMOUNT: 400,
    OFFER_NOT_FOUND: 404,
    INSUFFICIENT_OFFER_LIQUIDITY: 400,
    AMOUNT_OUT_OF_RANGE: 400,
    SELF_TRADE: 400,
    INSUFFICIENT_BALANCE: 400,
    ORDER_NOT_FOUND: 404,
    FORBIDDEN: 403,
    INVALID_STATE: 400,
    EMPTY_MESSAGE: 400,
    CHAT_CLOSED: 400,
    EMPTY_APPEAL: 400,
    APPEAL_EXISTS: 400,
    P2P_PAYMENT_DETAILS_REQUIRED: 400,
    INSUFFICIENT_PLATFORM_FEE_BALANCE: 400,
    NO_FIELDS: 400,
  };
  return { status: table[m] ?? 500, error: m };
}

router.get("/summary", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    const s = await getP2pSummary(userId);
    res.json(s);
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.get("/offers", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const side = req.query.side === "sell" ? "sell" : "buy";
  try {
    const offers = await listP2pOffers(side, userId);
    res.json(offers);
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.get("/offers/me", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    const offers = await listMyP2pOffers(userId);
    res.json(offers);
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

const CreateOfferBody = z.object({
  side: z.enum(["sell_usdt", "buy_usdt"]),
  pricePerUsdt: z.coerce.number().positive(),
  fiatCurrency: z.string().min(1).max(12).optional(),
  minUsdt: z.coerce.number().positive(),
  maxUsdt: z.coerce.number().positive(),
  availableUsdt: z.coerce.number().positive(),
  methods: z.array(z.string()).min(1),
  paymentDetails: z.record(z.string(), z.string()).optional(),
  responseTimeLabel: z.string().max(120).optional(),
});

router.post("/offers", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = CreateOfferBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", message: parsed.error.message });
    return;
  }
  try {
    const id = await createP2pOffer(userId, parsed.data);
    res.status(201).json({ id: String(id) });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

const UpdateOfferBody = z
  .object({
    pricePerUsdt: z.coerce.number().positive().optional(),
    fiatCurrency: z.string().min(1).max(12).optional(),
    minUsdt: z.coerce.number().positive().optional(),
    maxUsdt: z.coerce.number().positive().optional(),
    availableUsdt: z.coerce.number().nonnegative().optional(),
    methods: z.array(z.string()).min(1).optional(),
    paymentDetails: z.record(z.string(), z.string()).optional(),
    responseTimeLabel: z.string().max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "NO_FIELDS" });

router.patch("/offers/:offerId", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const offerId = parseInt(req.params.offerId, 10);
  if (Number.isNaN(offerId)) {
    res.status(400).json({ error: "Invalid offer" });
    return;
  }
  const parsed = UpdateOfferBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", message: parsed.error.message });
    return;
  }
  try {
    await updateMyP2pOffer(userId, offerId, parsed.data);
    res.json({ ok: true });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.post("/offers/:offerId/set-active", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const offerId = parseInt(req.params.offerId, 10);
  if (Number.isNaN(offerId)) {
    res.status(400).json({ error: "Invalid offer" });
    return;
  }
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", message: parsed.error.message });
    return;
  }
  try {
    await setMyP2pOfferActive(userId, offerId, parsed.data.active);
    res.json({ ok: true });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

const CreateOrderBody = z.object({
  offerId: z.coerce.number().int().positive(),
  usdtAmount: z.coerce.number().positive(),
});

router.post("/orders", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const parsed = CreateOrderBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", message: parsed.error.message });
    return;
  }
  try {
    const out = await createP2pOrderFromOffer(userId, parsed.data.offerId, parsed.data.usdtAmount);
    res.status(201).json({ orderId: String(out.orderId) });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.get("/orders", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  try {
    const orders = await listP2pOrdersForUser(userId);
    res.json(orders);
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.get("/stream", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: ready\ndata: {"ok":true}\n\n`);
  const heartbeat = setInterval(() => res.write(`event: ping\ndata: {"t":${Date.now()}}\n\n`), 25_000);
  const unsubscribe = subscribeP2pRealtime(userId, (event) => {
    res.write(`event: p2p\ndata: ${JSON.stringify(event)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.post("/orders/:orderId/mark-paid", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const orderId = parseInt(req.params.orderId, 10);
  if (Number.isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }
  try {
    await markP2pOrderPaid(orderId, userId);
    res.json({ ok: true });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.post("/orders/:orderId/release", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const orderId = parseInt(req.params.orderId, 10);
  if (Number.isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }
  try {
    await releaseP2pOrder(orderId, userId);
    res.json({ ok: true });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.post("/orders/:orderId/cancel", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const orderId = parseInt(req.params.orderId, 10);
  if (Number.isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }
  try {
    await cancelP2pOrder(orderId, userId);
    res.json({ ok: true });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.post("/orders/:orderId/messages", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const orderId = parseInt(req.params.orderId, 10);
  if (Number.isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }
  const parsed = z.object({ body: z.string().optional(), attachmentUrl: z.string().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  try {
    await postP2pMessage(orderId, userId, parsed.data.body ?? "", parsed.data.attachmentUrl ?? null);
    res.json({ ok: true });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

router.post("/upload", uploadSingle, async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const f = (req as Request & { file?: Express.Multer.File }).file;
  if (!f) {
    res.status(400).json({ error: "file required" });
    return;
  }
  res.json({ url: `/uploads/${f.filename}` });
});

const AppealBody = z.object({
  message: z.string().min(1).max(8000),
  screenshots: z.array(z.string()).max(8).optional(),
});

router.post("/orders/:orderId/appeals", async (req, res) => {
  const userId = getAuthedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await assertEmailVerified(res, userId))) return;
  const orderId = parseInt(req.params.orderId, 10);
  if (Number.isNaN(orderId)) {
    res.status(400).json({ error: "Invalid order" });
    return;
  }
  const parsed = AppealBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", message: parsed.error.message });
    return;
  }
  try {
    await createP2pAppeal(orderId, userId, parsed.data.message, parsed.data.screenshots ?? []);
    res.status(201).json({ ok: true });
  } catch (e) {
    const { status, error } = mapErr(e);
    res.status(status).json({ error });
  }
});

export default router;
