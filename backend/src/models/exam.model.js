import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true, index: true },
  shortDescription: { type: String, required: true },
  description: { type: String, default: "" },
  imageUrl: String,
  category: { type: String, required: true, index: true },
  subcategory: { type: String, default: "", maxlength: 100, index: true },
  questionCount: { type: Number, default: 0 },
  freeQuestionCount: { type: Number, default: 0 },
  durationMinutes: { type: Number, default: 60, min: 1, max: 1440 },
  validityDays: { type: Number, default: 365, min: 1 },
  featured: { type: Boolean, default: false, index: true },
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT", index: true },
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  passingPercentage: { type: Number, default: 70, min: 0, max: 100 },
  attemptSize: { type: Number, default: 60, min: 1, max: 1000 },
  publishedRelease: String,
  publishedAt: Date,
  hasUnpublishedChanges: { type: Boolean, default: true },
}, { timestamps: true });

examSchema.index({ title: "text", shortDescription: "text", category: "text" });
export default mongoose.model("Exam", examSchema);
