import Exam from "../models/exam.model.js";
import User from "../models/user.model.js";
import Question from "../models/question.model.js";
import Attempt from "../models/attempt.model.js";
import AccessRequest from "../models/access-request.model.js";
import Result from "../models/result.model.js";
export async function analytics(request, response) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - 13);
  const match = { status: { $ne: "PREPARING" }, createdAt: { $gte: since } };
  const [activity, popular, requests, active] = await Promise.all([
    Attempt.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "UTC",
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Attempt.aggregate([
      { $match: match },
      { $group: { _id: "$examId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "exams",
          localField: "_id",
          foreignField: "_id",
          as: "exam",
        },
      },
      {
        $project: {
          count: 1,
          title: {
            $ifNull: [{ $arrayElemAt: ["$exam.title", 0] }, "Archived exam"],
          },
        },
      },
    ]),
    AccessRequest.aggregate([
      {
        $group: {
          _id: {
            $cond: [
              {
                $and: [
                  { $eq: ["$status", "APPROVED"] },
                  { $lte: ["$accessExpiresAt", new Date()] },
                ],
              },
              "EXPIRED",
              "$status",
            ],
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Attempt.distinct("userId", match),
  ]);
  response.json({
    activity: Array.from({ length: 14 }, (_, i) => {
      const day = new Date(since);
      day.setUTCDate(day.getUTCDate() + i);
      const date = day.toISOString().slice(0, 10);
      return {
        date,
        count: activity.find((row) => row._id === date)?.count || 0,
      };
    }),
    popular,
    requests: requests.map((row) => ({ label: row._id, count: row.count })),
    activeLearners: active.length,
  });
}
export async function overview(request, response) {
  const [students, exams, questions, pending, attempts] = await Promise.all([
    User.countDocuments({ role: "STUDENT" }),
    Exam.countDocuments({ status: "PUBLISHED" }),
    Question.countDocuments({ isActive: true }),
    AccessRequest.countDocuments({ status: "PENDING" }),
    Attempt.countDocuments({ status: { $ne: "PREPARING" } }),
  ]);
  response.json({ students, exams, questions, pending, attempts });
}
export async function results(request, response) {
  const page = Math.max(1, Math.floor(Number(request.query.page) || 1));
  const [items, total] = await Promise.all([
    Result.find()
      .populate("userId", "firstName lastName email")
      .populate("examId", "title")
      .sort({ createdAt: -1 })
      .skip((page - 1) * 25)
      .limit(25)
      .lean(),
    Result.countDocuments(),
  ]);
  response.json({ items, total, page });
}
