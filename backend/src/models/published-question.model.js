import mongoose from "mongoose";
import Question from "./question.model.js";
const schema = Question.schema.clone();
schema.add({ release: { type: String, required: true, index: true }, sourceQuestionId: mongoose.Schema.Types.ObjectId });
schema.index({ examId: 1, release: 1, displayOrder: 1 });
export default mongoose.model("PublishedQuestion", schema);
