import mongoose from "mongoose";

const attemptQuestionSchema = new mongoose.Schema(
  {
    attemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attempt",
      required: true,
      index: true,
    },
    sourceQuestionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    text: { type: String, required: true },
    type: { type: String, required: true },
    options: [{ id: String, text: String }],
    pbq: { type: mongoose.Schema.Types.Mixed, default: undefined },
    pbqKey: { type: [{ _id: false, areaId: String, fieldId: String, values: [String], explanation: String }], default: [], select: false },
    correctOptionIds: { type: [String], required: true, select: false },
    dropTargets: { type: [{ _id: false, id: String, label: String, capacity: Number }], default: [] },
    correctPlacements: { type: [{ _id: false, itemId: String, targetId: String }], default: [], select: false },
    explanation: { type: String, default: "" },
    marks: { type: Number, default: 1 },
    negativeMarks: { type: Number, default: 0 },
    displayOrder: { type: Number, required: true },
    topic: { type: String, default: "General" },
    imageUrl: String,
    version: Number,
    navigatorNumber: Number,
    accessLevel: { type: String, enum: ["FREE", "PREMIUM"], default: "FREE" },
  },
  { timestamps: true },
);

attemptQuestionSchema.index(
  { attemptId: 1, displayOrder: 1 },
  { unique: true },
);
export default mongoose.model("AttemptQuestion", attemptQuestionSchema);
