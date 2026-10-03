import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema({
  type: { type: String, enum: ["ANNOUNCEMENT", "HERO", "IMAGE", "POPUP"], required: true },
  title: { type: String, required: true },
  description: String,
  desktopImage: String,
  mobileImage: String,
  buttonText: String,
  buttonUrl: String,
  audience: { type: String, enum: ["EVERYONE", "GUESTS", "MEMBERS"], default: "EVERYONE" },
  dismissible: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  startsAt: Date,
  endsAt: Date,
  status: { type: String, enum: ["DRAFT", "PUBLISHED", "INACTIVE"], default: "DRAFT", index: true },
}, { timestamps: true });

bannerSchema.index({ status: 1, startsAt: 1, endsAt: 1, displayOrder: 1 });
export default mongoose.model("Banner", bannerSchema);
