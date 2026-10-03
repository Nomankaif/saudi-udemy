import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  mobile: { type: String, unique: true, sparse: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["STUDENT", "ADMIN", "SUB_ADMIN"], default: "STUDENT", index: true },
  permissions: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },
  refreshTokenHash: { type: String, select: false },
}, { timestamps: true });

export default mongoose.model("User", userSchema);
