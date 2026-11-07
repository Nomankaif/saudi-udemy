import { randomUUID } from "node:crypto";
import Exam from "../models/exam.model.js";
import PublishedQuestion from "../models/published-question.model.js";
import { DragDropPractice } from "../models/standalone-practice.model.js";
import { normalizeQuestion } from "./question-validation.js";

export const dragDropExamSlug = (id) => `drag-drop-${id}`;

export async function syncDragDropExam(bank, questions, publishedAt = new Date()) {
  const existing = await Exam.findById(bank._id);
  if (existing && existing.sourceKind !== "DRAG_DROP_BANK") throw new Error("This Drag and Drop bank conflicts with an existing exam");

  const release = randomUUID();
  const examId = bank._id;
  await PublishedQuestion.insertMany(questions.map((question, index) => ({
    ...normalizeQuestion({ ...question, type: "DRAG_DROP", displayOrder: index + 1 }),
    examId,
    sourceQuestionId: question._id || examId,
    release,
  })));

  const fields = {
    title: bank.publishedTitle || bank.title,
    slug: dragDropExamSlug(examId),
    sourceKind: "DRAG_DROP_BANK",
    shortDescription: bank.shortDescription || "Practice interactive Drag and Drop questions.",
    description: bank.description || "",
    imageUrl: bank.imageUrl || "",
    category: bank.publishedCategory || bank.category,
    subcategory: bank.publishedSubcategory || bank.subcategory || "",
    questionCount: questions.length,
    freeQuestionCount: questions.filter(question => question.accessLevel !== "PREMIUM").length,
    durationMinutes: 60,
    validityDays: 365,
    attemptSize: Math.min(questions.length, 1000),
    status: "PUBLISHED",
    publishedRelease: release,
    publishedAt,
    hasUnpublishedChanges: false,
  };
  if (existing) {
    existing.set(fields);
    return existing.save();
  }
  return Exam.create({ _id: examId, ...fields });
}

export async function syncExistingDragDropExams() {
  const banks = await DragDropPractice.find({ status: "PUBLISHED" }).lean();
  for (const bank of banks) {
    if (await Exam.exists({ _id: bank._id, sourceKind: "DRAG_DROP_BANK" })) continue;
    const questions = bank.publishedQuestions?.length ? bank.publishedQuestions : bank.publishedQuestion ? [bank.publishedQuestion] : [];
    if (!questions.length) continue;
    await syncDragDropExam(bank, questions, bank.publishedAt || new Date());
  }
}
