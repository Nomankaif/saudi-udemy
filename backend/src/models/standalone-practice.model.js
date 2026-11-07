import mongoose from "mongoose";

const practiceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, default: "", index: true },
  subcategory: { type: String, default: "" },
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "INACTIVE"], default: "DRAFT", index: true },
  draftQuestion: { type: mongoose.Schema.Types.Mixed, required: true },
  shortDescription: { type: String, default: "" },
  description: { type: String, default: "" },
  imageUrl: { type: String, default: "" },
  publishedQuestion: { type: mongoose.Schema.Types.Mixed, default: undefined },
  publishedQuestions: { type: [mongoose.Schema.Types.Mixed], default: undefined },
  publishedTitle: { type: String, default: "" },
  publishedCategory: { type: String, default: "" },
  publishedSubcategory: { type: String, default: "" },
  hasUnpublishedChanges: { type: Boolean, default: true },
  publishedAt: Date,
  importSourceHash: { type: String, default: undefined },
  importSourceNumber: { type: Number, default: undefined },
  importReviewConfirmed: { type: Boolean, default: true },
}, { timestamps: true });

practiceSchema.index({ status: 1, publishedAt: -1 });
practiceSchema.index({ importSourceHash: 1, importSourceNumber: 1 }, { unique: true, partialFilterExpression: { importSourceHash: { $type: "string" } } });

export const DragDropPractice = mongoose.model("DragDropPractice", practiceSchema);
export const PerformancePractice = mongoose.model("PerformancePractice", practiceSchema);
