import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    liked: { type: Boolean, default: false },
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, maxlength: 2000, default: "" },
    reviewedAt: Date,
  },
  { timestamps: true },
);
schema.index({ examId: 1, userId: 1 }, { unique: true });
export default mongoose.model("ExamFeedback", schema);
