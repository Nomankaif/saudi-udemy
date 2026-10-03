import { Router } from "express";
import { getAttemptQuestions, getHistory, getResult, saveAnswer, startAttempt, submitAttempt, revealAnswer } from "../controllers/attempt.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";

const router = Router();
router.use(requireAuth);
router.post("/", asyncHandler(startAttempt));
router.get("/history", asyncHandler(getHistory));
router.get("/:id/questions", asyncHandler(getAttemptQuestions));
router.put("/:id/answers/:questionId", asyncHandler(saveAnswer));
router.get("/:id/explanation/:questionId", asyncHandler(revealAnswer));
router.post("/:id/submit", asyncHandler(submitAttempt));
router.get("/:id/result", asyncHandler(getResult));
export default router;
