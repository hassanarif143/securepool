import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import poolsRouter from "./pools";
import transactionsRouter from "./transactions";
import winnersRouter from "./winners";
import adminRouter from "./admin";
import referralRouter from "./referral";
import reviewsRouter from "./reviews";
import tierRouter from "./tier";
import notificationsRouter from "./notifications";
import statsRouter from "./stats";
import userWalletRouter from "./userWallet";
import activityRouter from "./activity";
import engagementRouter from "./engagement";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/stats", statsRouter);
router.use("/activity", activityRouter);
router.use("/engagement", engagementRouter);
router.use("/auth", authRouter);
router.use("/user", userWalletRouter);
router.use("/users", usersRouter);
router.use("/pools", poolsRouter);
router.use("/transactions", transactionsRouter);
router.use("/winners", winnersRouter);
router.use("/dashboard", adminRouter);
router.use("/admin", adminRouter);
router.use("/referral", referralRouter);
router.use("/reviews", reviewsRouter);
router.use("/tier", tierRouter);
router.use("/notifications", notificationsRouter);

export default router;
