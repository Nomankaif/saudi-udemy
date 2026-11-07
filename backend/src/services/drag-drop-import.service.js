import { readImportSource } from "./blob-store.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import DragDropImport from "../models/drag-drop-import.model.js";
import { normalizeQuestion, questionErrors } from "./question-validation.js";
import { ApiError } from "../utils/api-error.js";

const languagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/ocr");
const PAGE_WIDTH = 1200;
const clean = value => String(value || "").replace(/[|“”‘’]/g, " ").replace(/\s+/g, " ").trim();
const key = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const alpha = value => key(value).replace(/0/g, "o").replace(/1/g, "l");
const bounded = (value, min, max) => Math.max(min, Math.min(max, value));

function hasAnswerPanel(data, width, height, channels) {
  let yellow = 0, sampled = 0;
  for (let y = Math.floor(height * 0.18); y < height * 0.78; y += 20) {
    for (let x = 50; x < width - 50; x += 30) {
      const i = (y * width + x) * channels, r = data[i], g = data[i + 1], b = data[i + 2];
      yellow += Number(r > 210 && g > 180 && g - b > 12 && r - b > 20);
      sampled++;
    }
  }
  return sampled > 0 && yellow / sampled > 0.16;
}

export function candidateIssues(candidate) {
  const errors = [!candidate.title?.trim() && "Enter a question title", ...(candidate.sourceErrors || []), ...questionErrors(candidate.question)].filter(Boolean);
  return [...new Set(errors)];
}

export function parseJsonCandidates(buffer, category, subcategory) {
  let data;
  try { data = JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, "")); }
  catch (error) { throw new ApiError(400, `Invalid JSON: ${error.message}`); }
  const rows = Array.isArray(data) ? data : data?.questions;
  if (!Array.isArray(rows) || !rows.length || rows.length > 200) throw new ApiError(400, "Provide 1 to 200 questions in the JSON template");
  const seenNumbers = new Set();
  return rows.map((row, index) => {
    const sourceErrors = [];
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new ApiError(400, `Row ${index + 1} must be a question object`);
    if (!Array.isArray(row.options)) sourceErrors.push("Add an options array of draggable items");
    if (!Array.isArray(row.dropTargets)) sourceErrors.push("Add a dropTargets array of destinations");
    if (!Array.isArray(row.correctPlacements)) sourceErrors.push("Add a correctPlacements array of answers");
    if (Array.isArray(row.options) && row.options.length > 20) sourceErrors.push("Use at most 20 draggable items");
    if (Array.isArray(row.dropTargets) && row.dropTargets.length > 10) sourceErrors.push("Use at most 10 destination groups");
    if (Array.isArray(row.correctPlacements) && row.correctPlacements.length > 20) sourceErrors.push("Use at most 20 correct placements");
    let sourceNumber = Number.isInteger(row.sourceNumber) && row.sourceNumber > 0 ? row.sourceNumber : index + 1;
    const warnings = [];
    if (seenNumbers.has(sourceNumber)) {
      const repeated = sourceNumber;
      sourceNumber = index + 1;
      while (seenNumbers.has(sourceNumber)) sourceNumber++;
      warnings.push(`Repeated source number ${repeated} was renumbered to ${sourceNumber}`);
    }
    seenNumbers.add(sourceNumber);
    const question = normalizeQuestion({ ...row, type: "DRAG_DROP", options: Array.isArray(row.options) ? row.options.slice(0, 20) : [], dropTargets: Array.isArray(row.dropTargets) ? row.dropTargets.slice(0, 10) : [], correctPlacements: Array.isArray(row.correctPlacements) ? row.correctPlacements.slice(0, 20) : [], accessLevel: "FREE" });
    const candidate = {
      sourceNumber,
      sourcePages: [], title: clean(row.title) || `Drag and Drop ${index + 1}`,
      category, subcategory, question, sourceErrors, warnings, reviewed: false,
    };
    const errors = candidateIssues(candidate);
    return { ...candidate, errors, reviewed: errors.length === 0 && warnings.length === 0 };
  });
}

