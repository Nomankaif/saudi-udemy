import { DragDropPractice, PerformancePractice } from "../models/standalone-practice.model.js";
import Question from "../models/question.model.js";
import Exam from "../models/exam.model.js";
import { normalizeQuestion, questionErrors } from "../services/question-validation.js";
import { validateClassification, categoryName } from "../services/category.service.js";
import { validatePlacements } from "../services/drag-drop.service.js";
import { validatePbqAnswers, gradePbq } from "../services/pbq.service.js";
import { scoreQuestions } from "../services/scoring.service.js";
import { ApiError } from "../utils/api-error.js";

function practiceKind(kind) {
  if (kind === "drag-drop") return { Model: DragDropPractice, type: "DRAG_DROP" };
  if (kind === "performance-based") return { Model: PerformancePractice, type: "IMAGE_PBQ" };
  throw new ApiError(404, "Practice type not found");
}

function draftInput(body, type) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Enter question details");
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 160) throw new ApiError(400, "Enter a title up to 160 characters");
  if (typeof body.category !== "string" || categoryName(body.category).length > 100 || typeof body.subcategory !== "string" || categoryName(body.subcategory).length > 100)
    throw new ApiError(400, "Select a valid category and subcategory");
  const question = normalizeQuestion({ ...body.question, type });
  if (!question.text) throw new ApiError(400, "Enter the question before saving");
  return { title, category: categoryName(body.category), subcategory: categoryName(body.subcategory), draftQuestion: question };
}

function publicQuestion(question) {
  const { correctOptionIds, correctPlacements, pbqKey, explanation, ...visible } = question;
  return visible;
}

export async function listPublicPractice(request, response) {
  const { Model } = practiceKind(request.params.kind);
  const items = await Model.find({ status: "PUBLISHED" })
    .select("publishedTitle publishedCategory publishedSubcategory publishedAt publishedQuestion publishedQuestions imageUrl shortDescription")
    .sort({ publishedAt: -1, _id: -1 }).lean();
  response.json(items.map(item => ({ _id: item._id, title: item.publishedTitle, category: item.publishedCategory, subcategory: item.publishedSubcategory, publishedAt: item.publishedAt, prompt: item.publishedQuestion?.text || "", shortDescription: item.shortDescription || "", imageUrl: item.imageUrl || item.publishedQuestion?.imageUrl || "", questionCount: item.publishedQuestions?.length || Number(Boolean(item.publishedQuestion)) })));
}

export async function getPublicPractice(request, response) {
  const { Model } = practiceKind(request.params.kind);
  const item = await Model.findOne({ _id: request.params.id, status: "PUBLISHED" }).lean();
  if (!item?.publishedQuestion) throw new ApiError(404, "Practice question not found");
  const questions = request.params.kind === "drag-drop" ? item.publishedQuestions?.length ? item.publishedQuestions : [item.publishedQuestion] : [item.publishedQuestion];
  response.json({ _id: item._id, title: item.publishedTitle, category: item.publishedCategory, subcategory: item.publishedSubcategory, question: publicQuestion(questions[0]), ...(request.params.kind === "drag-drop" ? { questions: questions.map(publicQuestion) } : {}) });
}

export async function submitPractice(request, response) {
  const { Model, type } = practiceKind(request.params.kind);
  const item = await Model.findOne({ _id: request.params.id, status: "PUBLISHED" }).lean();
  if (!item?.publishedQuestion) throw new ApiError(404, "Practice question not found");
  const index = request.params.kind === "drag-drop" ? Number(request.body?.questionIndex ?? 0) : 0;
  const questions = request.params.kind === "drag-drop" && item.publishedQuestions?.length ? item.publishedQuestions : [item.publishedQuestion];
  if (!Number.isInteger(index) || index < 0 || index >= questions.length) throw new ApiError(400, "Choose a valid question in this bank");
  const question = questions[index];
  const answer = type === "DRAG_DROP"
    ? { placements: validatePlacements(question, request.body?.placements) }
    : { pbqAnswers: validatePbqAnswers(question, request.body?.pbqAnswers) };
  const score = scoreQuestions([{ ...question, _id: "practice-item" }], [{ attemptQuestionId: "practice-item", ...answer }]);
  response.json({
    ...score,
    explanation: question.explanation || "",
    ...(type === "DRAG_DROP"
      ? { correctPlacements: question.correctPlacements }
      : { pbqKey: question.pbqKey, pbqGrade: gradePbq(question, answer.pbqAnswers) }),
  });
}

