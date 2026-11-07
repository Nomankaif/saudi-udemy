import { readImportSource } from "./blob-store.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import LabImport from "../models/lab-import.model.js";
import { CCNA_PDF_LABS } from "../simulation/ccna-pdf-labs.js";
import { labImportIssues } from "./lab-import-validation.js";
import { labCapabilityIssues } from "./lab-import-capabilities.js";
import { validateLab } from "./lab.service.js";
import { simulate } from "./netsim.service.js";
import { applyImportDetails } from "./lab-import-details.js";
import { ApiError } from "../utils/api-error.js";

const CCNA_SOURCE_HASH = "3cae92b31d0c7d8f60aa404ffd51cef3726b69eb9c76840dcaf151a8b400cb58";
const languagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/ocr");
const clean = value => String(value || "").replace(/\s+/g, " ").trim();

export function labCandidateIssues(candidate) {
  return [...(candidate.inventoryIssues || []), ...labImportIssues(candidate.definition), ...labCapabilityIssues(candidate.definition)];
}

export function labExclusionReasons(row) {
  return [...labCandidateIssues(row), ...(row.verification?.issues || (row.verification?.status === "PASSED" ? [] : ["Simulator verification has not run"]))];
}

export async function verifyLabCandidate(row, run = simulate) {
  const errors = labCandidateIssues(row);
  if (errors.length) return { ...row, errors, reviewed: false, verification: { status: "SKIPPED", issues: [] } };
  try {
    const lab = validateLab(row.definition);
    const baseline = await run(lab, {}, "grade");
    const reference = await run(lab, {}, "validate");
    const issues = [];
    if (!Number.isFinite(baseline?.score) || baseline.score >= 100) issues.push("Starting configuration already passes all tasks; student work is not assessed");
    if (!reference?.valid || reference.score !== 100 || reference.errors?.length) {
      const before = issues.length;
      issues.push(...(reference?.errors || []).slice(0, 20));
      for (const task of (reference?.tasks || []).filter(item => !item.passed)) issues.push(`Task ${task.id}: reference solution does not pass grading`);
      if (issues.length === before) issues.push("Reference solution did not pass every task");
    }
    return { ...row, errors, verification: { status: issues.length ? "FAILED" : "PASSED", issues }, reviewed: issues.length ? false : row.reviewed };
  } catch (error) {
    return { ...row, errors, reviewed: false, verification: { status: "UNAVAILABLE", issues: [`Simulator verification unavailable: ${error.message || "unknown error"}`] } };
  }
}

function candidate(definition, sourceNumber, sourcePages = [], sourceText = "", warnings = [], reviewed = false) {
  const row = { sourceNumber, sourcePages, title: definition.title || `Lab ${sourceNumber}`, definition, sourceText, warnings, reviewed };
  return { ...row, errors: labCandidateIssues(row) };
}

