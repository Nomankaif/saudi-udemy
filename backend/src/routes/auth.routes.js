import { Router } from "express";
import { currentUser, login, logout, register, updateProfile } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { adminLogin, adminLogout, limitAdminLogin } from "../controllers/admin-auth.controller.js";
import { requireAdmin } from "../middleware/auth.middleware.js";

const router = Router();
router.post("/admin/login", limitAdminLogin, asyncHandler(adminLogin));
router.post("/admin/logout", adminLogout);
router.get("/admin/me", requireAuth, requireAdmin, (request, response) => response.set("Cache-Control", "no-store").json({ role: request.user.role }));
router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));
router.post("/logout", logout);
router.get("/me", requireAuth, currentUser);
router.patch("/me", requireAuth, asyncHandler(updateProfile));
export default router;
