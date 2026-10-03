import mongoose from "mongoose";

const resultSchema = new mongoose.Schema({
  attemptId: { type: mongoose.Schema.Types.ObjectId, ref: "Attempt", required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
  score: { type: Number, default: 0 },
  maximumScore: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  incorrectCount: { type: Number, default: 0 },
  unansweredCount: { type: Number, default: 0 },
  passed: Boolean,
  topicResults: [{ topic: String, total: Number, correct: Number }],
}, { timestamps: true });

resultSchema.index({ userId: 1, examId: 1, createdAt: -1 });
export default mongoose.model("Result", resultSchema);
