import ExamFeedback from "../models/exam-feedback.model.js";
import Exam from "../models/exam.model.js";
import Attempt from "../models/attempt.model.js";
import { ApiError } from "../utils/api-error.js";
async function published(id) {
  const exam = await Exam.findOne({ _id: id, status: "PUBLISHED" });
  if (!exam) throw new ApiError(404, "Exam not found");
  return exam;
}
export async function listFeedback(req, res) {
  const exam = await published(req.params.id);
  const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
  const filter = { examId: exam._id, rating: { $exists: true } };
  const [reviews, summary, likes, attempts] = await Promise.all([
    ExamFeedback.find(filter)
      .select("rating comment reviewedAt userId")
      .populate("userId", "firstName lastName")
      .sort({ reviewedAt: -1, _id: -1 })
      .skip((page - 1) * 5)
      .limit(5)
      .lean(),
    ExamFeedback.aggregate([
      { $match: filter },
      {
        $group: { _id: null, rating: { $avg: "$rating" }, count: { $sum: 1 } },
      },
    ]),
    ExamFeedback.countDocuments({ examId: exam._id, liked: true }),
    Attempt.countDocuments({ examId: exam._id, status: { $ne: "PREPARING" } }),
  ]);
  res.json({
    reviews: reviews.map(({ userId, ...review }) => ({
      ...review,
      name: userId
        ? `${userId.firstName} ${userId.lastName}`.trim()
        : "Learner",
    })),
    rating: summary[0]?.rating || 0,
    count: summary[0]?.count || 0,
    likes,
    attempts,
    page,
  });
}
export async function myFeedback(req, res) {
  await published(req.params.id);
  res
    .set("Cache-Control", "no-store")
    .json(
      (await ExamFeedback.findOne({
        examId: req.params.id,
        userId: req.user.id,
      })
        .select("liked rating comment")
        .lean()) || { liked: false },
    );
}
export async function saveFeedback(req, res) {
  const exam = await published(req.params.id);
  const update = {};
  if (Object.hasOwn(req.body, "liked")) {
    if (typeof req.body.liked !== "boolean")
      throw new ApiError(400, "Like must be true or false");
    update.liked = req.body.liked;
  }
  if (Object.hasOwn(req.body, "rating")) {
    if (
      !Number.isInteger(req.body.rating) ||
      req.body.rating < 1 ||
      req.body.rating > 5
    )
      throw new ApiError(400, "Choose a rating from 1 to 5");
    if (
      typeof req.body.comment !== "string" ||
      req.body.comment.trim().length > 2000
    )
      throw new ApiError(400, "Comments must be at most 2000 characters");
    Object.assign(update, {
      rating: req.body.rating,
      comment: req.body.comment.trim(),
      reviewedAt: new Date(),
    });
  }
  if (!Object.keys(update).length)
    throw new ApiError(400, "Provide a like or review");
  const feedback = await ExamFeedback.findOneAndUpdate(
    { examId: exam._id, userId: req.user.id },
    { $set: update },
    { upsert: true, new: true, runValidators: true },
  );
  const [summary] = await ExamFeedback.aggregate([
    { $match: { examId: exam._id, rating: { $exists: true } } },
    { $group: { _id: null, rating: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  await Exam.updateOne(
    { _id: exam._id },
    {
      rating: Number((summary?.rating || 0).toFixed(1)),
      reviewCount: summary?.count || 0,
    },
  );
  res.json(feedback);
}
