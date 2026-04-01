import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import poolsRouter from "./pools";
import transactionsRouter from "./transactions";
import winnersRouter from "./winners";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/pools", poolsRouter);
router.use("/transactions", transactionsRouter);
router.use("/winners", winnersRouter);
router.use("/dashboard", adminRouter);
router.use("/admin", adminRouter);

export default router;
