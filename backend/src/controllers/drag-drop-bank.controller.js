import { DragDropPractice } from "../models/standalone-practice.model.js";
import Question from "../models/question.model.js";
import { normalizeQuestion, questionErrors } from "../services/question-validation.js";
import { validateClassification } from "../services/category.service.js";
import { ApiError } from "../utils/api-error.js";
import { syncDragDropExam } from "../services/drag-drop-exam.service.js";

const questionSelect = "+correctPlacements +correctOptionIds +pbqKey";

async function bankById(id) {
  const bank = await DragDropPractice.findById(id);
  if (!bank) throw new ApiError(404, "Drag and Drop bank not found");
  return bank;
}

function coverUrl(value) {
  const url = String(value || "").trim();
  if (url && !/^\/uploads\/media\/[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(url)) throw new ApiError(400, "Upload a JPG, PNG or WebP cover image");
  return url;
}

export async function createDragDropBank(request, response) {
  const title = String(request.body?.title || "").trim();
  if (!title || title.length > 160) throw new ApiError(400, "Enter a title up to 160 characters");
  const classification = await validateClassification(request.body.category, request.body.subcategory);
  const bank = await DragDropPractice.create({
    title, ...classification,
    shortDescription: String(request.body.shortDescription || "").trim().slice(0, 500),
    description: String(request.body.description || "").trim().slice(0, 10000),
    imageUrl: coverUrl(request.body.imageUrl),
    draftQuestion: normalizeQuestion({ type: "DRAG_DROP", text: "", options: [], dropTargets: [], correctPlacements: [] }),
  });
  response.status(201).json(bank);
}

export async function updateDragDropBank(request, response) {
  const bank = await bankById(request.params.id);
  const title = String(request.body?.title || "").trim();
  if (!title || title.length > 160) throw new ApiError(400, "Enter a title up to 160 characters");
  const classification = await validateClassification(request.body.category, request.body.subcategory);
  bank.set({
    title, ...classification,
    shortDescription: String(request.body.shortDescription || "").trim().slice(0, 500),
    description: String(request.body.description || "").trim().slice(0, 10000),
    imageUrl: coverUrl(request.body.imageUrl),
    hasUnpublishedChanges: true,
  });
  await bank.save();
  response.json(bank);
}

export async function listDragDropBankQuestions(request, response) {
  const bank = await bankById(request.params.id);
  const children = await Question.find({ examId: bank._id, type: "DRAG_DROP", isActive: true }).select(questionSelect).sort({ displayOrder: 1, _id: 1 }).lean();
  const legacy = bank.draftQuestion?.text?.trim() ? [{ ...bank.draftQuestion, _id: bank._id, displayOrder: 1 }] : [];
  response.json({ questions: [...legacy, ...children], total: legacy.length + children.length });
}

export async function addDragDropBankQuestion(request, response) {
  const bank = await bankById(request.params.id);
  const question = normalizeQuestion({ ...request.body, type: "DRAG_DROP" });
  if (!question.text) throw new ApiError(400, "Enter question text before saving");
  const count = await Question.countDocuments({ examId: bank._id, type: "DRAG_DROP", isActive: true });
  const saved = await Question.create({ ...question, examId: bank._id, displayOrder: count + 1 + Number(Boolean(bank.draftQuestion?.text?.trim())) });
  bank.hasUnpublishedChanges = true;
  await bank.save();
  response.status(201).json(await Question.findById(saved._id).select(questionSelect).lean());
}

export async function updateDragDropBankQuestion(request, response) {
  const bank = await bankById(request.params.id);
  const question = normalizeQuestion({ ...request.body, type: "DRAG_DROP" });
  if (!question.text) throw new ApiError(400, "Enter question text before saving");
  if (String(bank._id) === request.params.questionId) {
    bank.draftQuestion = question;
    bank.hasUnpublishedChanges = true;
    await bank.save();
    return response.json({ ...question, _id: bank._id, displayOrder: 1 });
  }
  const saved = await Question.findOneAndUpdate({ _id: request.params.questionId, examId: bank._id, type: "DRAG_DROP", isActive: true }, { $set: question, $inc: { version: 1 } }, { new: true, runValidators: true }).select(questionSelect).lean();
  if (!saved) throw new ApiError(404, "Question not found in this bank");
  bank.hasUnpublishedChanges = true;
  await bank.save();
  response.json(saved);
}

export async function deleteDragDropBankQuestion(request, response) {
  const bank = await bankById(request.params.id);
  if (String(bank._id) === request.params.questionId) bank.draftQuestion = normalizeQuestion({ type: "DRAG_DROP", text: "", options: [], dropTargets: [], correctPlacements: [] });
  else {
    const result = await Question.updateOne({ _id: request.params.questionId, examId: bank._id, type: "DRAG_DROP" }, { isActive: false });
    if (!result.matchedCount) throw new ApiError(404, "Question not found in this bank");
  }
  bank.hasUnpublishedChanges = true;
  await bank.save();
  response.json({ deleted: true });
}

export async function publishDragDropBank(request, response) {
  const bank = await bankById(request.params.id);
  const children = await Question.find({ examId: bank._id, type: "DRAG_DROP", isActive: true }).select(questionSelect).sort({ displayOrder: 1, _id: 1 }).lean();
  const legacy = bank.draftQuestion?.text?.trim() ? [{ ...bank.draftQuestion, _id: bank._id }] : [];
  const questions = [...legacy, ...children];
  if (!questions.length) throw new ApiError(400, "Add or import at least one Drag and Drop question before publishing");
  const issues = questions.flatMap((question, index) => questionErrors(question).map(message => `Question ${index + 1}: ${message}`));
  if (issues.length) throw new ApiError(400, `Fix questions before publishing: ${issues.slice(0, 5).join("; ")}`, issues);
  await validateClassification(bank.category, bank.subcategory);
  const release = questions.map(question => normalizeQuestion({ ...question, type: "DRAG_DROP" }));
  bank.publishedQuestions = release;
  bank.publishedQuestion = release[0];
  bank.publishedTitle = bank.title;
  bank.publishedCategory = bank.category;
  bank.publishedSubcategory = bank.subcategory;
  bank.publishedAt = new Date();
  bank.status = "PUBLISHED";
  bank.hasUnpublishedChanges = false;
  await syncDragDropExam(bank, questions, bank.publishedAt);
  await bank.save();
  response.json({ _id: bank._id, count: questions.length, status: bank.status });
}
