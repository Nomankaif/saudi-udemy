import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true, index: true },
  type: { type: String, enum: ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "SCENARIO", "DRAG_DROP", "IMAGE_PBQ"], required: true },
  text: { type: String, required: true },
  options: [{ id: { type: String, required: true }, text: { type: String, default: "" } }],
  pbq: { type: mongoose.Schema.Types.Mixed, default: undefined },
  pbqKey: { type: [{ _id: false, areaId: String, fieldId: String, values: [String], explanation: String }], default: [], select: false },
  correctOptionIds: { type: [String], required: true, select: false },
  dropTargets: { type: [{ _id: false, id: String, label: String, capacity: Number }], default: [] },
  correctPlacements: { type: [{ _id: false, itemId: String, targetId: String }], default: [], select: false },
  explanation: { type: String, default: "" },
  accessLevel: { type: String, enum: ["FREE", "PREMIUM"], default: "FREE", index: true },
  marks: { type: Number, default: 1 },
  negativeMarks: { type: Number, default: 0 },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  topic: { type: String, default: "General" },
  difficulty: { type: String, enum: ["EASY", "MEDIUM", "HARD"], default: "MEDIUM" },
  imageUrl: { type: String, default: "" },
  version: { type: Number, default: 1 },
  importSourceHash: { type: String, default: undefined },
  importSourceNumber: { type: Number, default: undefined },
}, { timestamps: true });

questionSchema.index({ examId: 1, accessLevel: 1, displayOrder: 1 });
questionSchema.index({ examId: 1, importSourceHash: 1, importSourceNumber: 1 }, { unique: true, partialFilterExpression: { importSourceHash: { $type: "string" } } });
export default mongoose.model("Question", questionSchema);