export function findColorBoxes(data, width, height, channels, color) {
  const step = 4, gw = Math.ceil(width / step), gh = Math.ceil(height / step);
  const mask = new Uint8Array(gw * gh), seen = new Uint8Array(mask.length);
  for (let gy = Math.floor(0.16 * gh); gy < Math.floor(0.78 * gh); gy++) {
    for (let gx = Math.floor(0.16 * gw); gx < Math.floor(0.85 * gw); gx++) {
      const x = Math.min(width - 1, gx * step + 2), y = Math.min(height - 1, gy * step + 2);
      const i = (y * width + x) * channels, r = data[i], g = data[i + 1], b = data[i + 2];
      if (color === "blue" ? b > 180 && g > 170 && b > r + 18 && g > r + 12 : r > 220 && g > 175 && r > b + 25 && g > b + 12) mask[gy * gw + gx] = 1;
    }
  }
  const boxes = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1;
    let left = gw, right = 0, top = gh, bottom = 0, count = 0;
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head], x = at % gw, y = Math.floor(at / gw);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
      for (const next of [at - 1, at + 1, at - gw, at + gw]) {
        if (next < 0 || next >= mask.length || (next === at - 1 && x === 0) || (next === at + 1 && x === gw - 1) || !mask[next] || seen[next]) continue;
        seen[next] = 1; queue.push(next);
      }
    }
    const w = (right - left + 1) * step, h = (bottom - top + 1) * step;
    if (w > width * 0.1 && w < width * 0.55 && h > height * 0.023 && h < height * 0.18 && count > 120)
      boxes.push({ left: left * step, top: top * step, width: w, height: h, count });
  }
  const split = [];
  for (const box of boxes) {
    const rows = [];
    for (let y = box.top; y < box.top + box.height && y < height; y += 2) {
      let hits = 0, samples = 0;
      for (let x = box.left + 4; x < box.left + box.width - 4; x += 4) {
        const i = (y * width + x) * channels, r = data[i], g = data[i + 1], b = data[i + 2];
        hits += color === "blue" ? Number(b > 180 && g > 170 && b > r + 18 && g > r + 12) : Number(r > 220 && g > 175 && r > b + 25 && g > b + 12);
        samples++;
      }
      rows.push({ y, filled: samples > 0 && hits / samples > 0.42 });
    }
    const bands = [];
    let start = null;
    for (const row of [...rows, { y: box.top + box.height, filled: false }]) {
      if (row.filled && start === null) start = row.y;
      if (!row.filled && start !== null) { if (row.y - start >= height * 0.02) bands.push({ left: box.left, top: start, width: box.width, height: row.y - start, count: box.count }); start = null; }
    }
    split.push(...(bands.length > 1 ? bands : [box]));
  }
  return split.sort((a, b) => a.top - b.top || a.left - b.left);
}

async function recognizeCrop(worker, png, rect) {
  const metadata = await sharp(png).metadata();
  const left = bounded(Math.round(rect.left), 0, metadata.width - 1), top = bounded(Math.round(rect.top), 0, metadata.height - 1);
  const width = bounded(Math.round(rect.width), 1, metadata.width - left), height = bounded(Math.round(rect.height), 1, metadata.height - top);
  const buffer = await sharp(png).extract({ left, top, width, height }).resize({ width: Math.min(2600, width * 4) }).grayscale().normalize().png().toBuffer();
  const { data } = await worker.recognize(buffer);
  return { text: clean(data.text), confidence: data.confidence };
}

