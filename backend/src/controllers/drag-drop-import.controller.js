import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import DragDropImport from "../models/drag-drop-import.model.js";
import { DragDropPractice } from "../models/standalone-practice.model.js";
import Question from "../models/question.model.js";
import { writeImportSource, writeMedia } from "../services/blob-store.js";
import { validateClassification } from "../services/category.service.js";
import { normalizeQuestion } from "../services/question-validation.js";
import { candidateIssues, processNextDragDropImport, renderSourcePage } from "../services/drag-drop-import.service.js";
import { bulkImportIssues } from "../services/import-review.js";
import { ApiError } from "../utils/api-error.js";

const example = {
  title: "Match networking devices to their functions",
  text: "Drag each device to the correct function. One item is unused.",
  options: [{ id: "router", text: "Router" }, { id: "switch", text: "Switch" }, { id: "distractor", text: "Unused example" }],
  dropTargets: [{ id: "routes", label: "Connects networks", capacity: 1 }, { id: "frames", label: "Forwards Ethernet frames", capacity: 1 }],
  correctPlacements: [{ itemId: "router", targetId: "routes" }, { itemId: "switch", targetId: "frames" }],
  explanation: "The router connects networks; the switch forwards frames within a LAN.",
};

export function downloadDragDropTemplate(request, response) {
  response.attachment("drag-drop-template.json").json({ version: 1, questions: [example] });
}

export async function startDragDropImport(request, response) {
  const file = request.file;
  if (!file?.buffer) throw new ApiError(400, "Select a PDF or JSON file");
  const kind = path.extname(file.originalname).toLowerCase().slice(1);
  if (!["pdf", "json"].includes(kind)) throw new ApiError(400, "Select a PDF or JSON file");
  if (kind === "pdf" && file.buffer.subarray(0, 5).toString() !== "%PDF-") throw new ApiError(400, "The file is not a valid PDF");
  if (kind === "json" && file.size > 5 * 1024 * 1024) throw new ApiError(400, "JSON files must be 5 MB or smaller");
  const classification = await validateClassification(String(request.body.category || ""), String(request.body.subcategory || ""));
  const bankId = request.body.bankId ? String(request.body.bankId) : "";
  if (bankId) {
    const bank = await DragDropPractice.findById(bankId).lean();
    if (!bank) throw new ApiError(404, "Drag and Drop bank not found");
    if (bank.category !== classification.category || bank.subcategory !== classification.subcategory) throw new ApiError(400, "Use the bank's category and subcategory for this import");
  }
  const sourcePath = await writeImportSource(file.buffer, kind);
  const job = await DragDropImport.create({ filename: file.originalname.slice(0, 200), sourcePath, sourceHash: createHash("sha256").update(file.buffer).digest("hex"), sourceKind: kind, ...classification, ownerId: request.user._id, ...(bankId ? { bankId } : {}) });
  void processNextDragDropImport();
  response.status(202).json({ id: job._id, status: job.status });
}

async function readyJob(id) {
  const job = await DragDropImport.findById(id);
  if (!job) throw new ApiError(404, "Import not found");
  if (job.status !== "READY") throw new ApiError(409, "Wait for extraction to finish");
  return job;
}

export async function getDragDropImport(request, response) {
  const job = await DragDropImport.findById(request.params.id).lean();
  if (!job) throw new ApiError(404, "Import not found");
  response.json({ id: job._id, filename: job.filename, sourceKind: job.sourceKind, category: job.category, subcategory: job.subcategory, bankId: job.bankId, status: job.status, error: job.error, processedPages: job.processedPages, totalPages: job.totalPages, expectedItems: job.expectedItems, candidates: job.status === "READY" ? job.candidates : [] });
}

export async function getDragDropSourcePage(request, response) {
  const job = await DragDropImport.findById(request.params.id).lean();
  if (!job || job.sourceKind !== "pdf") throw new ApiError(404, "PDF import not found");
  const page = Number(request.params.page);
  if (!Number.isInteger(page) || page < 1 || page > (job.totalPages || 300)) throw new ApiError(400, "Invalid page number");
  response.set("Cache-Control", "private, no-store");
  response.type("png").send(await renderSourcePage(job.sourcePath, page));
}

export async function updateDragDropCandidate(request, response) {
  const job = await readyJob(request.params.id), index = Number(request.params.index);
  const old = job.candidates[index];
  if (!Number.isInteger(index) || !old) throw new ApiError(404, "Question row not found");
  const body = request.body || {};
  const question = normalizeQuestion({ ...old.question, ...body.question, type: "DRAG_DROP", accessLevel: "FREE" });
  const candidate = { ...old, title: typeof body.title === "string" ? body.title.trim().slice(0, 160) : old.title, question, sourceErrors: job.sourceKind === "json" || old.sourcePages?.length ? [] : old.sourceErrors, reviewed: false };
  candidate.errors = candidateIssues(candidate);
  if (body.reviewed && !candidate.errors.length) candidate.reviewed = true;
  job.candidates[index] = candidate;
  job.markModified("candidates");
  await job.save();
  response.json(candidate);
}

