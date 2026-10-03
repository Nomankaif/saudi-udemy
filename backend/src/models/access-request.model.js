import mongoose from "mongoose";

const accessRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "REVOKED", "EXPIRED"], default: "PENDING", index: true },
  userMessage: String,
  adminNote: String,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  accessStartsAt: Date,
  accessExpiresAt: Date,
}, { timestamps: true });

accessRequestSchema.index({ userId: 1, examId: 1, status: 1 });
accessRequestSchema.index({ userId: 1, examId: 1 }, { unique: true, partialFilterExpression: { status: "PENDING" } });
export default mongoose.model("AccessRequest", accessRequestSchema);