export function parseLabJsonDocument(buffer, category, subcategory) {
  let document;
  try { document = JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, "")); }
  catch (error) { throw new ApiError(400, `Invalid JSON: ${error.message}`); }
  const rows = Array.isArray(document) ? document : document?.labs;
  if (!Array.isArray(rows) || rows.length > 100) throw new ApiError(400, "Provide up to 100 labs in the JSON template");
  const inventory = document?.sourceInventory;
  const excluded = Array.isArray(inventory?.excluded) ? inventory.excluded : [];
  if (!rows.length && !excluded.length) throw new ApiError(400, "Provide labs or excluded source exercises");
  const inventoryIssues = [];
  if (!inventory || !Number.isInteger(inventory.totalExercises) || inventory.totalExercises < 1 || inventory.totalExercises > 300 || !Array.isArray(inventory.excluded))
    inventoryIssues.push("Source inventory: declare totalExercises and excluded source exercises to account for every item in the source");
  if (excluded.length > 300) throw new ApiError(400, "Source inventory cannot exceed 300 exclusions");
  if (Number.isInteger(inventory?.totalExercises) && inventory.totalExercises !== rows.length + excluded.length)
    inventoryIssues.push(`Source inventory: ${inventory.totalExercises} exercises declared, but ${rows.length} labs and ${excluded.length} exclusions supplied`);
  const ids = [...rows, ...excluded].map((item, index) => typeof item?.sourceId === "string" ? item.sourceId.trim() : `missing-${index}`);
  if (ids.some(id => id.startsWith("missing-") || !id || id.length > 100) || new Set(ids).size !== ids.length)
    inventoryIssues.push("Source inventory: each modeled or excluded exercise needs a unique sourceId (1–100 characters)");
  const sourceExclusions = excluded.map((item, index) => ({ sourceId: ids[rows.length + index], title: String(item?.title || "Untitled source exercise").slice(0, 150), sourcePages: Array.isArray(item?.sourcePages) ? item.sourcePages.filter(page => Number.isInteger(page) && page > 0 && page <= 300) : [], reason: typeof item?.reason === "string" ? item.reason.trim().slice(0, 1000) : "" }));
  if (sourceExclusions.some(item => !item.reason)) inventoryIssues.push("Source inventory: every excluded exercise needs a reason");
  const candidates = rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new ApiError(400, `Lab ${index + 1} must be an object`);
    const input = row.definition && typeof row.definition === "object" ? row.definition : row;
    const definition = { ...input, category, subcategory, access: input.access || "FREE" };
    const pages = Array.isArray(row.sourcePages) ? row.sourcePages.filter(page => Number.isInteger(page) && page > 0 && page <= 300) : [];
    const result = candidate(definition, index + 1, pages);
    result.sourceId = ids[index];
    result.inventoryIssues = inventoryIssues;
    result.errors = labCandidateIssues(result);
    return result;
  });
  return { candidates, sourceExclusions, inventoryIssues };
}

export function parseLabJson(buffer, category, subcategory) {
  return parseLabJsonDocument(buffer, category, subcategory).candidates;
}

export function parsePageRange(value) {
  const match = String(value).match(/(\d+)\s*[–—-]\s*(\d+)/);
  if (match) return Array.from({ length: Math.max(0, Math.min(300, Number(match[2]) - Number(match[1]) + 1)) }, (_, index) => Number(match[1]) + index);
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? [page] : [];
}

export function knownCcnaLabCandidates(category, subcategory) {
  return CCNA_PDF_LABS.map(entry => {
    const definition = structuredClone({ ...entry.definition, category, subcategory, access: "FREE" });
    return candidate(definition, entry.number, parsePageRange(entry.pages), entry.reviewNotes || "", ["Review the source diagram, tasks, solution and grading before importing."], false);
  });
}

export function extractedLabCandidates(pages, category, subcategory) {
  const groups = [];
  for (const page of pages) {
    const match = page.text.match(/\bItem\s*(\d{1,3})\s*(?:of|0f)\s*\d{1,3}\b/i) || page.text.match(/\bLab\s*(\d{1,3})\b/i);
    const number = match ? Number(match[1]) : null;
    if (number && (!groups.length || groups.at(-1).number !== number)) groups.push({ number, pages: [] });
    if (!groups.length) groups.push({ number: 1, pages: [] });
    groups.at(-1).pages.push(page);
  }
  return groups.slice(0, 100).map((group, index) => {
    const number = group.number || index + 1;
    const sourceText = group.pages.map(page => page.text).join("\n\n").slice(0, 20000);
    const definition = {
      engine: "netsim-v1", title: `Imported lab ${number}`, category, subcategory,
      instructions: "", topology: "", devices: [], links: [], tasks: [],
      access: "FREE", durationMinutes: 60,
    };
    return candidate(definition, number, group.pages.map(page => page.page), sourceText,
      ["OCR extracted the source. Configure devices, topology, tasks, solutions and grading checks before import."], false);
  });
}