export async function cropDragDropExhibit(request, response) {
  const job = await readyJob(request.params.id), index = Number(request.params.index);
  const candidate = job.candidates[index];
  if (!Number.isInteger(index) || !candidate || job.sourceKind !== "pdf") throw new ApiError(404, "PDF question row not found");
  const page = Number(request.body.page || candidate.exhibitPage), rect = request.body.rect;
  if (!candidate.sourcePages.includes(page) || candidate.answerPages?.includes(page) || !rect || ![rect.left, rect.top, rect.width, rect.height].every(value => Number.isFinite(value) && value >= 0 && value <= 1) || rect.width < 0.05 || rect.height < 0.05 || rect.left + rect.width > 1 || rect.top + rect.height > 1)
    throw new ApiError(400, "Choose an exhibit region within this question's source page");
  const png = await renderSourcePage(job.sourcePath, page, 1600), meta = await sharp(png).metadata();
  const left = Math.floor(rect.left * meta.width), top = Math.floor(rect.top * meta.height);
  const width = Math.min(meta.width - left, Math.floor(rect.width * meta.width)), height = Math.min(meta.height - top, Math.floor(rect.height * meta.height));
  const crop = await sharp(png).extract({ left, top, width, height }).png().toBuffer();
  const filename = `drag-exhibit-${randomUUID()}.png`;
  await writeMedia(filename, crop, "image/png");
  candidate.question.imageUrl = `/uploads/media/${filename}`;
  candidate.exhibitRect = rect;
  candidate.exhibitPage = page;
  candidate.reviewed = false;
  job.markModified("candidates");
  await job.save();
  response.json(candidate);
}

export async function commitDragDropImport(request, response) {
  const job = await readyJob(request.params.id), selected = request.body?.selected;
  if (!Array.isArray(selected) || !selected.length || selected.length > 200 || selected.some(index => !Number.isInteger(index) || index < 0 || index >= job.candidates.length) || new Set(selected).size !== selected.length)
    throw new ApiError(400, "Select between 1 and 200 distinct rows");
  const classification = await validateClassification(job.category, job.subcategory);
  const candidates = selected.map(index => job.candidates[index]);
  const confirmReview = request.body?.confirmReview === true;
  const problems = bulkImportIssues(candidates, "Question", confirmReview, candidateIssues);
  if (problems.length) throw new ApiError(400, problems.slice(0, 10).join("; "));
  if (job.bankId) {
    const bank = await DragDropPractice.findById(job.bankId);
    if (!bank) throw new ApiError(404, "Drag and Drop bank not found");
    const duplicate = await Question.findOne({ examId: bank._id, importSourceHash: job.sourceHash, importSourceNumber: { $in: candidates.map(candidate => candidate.sourceNumber) } }).select("importSourceNumber").lean();
    if (duplicate) throw new ApiError(409, `Source question ${duplicate.importSourceNumber} was already imported into this bank`);
    const last = await Question.findOne({ examId: bank._id, type: "DRAG_DROP" }).sort({ displayOrder: -1 }).select("displayOrder").lean();
    const firstOrder = Math.max(last?.displayOrder || 0, Number(Boolean(bank.draftQuestion?.text?.trim())));
    try { await Question.insertMany(candidates.map((candidate, index) => ({ ...candidate.question, examId: bank._id, type: "DRAG_DROP", displayOrder: firstOrder + index + 1, importSourceHash: job.sourceHash, importSourceNumber: candidate.sourceNumber })), { ordered: true }); }
    catch (error) { if (error.code === 11000) throw new ApiError(409, "These source questions were already imported into this bank"); throw error; }
    bank.hasUnpublishedChanges = true;
    await bank.save();
    return response.json({ imported: candidates.length, bankId: bank._id });
  }
  const duplicate = await DragDropPractice.findOne({ importSourceHash: job.sourceHash, importSourceNumber: { $in: candidates.map(candidate => candidate.sourceNumber) } }).select("importSourceNumber").lean();
  if (duplicate) throw new ApiError(409, `Source question ${duplicate.importSourceNumber} was already imported`);
  const documents = candidates.map(candidate => ({ title: candidate.title, ...classification, draftQuestion: candidate.question, importSourceHash: job.sourceHash, importSourceNumber: candidate.sourceNumber, importReviewConfirmed: candidate.reviewed || confirmReview }));
  try { await DragDropPractice.insertMany(documents, { ordered: true }); }
  catch (error) { if (error.code === 11000) throw new ApiError(409, "These source questions were already imported"); throw error; }
  response.json({ imported: documents.length });
}
