import mongoose from "mongoose";
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  key: { type: String, required: true, unique: true },
  subcategories: { type: [new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    key: { type: String, required: true },
  }, { _id: false })], default: [] },
}, { timestamps: true });
export default mongoose.model("Category", schema);
