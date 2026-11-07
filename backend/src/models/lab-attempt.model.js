import mongoose from "mongoose";

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  labId: { type: mongoose.Schema.Types.ObjectId, ref: "Lab", required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  states: { type: mongoose.Schema.Types.Mixed, required: true },
  mode: { type: String, enum: ["PRACTICE", "EXAM"], required: true },
  status: { type: String, enum: ["ACTIVE", "SUBMITTED"], default: "ACTIVE" },
  deadline: Date,
  submittedAt: Date,
  solutionViewed: { type: Boolean, default: false },
  transcript: { type: [mongoose.Schema.Types.Mixed], default: [] },
  result: mongoose.Schema.Types.Mixed,
  revision: { type: Number, default: 0 },
  currentExercise: { type: Number, default: 0 },
}, { timestamps: true, minimize: false });
schema.index({ status: 1, deadline: 1 });
export default mongoose.model("LabAttempt", schema);
