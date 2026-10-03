import mongoose from "mongoose";
import Lab from "../models/lab.model.js";
import LabAttempt from "../models/lab-attempt.model.js";
import Exam from "../models/exam.model.js";
import { hasPremiumAccess } from "../services/access.service.js";
import { validateLab, initialStates, execute, grade, publicLab, presentAttempt } from "../services/lab.service.js";
import { LABS, LAB_DESCRIPTIONS } from "../vendor/lab-ccna/labData.js";
import { lookupCmd } from "../vendor/lab-ccna/iosCmdTree.js";
import { ApiError } from "../utils/api-error.js";
import { isNetSim, netStates, netCommand, simulate } from "../services/netsim.service.js";
import { NETSIM_TEMPLATES } from "../simulation/templates.js";
import { categoryName, validateClassification } from "../services/category.service.js";

const makeStates = lab => isNetSim(lab) ? netStates(lab) : initialStates(lab);
const gradeAttempt = a => isNetSim(a.snapshot) ? simulate(a.snapshot, a.states, "grade") : grade(a);

const id = value => { if (!mongoose.isValidObjectId(value)) throw new ApiError(400, "Invalid identifier"); return value; };
async function findLab(value) {
  const lab = await Lab.findById(id(value));
  if (!lab || lab.status === "ARCHIVED") throw new ApiError(404, "Lab not found");
  return lab;
}
async function validateExam(definition) {
  if (definition.access === "PREMIUM" && !definition.examId) throw new ApiError(400, "Premium labs must be linked to a published exam");
  if (definition.examId && !await Exam.exists({ _id: id(definition.examId), status: "PUBLISHED" })) throw new ApiError(400, "Select a published exam for access approval");
}
export async function list(req, res) {
  const labs = await Lab.find({ status: "PUBLISHED" }).select("published publishedAt").lean();
  res.json(labs.map(l => ({ _id: l._id, title: l.published.title, engine: l.published.engine || "legacy", category: l.published.category, subcategory: l.published.subcategory || "", imageUrl: l.published.imageUrl || "", access: l.published.access, examId: l.published.examId, durationMinutes: l.published.durationMinutes, deviceCount: l.published.devices.length, taskCount: l.published.tasks.length, publishedAt: l.publishedAt })));
}
export async function adminList(req, res) { res.json(await Lab.find({ status: { $ne: "ARCHIVED" } }).select("title category subcategory status templateId updatedAt publishedAt").sort({ updatedAt: -1 }).lean()); }
export async function adminGet(req, res) { res.json(await findLab(req.params.id)); }
export async function validateSolutions(req, res) {
  const lab = await findLab(req.params.id);
  const draft = validateLab(lab.draft);
  if (!isNetSim(draft)) throw new ApiError(400, "Solution verification is available for network simulation labs");
  res.json(await simulate(draft, {}, "validate"));
}
export async function save(req, res) {
  const draft = validateLab(req.body);
  await validateExam(draft);
  const lab = req.params.id ? await findLab(req.params.id) : new Lab();
  Object.assign(draft, await validateClassification(draft.category, draft.subcategory, {
    allowUnassigned: !lab.isNew && !lab.draft?.subcategory && categoryName(lab.category).toLowerCase() === categoryName(draft.category).toLowerCase(),
  }));
  lab.title = draft.title; lab.category = draft.category; lab.subcategory = draft.subcategory; lab.draft = draft;
  await lab.save(); res.json(lab);
}
export async function publish(req, res) {
  const lab = await findLab(req.params.id);
  const definition = validateLab(lab.draft);
  await validateExam(definition);
  if (isNetSim(definition)) await netStates(definition);
  lab.published = definition; lab.status = "PUBLISHED"; lab.publishedAt = new Date();
  await lab.save(); res.json(lab);
}
export async function unpublish(req, res) { const lab = await findLab(req.params.id); lab.status = "DRAFT"; await lab.save(); res.json({ message: "Lab unpublished" }); }
export async function archive(req, res) { const lab = await findLab(req.params.id); lab.status = "ARCHIVED"; await lab.save(); res.json({ message: "Lab archived; attempt history retained" }); }
export async function importTemplates(req, res) {
  let imported = 0;
  for (const template of LABS) {
    const draft = validateLab({ ...template, access: "FREE", durationMinutes: 60, instructions: LAB_DESCRIPTIONS[template.id] || "" });
    const result = await Lab.updateOne({ templateId: template.id }, { $setOnInsert: { templateId: template.id, title: draft.title, category: draft.category, draft, status: "DRAFT" } }, { upsert: true });
    imported += result.upsertedCount;
  }
  res.json({ imported, message: `${imported} templates imported as drafts. Review tasks and grading checks before publishing.` });
}
export async function importSimulationTemplates(req, res) {
  let imported = 0;
  for (const template of NETSIM_TEMPLATES) {
    const draft = validateLab(template);
    await netStates(draft);
    const result = await Lab.updateOne({ templateId: template.templateId }, { $setOnInsert: { templateId: template.templateId, title: draft.title, category: draft.category, draft, status: "DRAFT" } }, { upsert: true });
    imported += result.upsertedCount;
  }
  res.json({ imported, message: `${imported} network simulation templates added as drafts. Preview before publishing.` });
}
async function access(user, definition) {
  return definition.access === "FREE" || user.role === "ADMIN" || (definition.examId && await hasPremiumAccess(user.id, definition.examId));
}
export async function availability(req, res) {
  const lab = await findLab(req.params.id);
  if (lab.status !== "PUBLISHED") throw new ApiError(404, "Lab is not published");
  res.json({ allowed: Boolean(await access(req.user, lab.published)), examId: lab.published.examId });
}
export async function preview(req, res) {
  const lab = await findLab(req.params.id);
  const snapshot = validateLab(lab.draft);
  const attempt = await LabAttempt.create({ userId: req.user.id, labId: lab.id, snapshot: { ...snapshot, access: "FREE", examId: null }, states: await makeStates(snapshot), mode: "PRACTICE" });
  res.status(201).json(presentAttempt(attempt));
}
export async function start(req, res) {
  const lab = await findLab(req.params.id);
  if (lab.status !== "PUBLISHED") throw new ApiError(404, "Lab is not published");
  if (!await access(req.user, lab.published)) throw new ApiError(403, "Administrator approval is required for this lab");
  const { mode, durationMinutes } = req.body;
  if (!["PRACTICE", "EXAM"].includes(mode)) throw new ApiError(400, "Select practice or exam mode");
  if (mode === "EXAM" && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) throw new ApiError(400, "Choose 1–1440 minutes");
  const effectiveDuration = isNetSim(lab.published) ? lab.published.durationMinutes : durationMinutes;
  const attempt = await LabAttempt.create({ userId: req.user.id, labId: lab.id, snapshot: lab.published, states: await makeStates(lab.published), mode, deadline: mode === "EXAM" ? new Date(Date.now() + effectiveDuration * 60000) : null });
  res.status(201).json(presentAttempt(attempt));
}
async function persist(a) {
  const updated = await LabAttempt.findOneAndUpdate({ _id: a._id, revision: a.revision }, { $set: { states: a.states, transcript: a.transcript, solutionViewed: a.solutionViewed, status: a.status, result: a.result, submittedAt: a.submittedAt }, $inc: { revision: 1 } }, { new: true }).lean();
  if (!updated) throw new ApiError(409, "This session changed in another tab. Refresh before continuing.");
  return updated;
}
async function owned(req, active = false) {
  let a = await LabAttempt.findOne({ _id: id(req.params.attemptId), userId: req.user.id }).lean();
  if (!a) throw new ApiError(404, "Session not found");
  if (a.status === "ACTIVE" && a.deadline && new Date(a.deadline) <= new Date()) {
    a.status = "SUBMITTED"; a.submittedAt = new Date(a.deadline); a.result = await gradeAttempt(a); a = await persist(a);
  }
  if (active && a.status !== "ACTIVE") throw new ApiError(409, "Session has ended. Open the results.");
  if (a.status === "ACTIVE" && !await access(req.user, a.snapshot)) throw new ApiError(403, "Premium access has expired or been revoked");
  return a;
}
export async function finalizeExpiredLabs() {
  const attempts = await LabAttempt.find({ status: "ACTIVE", deadline: { $lte: new Date() } }).limit(5).lean();
  for (const a of attempts) {
    try {
      a.result = await gradeAttempt(a); a.status = "SUBMITTED"; a.submittedAt = new Date(a.deadline);
      await persist(a);
    } catch (error) {
      // A concurrent submission is harmless; engine failures leave the saved
      // journal intact and the next sweep retries rather than assigning zero.
      if (error.statusCode !== 409) console.error("Lab finalization deferred", error.message);
    }
  }
}
export async function getAttempt(req, res) { res.json(presentAttempt(await owned(req))); }
export async function history(req, res) {
  const items = await LabAttempt.find({ userId: req.user.id }).select("snapshot.title mode status deadline createdAt result.score").sort({ createdAt: -1 }).limit(100).lean();
  res.json(items.map(a => ({ _id: a._id, title: a.snapshot.title, mode: a.mode, status: a.status === "ACTIVE" && a.deadline && new Date(a.deadline) < new Date() ? "EXPIRED" : a.status, score: a.result?.score, createdAt: a.createdAt })));
}
export async function command(req, res) {
  const a = await owned(req, true);
  const { device, command } = req.body;
  if (!a.snapshot.devices.some(d => d.name === device)) throw new ApiError(400, "Select a device in this lab");
  const result = isNetSim(a.snapshot) ? await netCommand(a, device, command) : execute(a.states[device], command);
  if (!isNetSim(a.snapshot)) a.states[device] = result.state;
  // Do not accept a command that finishes after the assessment deadline.
  if (a.deadline && new Date(a.deadline) <= new Date()) throw new ApiError(409, "Time has expired. Refresh to view your results.");
  a.transcript.push({ device, input: `${result.prompt} ${command}`, output: (result.output || "").slice(0, 16000) });
  a.transcript = a.transcript.slice(-200);
  res.json(presentAttempt(await persist(a)));
}
export async function complete(req, res) {
  const a = await owned(req, true);
  const { device, input } = req.body;
  if (isNetSim(a.snapshot)) {
    if (!a.snapshot.devices.some(d => d.name === device && d.console !== false) || typeof input !== "string" || input.length > 1000 || /[\r\n\x00-\x1f]/.test(input)) throw new ApiError(400, "Invalid completion request");
    return res.json(await simulate(a.snapshot, a.states, "complete", { device, input }));
  }
  if (!Object.hasOwn(a.states, device) || typeof input !== "string" || input.length > 1000) throw new ApiError(400, "Invalid completion request");
  res.json(lookupCmd(input, a.states[device].mode));
}
export async function check(req, res) {
  const a = await owned(req, true);
  if (a.mode !== "PRACTICE") throw new ApiError(403, "Checks are available after submission in exam mode");
  const result = await gradeAttempt(a); res.json({ ...result, tasks: result.tasks.map(({ solution, ...task }) => task) });
}
export async function solution(req, res) {
  const a = await owned(req, true);
  if (a.mode !== "PRACTICE") throw new ApiError(403, "Solutions are available after submission in exam mode");
  const result = await gradeAttempt(a); a.solutionViewed = true; await persist(a); res.json(result);
}
export async function reset(req, res) {
  const a = await owned(req, true);
  if (a.mode !== "PRACTICE") throw new ApiError(403, "Reset is available only in practice mode");
  a.states = await makeStates(a.snapshot); a.transcript = []; res.json(presentAttempt(await persist(a)));
}
export async function submit(req, res) {
  const a = await owned(req);
  if (a.status === "SUBMITTED") return res.json(presentAttempt(a));
  a.status = "SUBMITTED"; a.submittedAt = new Date(); a.result = await gradeAttempt(a);
  res.json(presentAttempt(await persist(a)));
}
