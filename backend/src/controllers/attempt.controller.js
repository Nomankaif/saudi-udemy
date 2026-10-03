import Attempt from "../models/attempt.model.js";
import AttemptAnswer from "../models/attempt-answer.model.js";
import AttemptQuestion from "../models/attempt-question.model.js";
import Exam from "../models/exam.model.js";
import PublishedQuestion from "../models/published-question.model.js";
import Result from "../models/result.model.js";
import { hasPremiumAccess } from "../services/access.service.js";
import { finalize, withAttemptLock } from "../services/attempt.service.js";
import { pageOptions } from "./exam.controller.js";
import { ApiError } from "../utils/api-error.js";
import { validatePbqAnswers, gradePbq } from "../services/pbq.service.js";
import { validatePlacements } from "../services/drag-drop.service.js";

async function owned(request, active = false) {
  const attempt = await Attempt.findOne({
    _id: request.params.id,
    userId: request.user.id,
  });
  if (!attempt) throw new ApiError(404, "Attempt not found");
  if (
    attempt.status === "IN_PROGRESS" &&
    attempt.expiresAt &&
    attempt.expiresAt <= new Date()
  ) {
    await finalize(attempt);
    attempt.status = "EXPIRED";
  }
  if (active && attempt.status !== "IN_PROGRESS")
    throw new ApiError(409, "This attempt has ended. View your results.");
  if (
    attempt.accessScope === "FULL_EXAM" &&
    !(await hasPremiumAccess(request.user.id, attempt.examId))
  )
    throw new ApiError(
      403,
      "Premium access has expired or was revoked. Request access again to continue.",
    );
  return attempt;
}
export async function startAttempt(request, response) {
  const { examId, mode, topic } = request.body;
  if (!["PRACTICE", "TIMED"].includes(mode))
    throw new ApiError(400, "Choose practice or timed mode");
  const exam = await Exam.findOne({ _id: examId, status: "PUBLISHED" }).lean();
  if (!exam) throw new ApiError(404, "Exam not found");
  const durationMinutes = request.body.durationMinutes ?? exam.durationMinutes;
  if (mode === "TIMED" && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440))
    throw new ApiError(400, "Choose a whole-number time limit between 1 and 1440 minutes");
  const premium = await hasPremiumAccess(request.user.id, examId);
  const outline = await PublishedQuestion.find({
    examId,
    release: exam.publishedRelease,
    ...(mode === "PRACTICE" && topic ? { topic } : {}),
  })
    .select("_id accessLevel topic")
    .sort({ displayOrder: 1, _id: 1 })
    .lean();
  const positions = new Map(outline.map((q, i) => [String(q._id), i + 1]));
  const filter = {
    examId,
    release: exam.publishedRelease,
    ...(premium ? {} : { accessLevel: "FREE" }),
    ...(mode === "PRACTICE" && topic ? { topic } : {}),
  };
  let questions = await PublishedQuestion.find(filter)
    .select("+correctOptionIds +correctPlacements +pbqKey")
    .sort({ displayOrder: 1, _id: 1 })
    .lean();
  if (!questions.length)
    throw new ApiError(
      400,
      "No accessible questions in this selection. Request premium access or choose another topic.",
    );
  const startedAt = new Date();
  const attempt = await Attempt.create({
    userId: request.user.id,
    examId,
    examTitle: exam.title,
    examSlug: exam.slug,
    lockedQuestions: premium
      ? []
      : outline.flatMap((q, i) =>
          q.accessLevel === "PREMIUM"
            ? [
                {
                  number:
                    mode === "PRACTICE"
                      ? i + 1
                      : questions.length +
                        outline
                          .slice(0, i + 1)
                          .filter((item) => item.accessLevel === "PREMIUM")
                          .length,
                  topic: q.topic,
                },
              ]
            : [],
        ),
    passingPercentage: exam.passingPercentage,
    accessScope: premium ? "FULL_EXAM" : "FREE_PREVIEW",
    mode,
    status: "PREPARING",
    startedAt,
    questionCount: questions.length,
  });
  try {
    await AttemptQuestion.insertMany(
      questions.map((q, i) => ({
        attemptId: attempt.id,
        sourceQuestionId: q.sourceQuestionId,
        text: q.text,
        type: q.type,
        options: q.options,
        correctOptionIds: q.correctOptionIds,
        dropTargets: q.dropTargets,
        correctPlacements: q.correctPlacements,
        pbq: q.pbq,
        pbqKey: q.pbqKey,
        explanation: q.explanation,
        marks: q.marks,
        negativeMarks: q.negativeMarks,
        displayOrder: i + 1,
        topic: q.topic,
        imageUrl: q.imageUrl,
        version: q.version,
        navigatorNumber:
          mode === "PRACTICE" ? positions.get(String(q._id)) : i + 1,
        accessLevel: q.accessLevel,
      })),
    );
    attempt.status = "IN_PROGRESS";
    attempt.startedAt = new Date();
    if (mode === "TIMED")
      attempt.expiresAt = new Date(attempt.startedAt.getTime() + durationMinutes * 60000);
    await attempt.save();
  } catch (error) {
    await AttemptQuestion.deleteMany({ attemptId: attempt.id });
    await Attempt.deleteOne({ _id: attempt.id });
    throw error;
  }
  response.status(201).json(attempt);
}
export async function getAttemptQuestions(request, response) {
  await withAttemptLock(request.params.id, async () => {
    const attempt = await owned(request);
    const { page, limit } = pageOptions(request.query);
    if (attempt.status !== "IN_PROGRESS") {
      response.json({
        attempt,
        questions: [],
        answers: [],
        progress: [],
        serverNow: new Date(),
      });
      return;
    }
    const questions = await AttemptQuestion.find({ attemptId: attempt.id })
      .select("-correctOptionIds -correctPlacements -pbqKey -explanation")
      .sort({ displayOrder: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    const allAnswers = await AttemptAnswer.find({
      attemptId: attempt.id,
    }).lean();
    const navigator = await AttemptQuestion.find({ attemptId: attempt.id })
      .select("_id displayOrder navigatorNumber accessLevel")
      .sort({ displayOrder: 1 })
      .lean();
    const map = new Map(
      allAnswers.map((answer) => [String(answer.attemptQuestionId), answer]),
    );
    const progress = navigator.map((q) => ({
      id: q._id,
      order: q.displayOrder,
      number: q.navigatorNumber || q.displayOrder,
      premium: q.accessLevel === "PREMIUM",
      answered: Boolean(map.get(String(q._id))?.selectedOptionIds.length || map.get(String(q._id))?.placements?.length || map.get(String(q._id))?.pbqAnswers?.some(a => a.values.length)),
      marked: Boolean(map.get(String(q._id))?.markedForReview),
    }));
    response.json({
      attempt,
      questions,
      answers: allAnswers.filter((answer) =>
        questions.some(
          (q) => String(q._id) === String(answer.attemptQuestionId),
        ),
      ),
      progress,
      serverNow: new Date(),
    });
  });
}
export async function saveAnswer(request, response) {
  await withAttemptLock(request.params.id, async () => {
    const attempt = await owned(request, true);
    const question = await AttemptQuestion.findOne({
      _id: request.params.questionId,
      attemptId: attempt.id,
    }).lean();
    if (!question) throw new ApiError(404, "Question not found");
    const pbq = question.type === "IMAGE_PBQ";
    const pbqAnswers = pbq ? validatePbqAnswers(question, request.body.pbqAnswers) : [];
    if (!pbq && request.body.pbqAnswers?.length) throw new ApiError(400, "This question does not accept PBQ answers");
    if (pbq && (request.body.selectedOptionIds?.length || request.body.placements?.length)) throw new ApiError(400, "Use image answer areas for this PBQ");
    const drag = question.type === "DRAG_DROP";
    const placements = drag ? validatePlacements(question, request.body.placements) : [];
    const selected = drag || pbq ? [] : request.body.selectedOptionIds;
    if (drag && request.body.selectedOptionIds?.length) throw new ApiError(400, "Use placements for drag-and-drop answers");
    if (!drag && request.body.placements?.length) throw new ApiError(400, "This question does not accept placements");
    if (
      !Array.isArray(selected) ||
      selected.length > (question.type === "MULTIPLE_CHOICE" ? question.options.length : 1) ||
      new Set(selected).size !== selected.length ||
      selected.some(
        (id) => !question.options.some((option) => option.id === id),
      )
    )
      throw new ApiError(400, question.type === "MULTIPLE_CHOICE" ? "Select valid options without duplicates" : "Select at most one valid option");
    if (attempt.expiresAt && attempt.expiresAt <= new Date()) {
      await finalize(attempt);
      throw new ApiError(409, "Attempt time has expired");
    }
    const answer = await AttemptAnswer.findOneAndUpdate(
      { attemptId: attempt.id, attemptQuestionId: question._id },
      {
        $set: {
          selectedOptionIds: selected,
          placements,
          pbqAnswers,
          markedForReview: Boolean(request.body.markedForReview),
          savedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    response.json(answer);
  });
}
export async function revealAnswer(request, response) {
  const attempt = await owned(request, true);
  if (attempt.mode !== "PRACTICE")
    throw new ApiError(
      403,
      "Explanations are available after submission in timed mode",
    );
  const question = await AttemptQuestion.findOne({
    _id: request.params.questionId,
    attemptId: attempt.id,
  })
    .select("+correctOptionIds +correctPlacements +pbqKey explanation")
    .lean();
  if (!question) throw new ApiError(404, "Question not found");
  response.json({
    correctOptionIds: question.correctOptionIds,
    correctPlacements: question.correctPlacements,
    pbqKey: question.pbqKey,
    explanation: question.explanation,
  });
}
export async function submitAttempt(request, response) {
  await withAttemptLock(request.params.id, async () =>
    response.json(await finalize(await owned(request))),
  );
}
export async function getHistory(request, response) {
  const attempts = await Attempt.find({
    userId: request.user.id,
    status: { $ne: "PREPARING" },
  })
    .populate("examId", "title slug")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  for (const item of attempts)
    if (
      item.status === "IN_PROGRESS" &&
      item.expiresAt &&
      item.expiresAt <= new Date()
    ) {
      await withAttemptLock(item._id, () =>
        Attempt.findById(item._id).then(finalize),
      );
      item.status = "EXPIRED";
    }
  const results = await Result.find({
    userId: request.user.id,
    attemptId: { $in: attempts.map((a) => a._id) },
  }).lean();
  response.json(
    attempts.map((attempt) => ({
      ...attempt,
      result: results.find(
        (result) => String(result.attemptId) === String(attempt._id),
      ),
    })),
  );
}
export async function getResult(request, response) {
  const attempt = await owned(request);
  if (attempt.status === "IN_PROGRESS")
    throw new ApiError(409, "Submit the attempt to see results");
  const result = await finalize(attempt);
  const { page, limit } = pageOptions(request.query);
  const questions = await AttemptQuestion.find({ attemptId: attempt.id })
    .select("+correctOptionIds +correctPlacements +pbqKey")
    .sort({ displayOrder: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  const answers = await AttemptAnswer.find({
    attemptId: attempt.id,
    attemptQuestionId: { $in: questions.map((q) => q._id) },
  }).lean();
  for (const q of questions) if (q.type === "IMAGE_PBQ") q.pbqGrade = gradePbq(q, answers.find(a => String(a.attemptQuestionId) === String(q._id))?.pbqAnswers || []);
  response.json({
    result,
    attempt,
    questions,
    answers,
    page,
    total: attempt.questionCount,
  });
}
