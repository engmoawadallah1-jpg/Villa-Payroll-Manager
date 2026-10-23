import { Router, type IRouter } from "express";
import healthRouter from "./health";
import appStateRouter from "./appState";

const router: IRouter = Router();

router.use(healthRouter);
router.use(appStateRouter);

export default router;
