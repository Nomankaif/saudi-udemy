import Attempt from "../models/attempt.model.js";
import AttemptQuestion from "../models/attempt-question.model.js";
import AttemptAnswer from "../models/attempt-answer.model.js";
import Result from "../models/result.model.js";
import { scoreQuestions } from "./scoring.service.js";
import { ApiError } from "../utils/api-error.js";
// Serialize writes and submission per attempt in this single API process.
const locks = new Map();
export async function withAttemptLock(id, action) {
  const prior = locks.get(String(id)) || Promise.resolve();
  let release;
  const lock = new Promise((resolve) => {
    release = resolve;
  });
  locks.set(String(id), lock);
  await prior;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(String(id)) === lock) locks.delete(String(id));
  }
}
export async function finalize(attempt) {
  if (attempt.status === "PREPARING")
    throw new ApiError(409, "Attempt is still preparing");
  if (attempt.status === "IN_PROGRESS") {
    attempt =
      (await Attempt.findOneAndUpdate(
        { _id: attempt._id, status: "IN_PROGRESS" },
        {
          status:
            attempt.expiresAt && attempt.expiresAt <= new Date()
              ? "EXPIRED"
              : "SUBMITTED",
          submittedAt: new Date(),
        },
        { new: true },
      )) || (await Attempt.findById(attempt._id));
  }
  const [questions, answers] = await Promise.all([
    AttemptQuestion.find({ attemptId: attempt.id })
      .select("+correctOptionIds +correctPlacements +pbqKey")
      .lean(),
    AttemptAnswer.find({ attemptId: attempt.id }).lean(),
  ]);
  const score = scoreQuestions(questions, answers);
  const result = await Result.findOneAndUpdate(
    { attemptId: attempt.id },
    {
      $setOnInsert: {
        ...score,
        passed: score.percentage >= attempt.passingPercentage,
        userId: attempt.userId,
        examId: attempt.examId,
      },
    },
    { upsert: true, new: true },
  );
  await Attempt.updateOne({ _id: attempt.id }, { resultReady: true });
  return result;
}
export async function finalizeExpired() {
  const attempts = await Attempt.find({
    $or: [
      { status: "IN_PROGRESS", expiresAt: { $lte: new Date() } },
      { status: { $in: ["EXPIRED", "SUBMITTED"] }, resultReady: { $ne: true } },
    ],
  })
    .sort({ expiresAt: 1 })
    .limit(100);
  for (const attempt of attempts)
    await withAttemptLock(attempt.id, () => finalize(attempt));
}
