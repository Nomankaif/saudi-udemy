import mongoose from "mongoose";

const attemptAnswerSchema = new mongoose.Schema({
  attemptId: { type: mongoose.Schema.Types.ObjectId, ref: "Attempt", required: true, index: true },
  attemptQuestionId: { type: mongoose.Schema.Types.ObjectId, ref: "AttemptQuestion", required: true },
  pbqAnswers: { type: [{ _id: false, areaId: String, fieldId: String, values: [String] }], default: [] },
  selectedOptionIds: { type: [String], default: [] },
  placements: { type: [{ _id: false, itemId: String, targetId: String }], default: [] },
  markedForReview: { type: Boolean, default: false },
  savedAt: Date,
}, { timestamps: true });

attemptAnswerSchema.index({ attemptId: 1, attemptQuestionId: 1 }, { unique: true });
export default mongoose.model("AttemptAnswer", attemptAnswerSchema);