export async function listAdminPractice(request, response) {
  const { Model } = practiceKind(request.params.kind);
  const items = await Model.find().select("title category subcategory status hasUnpublishedChanges createdAt publishedAt draftQuestion.text shortDescription description imageUrl").sort({ createdAt: -1 }).lean();
  if (request.params.kind !== "drag-drop") return response.json(items);
  const ids = items.map(item => item._id);
  const counts = ids.length ? await Question.aggregate([{ $match: { examId: { $in: ids }, type: "DRAG_DROP", isActive: true } }, { $group: { _id: "$examId", count: { $sum: 1 } } }]) : [];
  const byId = new Map(counts.map(entry => [String(entry._id), entry.count]));
  response.json(items.map(item => ({ ...item, draftCount: (byId.get(String(item._id)) || 0) + Number(Boolean(item.draftQuestion?.text?.trim())) })));
}

export async function getAdminPractice(request, response) {
  const { Model } = practiceKind(request.params.kind);
  const item = await Model.findById(request.params.id).lean();
  if (!item) throw new ApiError(404, "Practice question not found");
  response.json(item);
}

export async function createPractice(request, response) {
  const { Model, type } = practiceKind(request.params.kind);
  response.status(201).json(await Model.create(draftInput(request.body, type)));
}

export async function updatePractice(request, response) {
  const { Model, type } = practiceKind(request.params.kind);
  const input = draftInput(request.body, type);
  const item = await Model.findByIdAndUpdate(request.params.id, { $set: { ...input, hasUnpublishedChanges: true } }, { new: true, runValidators: true });
  if (!item) throw new ApiError(404, "Practice question not found");
  response.json(item);
}

export async function publishPractice(request, response) {
  const { Model } = practiceKind(request.params.kind);
  const item = await Model.findById(request.params.id).lean();
  if (!item) throw new ApiError(404, "Practice question not found");
  if (!item.importReviewConfirmed) throw new ApiError(400, "Review the imported question and answer key before publishing");
  const issues = questionErrors(item.draftQuestion);
  if (issues.length) throw new ApiError(400, `Fix the question before publishing: ${issues.join(" ")}`, issues);
  const classification = await validateClassification(item.category, item.subcategory);
  response.json(await Model.findByIdAndUpdate(item._id, {
    $set: { status: "PUBLISHED", publishedQuestion: item.draftQuestion, publishedTitle: item.title, publishedCategory: classification.category, publishedSubcategory: classification.subcategory, publishedAt: new Date(), hasUnpublishedChanges: false },
  }, { new: true, runValidators: true }));
}

export async function retirePractice(request, response) {
  const { Model } = practiceKind(request.params.kind);
  const item = await Model.findByIdAndUpdate(request.params.id, { $set: { status: "INACTIVE" } }, { new: true });
  if (!item) throw new ApiError(404, "Practice question not found");
  if (request.params.kind === "drag-drop") await Exam.updateOne({ _id: item._id, sourceKind: "DRAG_DROP_BANK" }, { $set: { status: "ARCHIVED" } });
  response.json(item);
}

export async function deletePractice(request, response) {
  const { Model } = practiceKind(request.params.kind);
  const item = await Model.findByIdAndDelete(request.params.id);
  if (!item) throw new ApiError(404, "Practice question not found");
  if (request.params.kind === "drag-drop") {
    await Exam.updateOne({ _id: item._id, sourceKind: "DRAG_DROP_BANK" }, { $set: { status: "ARCHIVED" } });
    await Question.deleteMany({ examId: item._id, type: "DRAG_DROP" });
  }
  response.json({ deleted: true });
}