export async function scanPage(worker, png, page) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width, height = info.height;
  const heading = await recognizeCrop(worker, png, { left: 0, top: height * 0.123, width: width * 0.34, height: height * 0.038 });
  const number = heading.text.match(/[Il1]tem\s*(\d{1,3})\s*(?:of|0f|o[f1])\s*(\d{1,3})/i);
  const recognizedNumber = number ? Number(number[1]) : null, recognizedTotal = number ? Number(number[2]) : null;
  const validNumber = recognizedNumber && recognizedTotal && recognizedNumber <= recognizedTotal && recognizedTotal <= 200;
  const blue = findColorBoxes(data, width, height, info.channels, "blue");
  const yellow = findColorBoxes(data, width, height, info.channels, "yellow");
  const blocks = [];
  for (const box of [...blue.map(box => ({ ...box, color: "blue" })), ...yellow.map(box => ({ ...box, color: "yellow" }))].slice(0, 35)) {
    const result = await recognizeCrop(worker, png, { left: box.left + 2, top: box.top + 1, width: box.width - 4, height: box.height - 2 });
    if (result.text && result.text.length >= 2) blocks.push({ ...box, ...result });
  }
  let prompt = heading.text.replace(/^.*?[Il1]tem\s*\d{1,3}\s*(?:of|0f|o[f1])\s*\d{1,3}/i, "").replace(/\(Drag.?Drop[^)]*\)/i, "").replace(/(?:Show|Hide) Answer/i, "").trim();
  let answer = hasAnswerPanel(data, width, height, info.channels) || /Hide\s*Answer|\bAnswer\s*:/i.test(heading.text);
  if (!/drag\s*(?:and|&)\s*drop/i.test(prompt) || !answer) {
    const content = await recognizeCrop(worker, png, { left: 0, top: height * 0.16, width: width * 0.83, height: height * 0.55 });
    const instruction = content.text.match(/(?:Refer to (?:the )?exhibit[.:]?\s*)?Drag\s*(?:and|&)\s*drop[^.!?]{8,350}(?:[.!?][^.!?]{0,160})?/i);
    if (instruction) prompt = clean(instruction[0]);
    answer ||= /\bAnswer\s*:/i.test(content.text);
  }
  return { page, number: validNumber ? recognizedNumber : null, total: validNumber ? recognizedTotal : null, prompt, answer, blocks, heading: heading.text };
}