export async function renderLabSourcePage(sourcePath, pageNumber, width = 1400) {
  const parser = new PDFParse({ data: new Uint8Array(await readImportSource(sourcePath)) });
  try { return (await parser.getScreenshot({ partial: [pageNumber], desiredWidth: width, imageDataUrl: false })).pages[0].data; }
  finally { await parser.destroy(); }
}

let running = false;
export async function processNextLabImport() {
  if (running) return;
  running = true;
  try {
    let job;
    while ((job = await LabImport.findOneAndUpdate({ status: "QUEUED" }, { status: "PROCESSING", error: "" }, { new: true, sort: { createdAt: 1 } }))) {
      try {
        const buffer = await readImportSource(job.sourcePath);
        if (job.sourceKind === "json") {
          const parsed = parseLabJsonDocument(buffer, job.category, job.subcategory);
          const candidates = await verifyCandidates(job, applyImportDetails(parsed.candidates, job.details));
          await LabImport.updateOne({ _id: job._id }, { status: "READY", candidates, sourceExclusions: parsed.sourceExclusions, inventoryIssues: parsed.inventoryIssues, expectedItems: candidates.length, processedPages: 1, totalPages: 1 });
          continue;
        }
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        let worker;
        try {
          const totalPages = (await parser.getInfo()).total;
          if (!totalPages || totalPages > 300) throw new ApiError(400, "PDF must contain 1 to 300 pages");
          await LabImport.updateOne({ _id: job._id }, { totalPages });
          if (job.sourceHash === CCNA_SOURCE_HASH && totalPages === 64) {
            const candidates = await verifyCandidates(job, applyImportDetails(knownCcnaLabCandidates(job.category, job.subcategory), job.details));
            await LabImport.updateOne({ _id: job._id }, { status: "READY", candidates, expectedItems: candidates.length, processedPages: totalPages });
            continue;
          }
          const pages = [];
          for (let page = 1; page <= totalPages; page++) {
            let text = clean((await parser.getText({ partial: [page] })).text.replace(/--\s*\d+\s+of\s+\d+\s*--/g, ""));
            if (text.length < 30) {
              worker ||= await createWorker("eng", 1, { langPath: languagePath, cacheMethod: "none" });
              const screenshot = (await parser.getScreenshot({ partial: [page], desiredWidth: 1500, imageDataUrl: false })).pages[0].data;
              const info = await sharp(screenshot).metadata();
              const crop = await sharp(screenshot).extract({ left: 0, top: 0, width: Math.round(info.width * 0.72), height: Math.round(info.height * 0.9) }).resize({ width: 1900 }).grayscale().normalize().png().toBuffer();
              text = clean((await worker.recognize(crop)).data.text);
            }
            pages.push({ page, text });
            if (page % 2 === 0 || page === totalPages) await LabImport.updateOne({ _id: job._id }, { processedPages: page });
          }
          const candidates = await verifyCandidates(job, applyImportDetails(extractedLabCandidates(pages, job.category, job.subcategory), job.details));
          if (!candidates.length) throw new ApiError(400, "No lab pages could be extracted from this PDF");
          await LabImport.updateOne({ _id: job._id }, { status: "READY", candidates, expectedItems: candidates.length });
        } finally { await worker?.terminate(); await parser.destroy(); }
      } catch (error) {
        await LabImport.updateOne({ _id: job._id }, { status: "FAILED", error: error.message || "Lab extraction failed" });
      }
    }
  } finally { running = false; }
}

async function verifyCandidates(job, rows) {
  await LabImport.updateOne({ _id: job._id }, { expectedItems: rows.length, processedItems: 0 });
  const verified = [];
  for (const row of rows) {
    verified.push(await verifyLabCandidate(row));
    await LabImport.updateOne({ _id: job._id }, { processedItems: verified.length });
  }
  return verified;
}

export async function resumeLabImports() {
  await LabImport.updateMany({ status: "PROCESSING" }, { status: "QUEUED", processedPages: 0 });
  void processNextLabImport();
}
