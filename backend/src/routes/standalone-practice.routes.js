import { Router } from "express";
import * as controller from "../controllers/standalone-practice.controller.js";
import * as dragImport from "../controllers/drag-drop-import.controller.js";
import * as dragBank from "../controllers/drag-drop-bank.controller.js";
import multer from "multer";
import { requireAuth, requireAdmin, requirePermission } from "../middleware/auth.middleware.js";
import { asyncHandler as wrap } from "../utils/async-handler.js";

const router = Router();
const admin = permission => [requireAuth, requireAdmin, requirePermission(permission)];
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.get("/drag-drop/admin/import/template", ...admin("questions.import"), dragImport.downloadDragDropTemplate);
router.post("/drag-drop/admin/imports", ...admin("questions.import"), importUpload.single("file"), wrap(dragImport.startDragDropImport));
router.get("/drag-drop/admin/imports/:id", ...admin("questions.import"), wrap(dragImport.getDragDropImport));
router.get("/drag-drop/admin/imports/:id/pages/:page", ...admin("questions.import"), wrap(dragImport.getDragDropSourcePage));
router.patch("/drag-drop/admin/imports/:id/candidates/:index", ...admin("questions.import"), wrap(dragImport.updateDragDropCandidate));
router.post("/drag-drop/admin/imports/:id/candidates/:index/crop", ...admin("questions.import"), wrap(dragImport.cropDragDropExhibit));
router.post("/drag-drop/admin/imports/:id/commit", ...admin("questions.import"), wrap(dragImport.commitDragDropImport));

router.post("/drag-drop/admin/banks", ...admin("questions.create"), wrap(dragBank.createDragDropBank));
router.patch("/drag-drop/admin/:id/settings", ...admin("questions.edit"), wrap(dragBank.updateDragDropBank));
router.get("/drag-drop/admin/:id/questions", ...admin("questions.view"), wrap(dragBank.listDragDropBankQuestions));
router.post("/drag-drop/admin/:id/questions", ...admin("questions.create"), wrap(dragBank.addDragDropBankQuestion));
router.patch("/drag-drop/admin/:id/questions/:questionId", ...admin("questions.edit"), wrap(dragBank.updateDragDropBankQuestion));
router.delete("/drag-drop/admin/:id/questions/:questionId", ...admin("questions.edit"), wrap(dragBank.deleteDragDropBankQuestion));
router.post("/drag-drop/admin/:id/publish-bank", ...admin("questions.edit"), wrap(dragBank.publishDragDropBank));

router.get("/:kind", wrap(controller.listPublicPractice));
router.get("/:kind/admin", ...admin("questions.view"), wrap(controller.listAdminPractice));
router.post("/:kind/admin", ...admin("questions.create"), wrap(controller.createPractice));
router.get("/:kind/admin/:id", ...admin("questions.view"), wrap(controller.getAdminPractice));
router.patch("/:kind/admin/:id", ...admin("questions.edit"), wrap(controller.updatePractice));
router.post("/:kind/admin/:id/publish", ...admin("questions.edit"), wrap(controller.publishPractice));
router.post("/:kind/admin/:id/retire", ...admin("questions.edit"), wrap(controller.retirePractice));
router.delete("/:kind/admin/:id", ...admin("questions.edit"), wrap(controller.deletePractice));
router.get("/:kind/:id", wrap(controller.getPublicPractice));
router.post("/:kind/:id/submit", wrap(controller.submitPractice));

export default router;
