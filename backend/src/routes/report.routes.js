import { Router } from "express";
import {
  requireAuth,
  requireAdmin,
  requirePermission,
} from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  overview,
  results,
  analytics,
} from "../controllers/report.controller.js";
const router = Router();
router.use(requireAuth, requireAdmin);
router.get(
  "/overview",
  requirePermission("exams.view"),
  asyncHandler(overview),
);
router.get(
  "/analytics",
  requirePermission("exams.view"),
  asyncHandler(analytics),
);
router.get(
  "/results",
  requirePermission("results.view"),
  asyncHandler(results),
);
export default router;
