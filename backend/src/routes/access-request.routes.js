import { Router } from "express";
import { createAccessRequest, listAccessRequests, listMyRequests, reviewAccessRequest } from "../controllers/access-request.controller.js";
import { requireAdmin, requireAuth, requirePermission } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.use(requireAuth);
router.post("/", asyncHandler(createAccessRequest));
router.get("/mine", asyncHandler(listMyRequests));
router.get("/", requireAdmin, requirePermission("access.view"), asyncHandler(listAccessRequests));
router.patch("/:id/review", requireAdmin, requirePermission("access.review"), asyncHandler(reviewAccessRequest));
export default router;