const similarity = (a, b) => {
  const x = alpha(a), y = alpha(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length);
  const words = new Set(clean(a).toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const other = clean(b).toLowerCase().split(/\W+/).filter(w => w.length > 2);
  return other.length ? other.filter(w => words.has(w)).length / Math.max(words.size, other.length) : 0;
};

export function buildPdfCandidates(pages, category, subcategory) {
  const grouped = new Map(), missingPages = [];
  let last = null, expected = 0;
  for (const page of pages) {
    if (page.number) last = page.number;
    if (!last) { missingPages.push(page.page); continue; }
    expected = Math.max(expected, page.total || 0);
    if (!grouped.has(last)) grouped.set(last, []);
    grouped.get(last).push(page);
  }
  const candidates = [];
  for (let number = 1; number <= Math.max(expected, ...grouped.keys(), 0); number++) {
    const group = grouped.get(number) || [];
    const interaction = [...group].sort((a, b) => b.blocks.filter(x => x.color === "yellow").length - a.blocks.filter(x => x.color === "yellow").length)[0];
    const answer = group.find(page => page.answer && page !== interaction) || group.find(page => page.answer);
    const sourceErrors = [], warnings = [];
    if (!group.length) sourceErrors.push(`Source item ${number} was not found in the PDF`);
    const items = (interaction?.blocks || []).filter(box => box.color === "blue").sort((a, b) => a.top - b.top).slice(0, 20);
    const targets = (interaction?.blocks || []).filter(box => box.color === "yellow").sort((a, b) => a.top - b.top).slice(0, 10);
    const options = items.map((box, index) => ({ id: `item${index + 1}`, text: box.text }));
    const dropTargets = [];
    const targetLookup = [];
    for (const target of targets) {
      const label = target.text || `Destination ${dropTargets.length + 1}`;
      let existing = dropTargets.find(group => key(group.label) === key(label));
      if (!existing) { existing = { id: `group${dropTargets.length + 1}`, label, capacity: 0 }; dropTargets.push(existing); }
      existing.capacity++;
      targetLookup.push(existing.id);
    }
    const placed = (answer?.blocks || []).filter(box => box.color === "blue" && box.left > (interaction?.blocks.find(x => x.color === "yellow")?.left || PAGE_WIDTH * 0.48) - 30).sort((a, b) => a.top - b.top);
    const correctPlacements = [], used = new Set();
    for (let index = 0; index < Math.min(placed.length, targetLookup.length); index++) {
      const matches = options.map(option => ({ option, score: similarity(option.text, placed[index].text) })).filter(match => !used.has(match.option.id)).sort((a, b) => b.score - a.score);
      if (matches[0]?.score >= 0.65) { used.add(matches[0].option.id); correctPlacements.push({ itemId: matches[0].option.id, targetId: targetLookup[index] }); }
    }
    if (options.length < 2 || !targets.length) warnings.push("OCR could not reliably find all draggable items or destinations");
    if (correctPlacements.length !== targetLookup.length) warnings.push("Answer mapping is incomplete; compare the answer page with the source");
    if (!answer) warnings.push("No separate answer view was detected");
    if (items.some(item => item.confidence < 65) || targets.some(target => target.confidence < 65)) warnings.push("Some text has low OCR confidence");
    const text = group.map(page => page.prompt).find(value => /drag\s*(?:and|&)\s*drop/i.test(value)) || group[0]?.prompt || "";
    const question = normalizeQuestion({ type: "DRAG_DROP", text, options, dropTargets, correctPlacements, accessLevel: "FREE", imageUrl: "" });
    const candidate = { sourceNumber: number, sourcePages: group.map(page => page.page), answerPages: group.filter(page => page.answer).map(page => page.page), title: `Drag and Drop ${number}`, category, subcategory, question, sourceErrors, warnings, reviewed: false, exhibitPage: group.find(page => !page.answer)?.page || group[0]?.page || null, exhibitRect: /exhibit/i.test(text) ? { left: 0.01, top: 0.15, width: 0.48, height: 0.32 } : null };
    candidates.push({ ...candidate, errors: candidateIssues(candidate) });
  }
  return { candidates, expectedItems: expected, missingPages };
}

export async function renderSourcePage(sourcePath, pageNumber, width = PAGE_WIDTH) {
  const parser = new PDFParse({ data: new Uint8Array(await readImportSource(sourcePath)) });
  try { const result = await parser.getScreenshot({ partial: [pageNumber], desiredWidth: width, imageDataUrl: false }); return result.pages[0].data; }
  finally { await parser.destroy(); }
}

let running = false;
export async function processNextDragDropImport() {
  if (running) return;
  running = true;
  try {
    let job;
    while ((job = await DragDropImport.findOneAndUpdate({ status: "QUEUED" }, { status: "PROCESSING", error: "" }, { new: true, sort: { createdAt: 1 } }))) {
      try {
        const buffer = await readImportSource(job.sourcePath);
        if (job.sourceKind === "json") {
          const candidates = parseJsonCandidates(buffer, job.category, job.subcategory);
          await DragDropImport.updateOne({ _id: job._id }, { status: "READY", candidates, expectedItems: candidates.length, processedPages: 1, totalPages: 1 });
          continue;
        }
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        let worker;
        try {
          const info = await parser.getInfo();
          const totalPages = info.total;
          if (!totalPages || totalPages > 300) throw new ApiError(400, "PDF must contain 1 to 300 pages");
          await DragDropImport.updateOne({ _id: job._id }, { totalPages });
          worker = await createWorker("eng", 1, { langPath: languagePath, cacheMethod: "none" });
          const pages = [];
          for (let page = 1; page <= totalPages; page++) {
            const result = await parser.getScreenshot({ partial: [page], desiredWidth: PAGE_WIDTH, imageDataUrl: false });
            pages.push(await scanPage(worker, result.pages[0].data, page));
            if (page % 2 === 0 || page === totalPages) await DragDropImport.updateOne({ _id: job._id }, { processedPages: page });
          }
          const report = buildPdfCandidates(pages, job.category, job.subcategory);
          await DragDropImport.updateOne({ _id: job._id }, { status: "READY", candidates: report.candidates, expectedItems: report.expectedItems });
        } finally { await worker?.terminate(); await parser.destroy(); }
      } catch (error) {
        await DragDropImport.updateOne({ _id: job._id }, { status: "FAILED", error: error.message || "Import failed" });
      }
    }
  } finally { running = false; }
}

export async function resumeDragDropImports() {
  await DragDropImport.updateMany({ status: "PROCESSING" }, { status: "QUEUED", processedPages: 0 });
  void processNextDragDropImport();
}
