import { Router } from "express";
import multer from "multer";
import { createBanner, deleteBanner, listActiveBanners, listBanners, updateBanner } from "../controllers/banner.controller.js";
import { uploadCover } from "../controllers/media.controller.js";
import { requireAdmin, requireAuth, requirePermission } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.get("/active", asyncHandler(listActiveBanners));
router.get("/", requireAuth, requireAdmin, requirePermission("banners.view"), asyncHandler(listBanners));
router.post("/", requireAuth, requireAdmin, requirePermission("banners.create"), asyncHandler(createBanner));
router.post("/image", requireAuth, requireAdmin, requirePermission(["banners.create", "banners.edit"]), multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single("file"), asyncHandler(uploadCover));
router.patch("/:id", requireAuth, requireAdmin, requirePermission("banners.edit"), asyncHandler(updateBanner));
router.delete("/:id", requireAuth, requireAdmin, requirePermission("banners.edit"), asyncHandler(deleteBanner));
export default router;
