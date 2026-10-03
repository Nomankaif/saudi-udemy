import mongoose from "mongoose";

const attemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    accessScope: {
      type: String,
      enum: ["FREE_PREVIEW", "FULL_EXAM"],
      required: true,
    },
    mode: { type: String, enum: ["PRACTICE", "TIMED"], required: true },
    status: {
      type: String,
      enum: ["PREPARING", "IN_PROGRESS", "SUBMITTED", "EXPIRED"],
      default: "IN_PROGRESS",
      index: true,
    },
    startedAt: { type: Date, required: true },
    expiresAt: Date,
    submittedAt: Date,
    questionCount: { type: Number, default: 0 },
    examTitle: String,
    examSlug: String,
    lockedQuestions: [{ _id: false, number: Number, topic: String }],
    passingPercentage: { type: Number, default: 70 },
    revision: { type: Number, default: 0 },
    resultReady: { type: Boolean, default: false },
  },
  { timestamps: true },
);

attemptSchema.index({ userId: 1, examId: 1, createdAt: -1 });
export default mongoose.model("Attempt", attemptSchema);
