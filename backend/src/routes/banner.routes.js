import { Router } from "express";
import { createBanner, listActiveBanners, listBanners, updateBanner } from "../controllers/banner.controller.js";
import { requireAdmin, requireAuth, requirePermission } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.get("/active", asyncHandler(listActiveBanners));
router.get("/", requireAuth, requireAdmin, requirePermission("banners.view"), asyncHandler(listBanners));
router.post("/", requireAuth, requireAdmin, requirePermission("banners.create"), asyncHandler(createBanner));
router.patch("/:id", requireAuth, requireAdmin, requirePermission("banners.edit"), asyncHandler(updateBanner));
export default router;
