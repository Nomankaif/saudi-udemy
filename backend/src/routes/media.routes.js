import { Router } from "express";
import multer from "multer";
import { cloudStorage, mediaDirectory, safeFileName } from "../config/storage.js";
import { uploadImage, uploadCover } from "../controllers/media.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAdmin, requireAuth, requirePermission } from "../middleware/auth.middleware.js";

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const upload = multer({ storage: cloudStorage ? multer.memoryStorage() : multer.diskStorage({ destination: mediaDirectory, filename: (request, file, done) => done(null, safeFileName(file.originalname)) }), limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: (request, file, done) => done(null, allowed.has(file.mimetype)) });
const router = Router();
router.post("/pbq", requireAuth, requireAdmin, requirePermission(["questions.create", "questions.edit"]), multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single("file"), asyncHandler(uploadCover));
router.post("/covers", requireAuth, requireAdmin, requirePermission("exams.edit"), multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single("file"), asyncHandler(uploadCover));
router.post("/images", requireAuth, requireAdmin, requirePermission("media.create"), upload.single("file"), asyncHandler(async (request, response) => {
  if (request.file?.buffer) request.file.filename = safeFileName(request.file.originalname);
  await uploadImage(request, response);
}));
export default router;
