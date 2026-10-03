import AccessRequest from "../models/access-request.model.js";
import Exam from "../models/exam.model.js";
import { ApiError } from "../utils/api-error.js";

export async function createAccessRequest(request, response) {
  const { examId, userMessage } = request.body;
  if (!(await Exam.exists({ _id: examId, status: "PUBLISHED" })))
    throw new ApiError(404, "Exam not found");
  await expireRequests();
  if (
    await AccessRequest.exists({
      userId: request.user.id,
      examId,
      status: { $in: ["PENDING", "APPROVED"] },
    })
  )
    throw new ApiError(409, "An active request already exists");
  response
    .status(201)
    .json(
      await AccessRequest.create({
        userId: request.user.id,
        examId,
        userMessage,
      }),
    );
}

export async function listMyRequests(request, response) {
  await expireRequests();
  response.json(
    await AccessRequest.find({ userId: request.user.id })
      .populate("examId", "title slug")
      .sort({ createdAt: -1 })
      .lean(),
  );
}

export async function listAccessRequests(request, response) {
  await expireRequests();
  const filter = request.query.status ? { status: request.query.status } : {};
  response.json(
    await AccessRequest.find(filter)
      .populate("userId", "firstName lastName email mobile")
      .populate("examId", "title slug")
      .sort({ createdAt: -1 })
      .lean(),
  );
}

export async function reviewAccessRequest(request, response) {
  const item = await AccessRequest.findById(request.params.id);
  if (!item) throw new ApiError(404, "Access request not found");
  const { status, adminNote, accessStartsAt, accessExpiresAt } = request.body;
  if (!["APPROVED", "REJECTED", "REVOKED"].includes(status))
    throw new ApiError(400, "Invalid review status");
  if (status !== "REVOKED" && item.status !== "PENDING")
    throw new ApiError(409, "This request has already been reviewed");
  const exam = await Exam.findById(item.examId).lean();
  const starts = accessStartsAt ? new Date(accessStartsAt) : new Date();
  const ends = accessExpiresAt
    ? new Date(accessExpiresAt)
    : new Date(starts.getTime() + (exam?.validityDays || 30) * 86400000);
  if (
    status === "APPROVED" &&
    (!Number.isFinite(starts.getTime()) ||
      !Number.isFinite(ends.getTime()) ||
      ends <= starts ||
      ends <= new Date())
  )
    throw new ApiError(400, "Choose a future expiry after the start date");
  Object.assign(item, {
    status,
    adminNote,
    reviewedBy: request.user.id,
    reviewedAt: new Date(),
    accessStartsAt: accessStartsAt
      ? new Date(accessStartsAt)
      : status === "APPROVED"
        ? new Date()
        : undefined,
    accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : undefined,
  });
  if (status === "APPROVED") {
    item.accessStartsAt = starts;
    item.accessExpiresAt = ends;
  }
  await item.save();
  response.json(item);
}

async function expireRequests() {
  await AccessRequest.updateMany(
    { status: "APPROVED", accessExpiresAt: { $lte: new Date() } },
    { status: "EXPIRED" },
  );
}
