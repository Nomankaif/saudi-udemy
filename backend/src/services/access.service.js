import AccessRequest from "../models/access-request.model.js";

export async function hasPremiumAccess(userId, examId) {
  const now = new Date();
  return Boolean(
    await AccessRequest.exists({
      userId,
      examId,
      status: "APPROVED",
      $and: [
        { $or: [{ accessStartsAt: null }, { accessStartsAt: { $lte: now } }] },
        { $or: [{ accessExpiresAt: null }, { accessExpiresAt: { $gt: now } }] },
      ],
    }),
  );
}
