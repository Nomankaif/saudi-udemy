import mongoose from "mongoose";

const schema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, required: true },
  subcategory: { type: String, default: "", maxlength: 100 },
  templateId: { type: Number, unique: true, sparse: true },
  draft: { type: mongoose.Schema.Types.Mixed, required: true },
  published: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
  publishedAt: Date,
}, { timestamps: true, minimize: false });
export default mongoose.model("Lab", schema);
