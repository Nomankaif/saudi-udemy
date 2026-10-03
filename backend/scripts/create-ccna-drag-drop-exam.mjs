import "../src/config/env.js";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import Exam from "../src/models/exam.model.js";
import Question from "../src/models/question.model.js";
import { validateClassification } from "../src/services/category.service.js";
import { questionErrors } from "../src/services/question-validation.js";
import { CCNA_DRAG_DROP_EXAM as definition, CCNA_DRAG_DROP_QUESTIONS as questions } from "../src/simulation/ccna-drag-drop-exam.js";

for (const question of questions) {
  const errors = questionErrors(question);
  if (errors.length) throw new Error(`Question ${question.displayOrder}: ${errors.join("; ")}`);
}
console.log(JSON.stringify({ title: definition.title, questions: questions.length, valid: true }));
if (!process.argv.includes("--save")) {
  console.log("Validation only. Use --save to create the draft exam; nothing is published.");
} else {
  try {
    await connectDatabase();
    const existing = await Exam.findOne({ slug: definition.slug });
    if (existing) {
      console.log(JSON.stringify({ created: false, id: existing.id, status: existing.status, questions: await Question.countDocuments({ examId: existing._id, isActive: true }), message: "Existing exam retained without changes." }));
    } else {
      const classification = await validateClassification(definition.category, definition.subcategory);
      const exam = new Exam({ ...definition, ...classification });
      const documents = questions.map(question => new Question({ ...question, examId: exam._id }));
      await exam.validate();
      await Promise.all(documents.map(question => question.validate()));
      await exam.save();
      await Question.insertMany(documents);
      const saved = await Question.find({ examId: exam._id }).select("+correctPlacements +correctOptionIds").lean();
      if (saved.length !== questions.length || saved.some(question => questionErrors(question).length)) {
        throw new Error(`Draft ${exam.id} needs review: saved questions did not pass verification.`);
      }
      console.log(JSON.stringify({ created: true, id: exam.id, title: exam.title, category: exam.category, subcategory: exam.subcategory, status: exam.status, questions: saved.length, adminPath: `/admin/exams/${exam.id}` }));
    }
  } finally { await mongoose.disconnect(); }
}
