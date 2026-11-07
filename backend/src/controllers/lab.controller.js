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

const isSeries = lab => lab.engine === "netsim-series-v1";
const makeStates = async lab => isSeries(lab)
  ? { exercises: [await netStates(lab.exercises[0])], transcripts: [[]] }
  : isNetSim(lab) ? netStates(lab) : initialStates(lab);
const currentAttempt = a => isSeries(a.snapshot)
  ? { snapshot: a.snapshot.exercises[a.currentExercise || 0], states: a.states.exercises[a.currentExercise || 0], transcript: a.states.transcripts[a.currentExercise || 0] || [] }
  : a;
async function gradeAttempt(a) {
  if (!isSeries(a.snapshot)) return isNetSim(a.snapshot) ? simulate(a.snapshot, a.states, "grade") : grade(a);
  const results = [];
  for (let index = 0; index < a.snapshot.exercises.length; index += 3) {
    const batch = a.snapshot.exercises.slice(index, index + 3).map((lab, offset) => simulate(lab, a.states.exercises[index + offset] || { journal: [] }, "grade"));
    results.push(...await Promise.all(batch));
  }
  const correct = results.reduce((sum, result) => sum + result.correct, 0);
  const total = results.reduce((sum, result) => sum + result.total, 0);
  return { exercises: results, correct, total, score: total ? Math.round(correct / total * 100) : 0 };
}

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
  const collectionMembers = new Set(labs.filter(l => isSeries(l.published)).flatMap(l => l.published.labIds || []));
  res.json(labs.filter(l => l.published && !collectionMembers.has(String(l._id))).map(l => ({ _id: l._id, title: l.published.title, engine: l.published.engine || "legacy", category: l.published.category, subcategory: l.published.subcategory || "", imageUrl: l.published.imageUrl || "", access: l.published.access, examId: l.published.examId, durationMinutes: l.published.durationMinutes, deviceCount: isSeries(l.published) ? l.published.exercises.length : l.published.devices.length, taskCount: isSeries(l.published) ? l.published.exercises.length : l.published.tasks.length, publishedAt: l.publishedAt })));
}
export async function adminList(req, res) { res.json(await Lab.find({ status: { $ne: "ARCHIVED" } }).select("title category subcategory status sourceReview templateId importSourceNumber updatedAt publishedAt draft.engine draft.labIds").sort({ updatedAt: -1 }).lean()); }
export async function adminGet(req, res) { res.json(await findLab(req.params.id)); }
export async function saveSeries(req, res) {
  const { title, category, subcategory, labIds, durationMinutes, access } = req.body || {};
  if (typeof title !== "string" || !title.trim() || title.length > 150) throw new ApiError(400, "Enter a collection title");
  if (!Array.isArray(labIds) || labIds.length < 2 || labIds.length > 50 || new Set(labIds).size !== labIds.length || labIds.some(value => !mongoose.isValidObjectId(value))) throw new ApiError(400, "Choose 2–50 different labs in order");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) throw new ApiError(400, "Choose a duration of 1–1440 minutes");
  if (!["FREE", "PREMIUM"].includes(access)) throw new ApiError(400, "Select an access level");
  if (access === "PREMIUM") throw new ApiError(400, "Collections currently support free access");
  const classification = await validateClassification(category, subcategory || "");
  const members = await Lab.find({ _id: { $in: labIds }, status: { $ne: "ARCHIVED" } }).select("draft").lean();
  if (members.length !== labIds.length || members.some(member => member.draft?.engine !== "netsim-v1")) throw new ApiError(400, "Choose active network simulation labs only");
  if (members.some(member => member.draft.access !== "FREE" || member.draft.category !== classification.category || (member.draft.subcategory || "") !== classification.subcategory)) throw new ApiError(400, "Choose free labs from this category and subcategory only");
  const lab = req.params.id ? await findLab(req.params.id) : new Lab();
  if (!lab.isNew && !isSeries(lab.draft)) throw new ApiError(400, "This is not a lab collection");
  const draft = { engine: "netsim-series-v1", title: title.trim(), ...classification, labIds, durationMinutes, access };
  lab.title = draft.title; lab.category = draft.category; lab.subcategory = draft.subcategory; lab.draft = draft;
  await lab.save(); res.json(lab);
}
async function seriesSnapshot(lab, allowDrafts) {
  const ids = lab.draft.labIds;
  const members = await Lab.find({ _id: { $in: ids }, status: { $ne: "ARCHIVED" } }).lean();
  if (members.length !== ids.length) throw new ApiError(400, "Some collection labs are missing");
  const byId = new Map(members.map(member => [String(member._id), member]));
  const exercises = ids.map(value => {
    const member = byId.get(value);
    if (!allowDrafts && (member.status !== "PUBLISHED" || member.sourceReview?.status === "PENDING")) throw new ApiError(400, `Review and publish ${member.title} before publishing this collection`);
    if ((allowDrafts ? member.draft : member.published)?.access !== "FREE") throw new ApiError(400, `Make ${member.title} free before including it in this collection`);
    return validateLab(allowDrafts ? member.draft : member.published);
  });
  return { ...lab.draft, exercises };
}
export async function previewSeries(req, res) {
  const lab = await findLab(req.params.id);
  if (!isSeries(lab.draft)) throw new ApiError(400, "This is not a lab collection");
  const snapshot = await seriesSnapshot(lab, true);
  const attempt = await LabAttempt.create({ userId: req.user.id, labId: lab.id, snapshot, states: await makeStates(snapshot), mode: "PRACTICE" });
  res.status(201).json(presentAttempt(attempt));
}
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
  const changed = JSON.stringify(draft) !== JSON.stringify(lab.draft);
  lab.title = draft.title; lab.category = draft.category; lab.subcategory = draft.subcategory; lab.draft = draft;
  if (changed && lab.importSourceHash && lab.sourceReview?.status === "CONFIRMED") {
    lab.sourceReview.status = "PENDING";
    lab.sourceReview.confirmedAt = undefined;
  }
  await lab.save(); res.json(lab);
}
export async function confirmSourceReview(req, res) {
  const lab = await findLab(req.params.id);
  if (!lab.importSourceHash || !lab.sourceReview?.status) throw new ApiError(400, "This lab has no pending import source review");
  if (req.body?.confirmed !== true) throw new ApiError(400, "Confirm that you compared the lab with its source");
  const definition = validateLab(lab.draft);
  if (isNetSim(definition)) {
    const baseline = await simulate(definition, {}, "grade");
    const reference = await simulate(definition, {}, "validate");
    if (!Number.isFinite(baseline.score) || baseline.score >= 100 || !reference.valid || reference.score !== 100 || reference.errors?.length)
      throw new ApiError(400, "The lab must fail before student work and pass every task with its reference solution");
  }
  lab.sourceReview.status = "CONFIRMED";
  lab.sourceReview.confirmedAt = new Date();
  await lab.save();
  res.json(lab);
}
export async function publish(req, res) {
  const lab = await findLab(req.params.id);
  if (isSeries(lab.draft)) {
    const definition = await seriesSnapshot(lab, false);
    lab.published = definition; lab.status = "PUBLISHED"; lab.publishedAt = new Date();
    await lab.save(); return res.json(lab);
  }
  if (lab.sourceReview?.status === "PENDING") throw new ApiError(400, "Confirm this imported lab against its source in the lab studio before publishing");
  const definition = validateLab(lab.draft);
  await validateExam(definition);
  if (isNetSim(definition)) {
    await netStates(definition);
    const baseline = await simulate(definition, {}, "grade");
    const reference = await simulate(definition, {}, "validate");
    if (!Number.isFinite(baseline.score) || baseline.score >= 100 || !reference.valid || reference.score !== 100 || reference.errors?.length)
      throw new ApiError(400, `Verify the reference solution before publishing. ${reference.errors?.[0] || "Each task must fail before student work and pass with its reference solution."}`);
  }
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
  const effectiveDuration = isNetSim(lab.published) || isSeries(lab.published) ? lab.published.durationMinutes : durationMinutes;
  const attempt = await LabAttempt.create({ userId: req.user.id, labId: lab.id, snapshot: lab.published, states: await makeStates(lab.published), mode, deadline: mode === "EXAM" ? new Date(Date.now() + effectiveDuration * 60000) : null });
  res.status(201).json(presentAttempt(attempt));
}
async function persist(a) {
  const updated = await LabAttempt.findOneAndUpdate({ _id: a._id, revision: a.revision }, { $set: { states: a.states, transcript: a.transcript, currentExercise: a.currentExercise || 0, solutionViewed: a.solutionViewed, status: a.status, result: a.result, submittedAt: a.submittedAt }, $inc: { revision: 1 } }, { new: true }).lean();
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
  const current = currentAttempt(a);
  if (!current.snapshot.devices.some(d => d.name === device)) throw new ApiError(400, "Select a device in this lab");
  const result = isNetSim(current.snapshot) ? await netCommand(current, device, command) : execute(current.states[device], command);
  if (!isNetSim(current.snapshot)) current.states[device] = result.state;
  // Do not accept a command that finishes after the assessment deadline.
  if (a.deadline && new Date(a.deadline) <= new Date()) throw new ApiError(409, "Time has expired. Refresh to view your results.");
  current.transcript.push({ device, input: `${result.prompt} ${command}`, output: (result.output || "").slice(0, 16000) });
  current.transcript = current.transcript.slice(-200);
  if (isSeries(a.snapshot)) { a.states.exercises[a.currentExercise || 0] = current.states; a.states.transcripts[a.currentExercise || 0] = current.transcript; }
  else { a.states = current.states; a.transcript = current.transcript; }
  res.json(presentAttempt(await persist(a)));
}
export async function complete(req, res) {
  const a = await owned(req, true);
  const { device, input } = req.body;
  const current = currentAttempt(a);
  if (isNetSim(current.snapshot)) {
    if (!current.snapshot.devices.some(d => d.name === device && d.console !== false) || typeof input !== "string" || input.length > 1000 || /[\r\n\x00-\x1f]/.test(input)) throw new ApiError(400, "Invalid completion request");
    return res.json(await simulate(current.snapshot, current.states, "complete", { device, input }));
  }
  if (!Object.hasOwn(current.states, device) || typeof input !== "string" || input.length > 1000) throw new ApiError(400, "Invalid completion request");
  res.json(lookupCmd(input, current.states[device].mode));
}
export async function check(req, res) {
  const a = await owned(req, true);
  if (a.mode !== "PRACTICE") throw new ApiError(403, "Checks are available after submission in exam mode");
  const result = await gradeAttempt(currentAttempt(a)); res.json({ ...result, tasks: result.tasks.map(({ solution, ...task }) => task) });
}
export async function solution(req, res) {
  const a = await owned(req, true);
  if (a.mode !== "PRACTICE") throw new ApiError(403, "Solutions are available after submission in exam mode");
  const result = await gradeAttempt(currentAttempt(a)); a.solutionViewed = true; await persist(a); res.json(result);
}
export async function reset(req, res) {
  const a = await owned(req, true);
  if (a.mode !== "PRACTICE") throw new ApiError(403, "Reset is available only in practice mode");
  if (isSeries(a.snapshot)) { a.states.exercises[a.currentExercise || 0] = await makeStates(a.snapshot.exercises[a.currentExercise || 0]); a.states.transcripts[a.currentExercise || 0] = []; }
  else { a.states = await makeStates(a.snapshot); a.transcript = []; }
  res.json(presentAttempt(await persist(a)));
}
export async function selectExercise(req, res) {
  const a = await owned(req);
  if (!isSeries(a.snapshot)) throw new ApiError(400, "This session contains one lab");
  const index = req.body?.index;
  if (!Number.isInteger(index) || index < 0 || index >= a.snapshot.exercises.length) throw new ApiError(400, "Choose a question in this session");
  if (!a.states.exercises[index]) a.states.exercises[index] = await makeStates(a.snapshot.exercises[index]);
  if (!a.states.transcripts[index]) a.states.transcripts[index] = [];
  a.currentExercise = index;
  res.json(presentAttempt(await persist(a)));
}
export async function submit(req, res) {
  const a = await owned(req);
  if (a.status === "SUBMITTED") return res.json(presentAttempt(a));
  a.status = "SUBMITTED"; a.submittedAt = new Date(); a.result = await gradeAttempt(a);
  res.json(presentAttempt(await persist(a)));
}
