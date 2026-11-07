import mongoose from "mongoose";

const schema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  subcategory: { type: String, default: "", maxlength: 100 },
  templateId: { type: Number, unique: true, sparse: true },
  importSourceHash: { type: String, default: undefined },
  importSourceNumber: { type: Number, default: undefined },
  sourceReview: {
    status: { type: String, enum: ["PENDING", "CONFIRMED"], default: undefined },
    notes: { type: [String], default: undefined },
    sourcePages: { type: [Number], default: undefined },
    confirmedAt: { type: Date, default: undefined },
  },
  draft: { type: mongoose.Schema.Types.Mixed, required: true },
  published: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
  publishedAt: Date,
}, { timestamps: true, minimize: false });
schema.index({ importSourceHash: 1, importSourceNumber: 1 }, { unique: true, partialFilterExpression: { importSourceHash: { $type: "string" } } });
export default mongoose.model("Lab", schema);
