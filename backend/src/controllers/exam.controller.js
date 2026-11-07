import { randomUUID } from "node:crypto";
import Exam from "../models/exam.model.js";
import Question from "../models/question.model.js";
import PublishedQuestion from "../models/published-question.model.js";
import { ApiError } from "../utils/api-error.js";
import { hasPremiumAccess } from "../services/access.service.js";
import { categoryName, validateClassification } from "../services/category.service.js";
import {
  normalizeQuestion,
  questionErrors,
} from "../services/question-validation.js";

export const pageOptions = (query) => ({
  page: Math.max(1, Math.floor(Number(query.page) || 1)),
  limit: Math.min(50, Math.max(1, Math.floor(Number(query.limit) || 25))),
});
const literal = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const examFields = [
  "title",
  "shortDescription",
  "description",
  "category",
  "subcategory",
  "imageUrl",
  "durationMinutes",
  "validityDays",
  "featured",
  "passingPercentage",
  "attemptSize",
];
const pickExam = (body) =>
  Object.fromEntries(
    examFields
      .filter((key) => body[key] !== undefined)
      .map((key) => [key, body[key]]),
  );
export async function listPublicExams(request, response) {
  const filter = { status: "PUBLISHED" };
  if (request.query.category) filter.category = request.query.category;
  if (request.query.q)
    filter.title = { $regex: literal(request.query.q), $options: "i" };
  response.json(
    await Exam.find(filter).sort({ featured: -1, createdAt: -1 }).lean(),
  );
}
export async function listAdminExams(request, response) {
  response.json(await Exam.find({ status: { $ne: "ARCHIVED" }, sourceKind: { $ne: "DRAG_DROP_BANK" } }).sort({ createdAt: -1 }).lean());
}
export async function deleteExam(request, response) {
  const exam = await Exam.findByIdAndUpdate(request.params.id, { $set: { status: "ARCHIVED" } }, { new: true });
  if (!exam) throw new ApiError(404, "Exam not found");
  response.json({ message: "Exam archived. Student attempts and results are preserved." });
}
export async function getAdminExam(request, response) {
  const exam = await Exam.findById(request.params.id).lean();
  if (!exam) throw new ApiError(404, "Exam not found");
  const draftCount = await Question.countDocuments({
    examId: exam._id,
    isActive: true,
  });
  const draftFree = await Question.countDocuments({
    examId: exam._id,
    isActive: true,
    accessLevel: "FREE",
  });
  response.json({ ...exam, draftCount, draftFree });
}
export async function getExamBySlug(request, response) {
  const exam = await Exam.findOne({
    slug: request.params.slug,
    status: "PUBLISHED",
  }).lean();
  if (!exam) throw new ApiError(404, "Exam not found");
  response.json(exam);
}
export async function createExam(request, response) {
  const title = typeof request.body.title === "string" ? request.body.title : "";
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "exam";
  const slug = `${base}-${randomUUID()}`;
  const classification = await validateClassification(request.body.category, request.body.subcategory);
  response
    .status(201)
    .json(await Exam.create({ ...pickExam(request.body), ...classification, slug, status: "DRAFT" }));
}
export async function updateExam(request, response) {
  const existing = await Exam.findById(request.params.id);
  if (!existing) throw new ApiError(404, "Exam not found");
  const category = request.body.category ?? existing.category;
  const changedCategory = categoryName(category).toLowerCase() !== categoryName(existing.category).toLowerCase();
  const classification = await validateClassification(category,
    request.body.subcategory ?? (changedCategory ? "" : existing.subcategory || ""),
    { allowUnassigned: !changedCategory && !existing.subcategory });
  const exam = await Exam.findByIdAndUpdate(
    request.params.id,
    { $set: { ...pickExam(request.body), ...classification, hasUnpublishedChanges: true } },
    { new: true, runValidators: true },
  );
  if (!exam) throw new ApiError(404, "Exam not found");
  response.json(exam);
}
export async function publishExam(request, response) {
  const exam = await Exam.findById(request.params.id);
  if (!exam) throw new ApiError(404, "Exam not found");
  const questions = await Question.find({ examId: exam.id, isActive: true })
    .select("+correctOptionIds +correctPlacements +pbqKey")
    .sort({ displayOrder: 1, _id: 1 })
    .lean();
  if (!questions.length)
    throw new ApiError(400, "Add at least one question before publishing");
  const errors = questions.flatMap((question, index) =>
    questionErrors(question).map((message) => ({
      question: question.displayOrder || index + 1,
      questionId: String(question._id),
      questionText: question.text?.slice(0, 160) || "Untitled question",
      message,
    })),
  );
  if (errors.length) {
    const error = new ApiError(400, `Question ${errors[0].question}: ${errors[0].message}${errors.length > 1 ? ` (${errors.length - 1} more issue${errors.length === 2 ? "" : "s"}.)` : ""}`);
    error.details = errors;
    throw error;
  }
  const release = randomUUID();
  await PublishedQuestion.insertMany(
    questions.map(({ _id, ...question }) => ({
      ...question,
      sourceQuestionId: _id,
      release,
    })),
  );
  exam.status = "PUBLISHED";
  exam.publishedRelease = release;
  exam.publishedAt = new Date();
  exam.questionCount = questions.length;
  exam.freeQuestionCount = questions.filter(
    (question) => question.accessLevel === "FREE",
  ).length;
  exam.hasUnpublishedChanges = false;
  await exam.save();
  response.json(exam);
}
export async function unpublishExam(request, response) {
  response.json(
    await Exam.findByIdAndUpdate(
      request.params.id,
      { status: "DRAFT" },
      { new: true },
    ),
  );
}
export async function addQuestion(request, response) {
  if (!(await Exam.exists({ _id: request.params.id })))
    throw new ApiError(404, "Exam not found");
  const body = normalizeQuestion(request.body);
  if (!body.text)
    throw new ApiError(400, "Enter question text before saving a draft");
  if (!body.displayOrder)
    body.displayOrder =
      (
        await Question.findOne({ examId: request.params.id })
          .sort({ displayOrder: -1 })
          .lean()
      )?.displayOrder + 1 || 1;
  const question = await Question.create({
    ...body,
    examId: request.params.id,
  });
  await Exam.updateOne(
    { _id: request.params.id },
    { hasUnpublishedChanges: true },
  );
  response.status(201).json(question);
}
export async function updateQuestion(request, response) {
  const body = normalizeQuestion(request.body);
  if (!body.text) throw new ApiError(400, "Enter question text before saving");
  const question = await Question.findOneAndUpdate(
    { _id: request.params.questionId, examId: request.params.id },
    { $set: body, $inc: { version: 1 } },
    { new: true, runValidators: true },
  ).select("+correctOptionIds +correctPlacements +pbqKey");
  if (!question) throw new ApiError(404, "Question not found");
  await Exam.updateOne(
    { _id: request.params.id },
    { hasUnpublishedChanges: true },
  );
  response.json(question);
}
export async function deleteQuestion(request, response) {
  await Question.updateOne(
    { _id: request.params.questionId, examId: request.params.id },
    { isActive: false },
  );
  await Exam.updateOne(
    { _id: request.params.id },
    { hasUnpublishedChanges: true },
  );
  response.json({ success: true });
}
export async function bulkAccess(request, response) {
  const { ids, accessLevel } = request.body;
  if (
    !Array.isArray(ids) ||
    ids.length > 1000 ||
    !["FREE", "PREMIUM"].includes(accessLevel)
  )
    throw new ApiError(400, "Select questions and a valid access level");
  await Question.updateMany(
    { examId: request.params.id, _id: { $in: ids }, isActive: true },
    { $set: { accessLevel }, $inc: { version: 1 } },
  );
  await Exam.updateOne(
    { _id: request.params.id },
    { hasUnpublishedChanges: true },
  );
  response.json({ success: true });
}
export async function listAdminQuestions(request, response) {
  let { page, limit } = pageOptions(request.query);
  const filter = { examId: request.params.id, isActive: true };
  if (request.query.q)
    filter.text = { $regex: literal(request.query.q), $options: "i" };
  if (["FREE", "PREMIUM"].includes(request.query.access))
    filter.accessLevel = request.query.access;
  if (request.query.focus) {
    const focused = await Question.findOne({ ...filter, _id: request.query.focus }).lean();
    if (focused) {
      const before = await Question.countDocuments({ ...filter, $or: [{ displayOrder: { $lt: focused.displayOrder } }, { displayOrder: focused.displayOrder, _id: { $lt: focused._id } }] });
      page = Math.floor(before / limit) + 1;
    }
  }
  const [questions, total] = await Promise.all([
    Question.find(filter)
      .select("+correctOptionIds +correctPlacements +pbqKey")
      .sort({ displayOrder: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Question.countDocuments(filter),
  ]);
  response.json({ questions, total, page, limit });
}
export async function getAvailability(request, response) {
  const exam = await Exam.findOne({
    _id: request.params.id,
    status: "PUBLISHED",
  }).lean();
  if (!exam) throw new ApiError(404, "Exam not found");
  const premium = await hasPremiumAccess(request.user.id, exam._id);
  const filter = {
    examId: exam._id,
    release: exam.publishedRelease,
    ...(premium ? {} : { accessLevel: "FREE" }),
  };
  const topics = await PublishedQuestion.distinct("topic", filter);
  response.json({
    premium,
    available: await PublishedQuestion.countDocuments(filter),
    topics,
  });
}
