import mongoose from "mongoose";

const schema = new mongoose.Schema({
  filename: { type: String, required: true },
  sourcePath: { type: String, required: true },
  sourceHash: { type: String, required: true },
  sourceKind: { type: String, enum: ["pdf", "json"], required: true },
  category: { type: String, required: true },
  subcategory: { type: String, default: "" },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ["QUEUED", "PROCESSING", "READY", "FAILED"], default: "QUEUED", index: true },
  processedPages: { type: Number, default: 0 },
  totalPages: { type: Number, default: 0 },
  expectedItems: { type: Number, default: 0 },
  processedItems: { type: Number, default: 0 },
  candidates: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sourceExclusions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  inventoryIssues: { type: [String], default: [] },
  error: { type: String, default: "" },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
}, { timestamps: true });

export default mongoose.model("LabImport", schema);
