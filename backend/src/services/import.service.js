import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { Readable } from "node:stream";
import {
  normalizeQuestion,
  questionErrors,
  importDraftErrors,
  duplicateKey,
} from "./question-validation.js";
import { ApiError } from "../utils/api-error.js";
export const templateHeaders = [
  "question",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "explanation",
  "access_level",
  "topic",
  "difficulty",
];
export const templateRow = [
  "Which principle grants only necessary permissions?",
  "Least privilege",
  "Availability",
  "Redundancy",
  "Encryption",
  "A",
  "Least privilege limits access to what the role needs.",
  "FREE",
  "Security fundamentals",
  "EASY",
];
const optionLetters = "abcdefgh";

function documentLines(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const runningHeaders = new Map();
  const footerLines = new Map();
  const footerPositions = new Map();
  const pageNumbers = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (/^Page\s+\d+\s*$/i.test(lines[i + 1]) && lines[i] && lines[i].length < 150)
      runningHeaders.set(lines[i], (runningHeaders.get(lines[i]) || 0) + 1);
    const page = lines[i].match(/^--\s*(\d+)\s+of\s+\d+\s*--$/i);
    if (page && lines[i - 1] === page[1]) {
      pageNumbers.add(i - 1);
      if (lines[i - 2]) {
        footerLines.set(lines[i - 2], (footerLines.get(lines[i - 2]) || 0) + 1);
        footerPositions.set(i - 2, lines[i - 2]);
      }
    }
  }
  return lines.flatMap((line, index) => {
    const marker = line.match(/^--\s*(\d+)\s+of\s+\d+\s*--$/i);
    if (marker) return [`\u0000page:${Number(marker[1]) + 1}`];
    if (!line || pageNumbers.has(index) || /^Page\s+\d+\s*$/i.test(line) ||
      (runningHeaders.get(line) || 0) >= 3 ||
      (footerPositions.get(index) === line && (footerLines.get(line) || 0) >= 3)) return [];
    return [line];
  })
    .flatMap(line => /^(?:Correct\s*answers?|Answers?|Answer\s*key|Explanation|Access|Topic|Difficulty)\s*[:;]/i.test(line)
      ? [line]
      : line.split(/\s+(?=[A-H][.):](?:\s|[A-Za-z]|$))/));
}

function questionHeading(line, explicit) {
  const named = line.match(/^(?:Questions?|Questio|Q)(?:\s*(?:No\.?|Number|#))?\s*[:#.]?\s*(\d{1,4})(?:[.):–-]\s*|\s+)?(.*)$/i);
  if (named) return { number: Number(named[1]), text: named[2].trim() };
  if (!explicit) {
    const numbered = line.match(/^(\d{1,4})[.)]\s+(.+)$/);
    if (numbered) return { number: Number(numbered[1]), text: numbered[2].trim() };
  }
  return null;
}

export function reorderPositionedLines(items, pageHeight) {
  const positioned = items
    .filter(item => item.str?.trim() && Number.isFinite(item.x) && Number.isFinite(item.y) &&
      item.y > 28 && item.y < pageHeight - 28)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const item of positioned) {
    const last = lines.at(-1);
    if (last && Math.abs(last.y - item.y) <= 2.5) last.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines.map(line => {
    let content = "";
    let right = -Infinity;
    for (const item of line.items.sort((a, b) => a.x - b.x)) {
      const value = item.str.trim();
      if (content && item.x - right > 1.5) content += " ";
      content += value;
      right = Math.max(right, item.x + (item.width || 0));
    }
    return content.trim();
  }).filter(Boolean);
}

async function positionedPdfDocument(parser) {
  // pdf-parse 2.4.x exposes its loaded PDF.js document after getText().
  // Use coordinates only as a fallback for PDFs whose text stream is out of visual order.
  const pdf = parser.doc;
  if (!pdf?.getPage) return null;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.flatMap(item => {
        if (!("str" in item)) return [];
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        return [{ str: item.str, x, y, width: item.width }];
      });
      pages.push(...reorderPositionedLines(items, viewport.height), `-- ${number} of ${pdf.numPages} --`);
    } finally {
      page.cleanup();
    }
  }
  return parseQuestionDocument(pages.join("\n"));
}

function completeOptionCount(rows) {
  return rows.filter(row => {
    const keys = optionLetters.split("").filter(key => Object.hasOwn(row, `option_${key}`));
    return keys.length >= 2 && keys.every(key => row[`option_${key}`]?.trim());
  }).length;
}

export function parseQuestionDocument(text) {
  const rows = [];
  let current;
  let field;
  const lines = documentLines(text);
  const simulationStart = lines.findIndex(line => /^Simulations?\s*[–—-]\s*performance[- ]based questions?$/i.test(line));
  const content = simulationStart < 0 ? lines : lines.slice(0, simulationStart);
  const explicit = content.some(line => questionHeading(line, true));
  const headings = [];
  let sourcePage = 1;
  for (const line of content) {
    const page = line.match(/^\u0000page:(\d+)$/);
    if (page) {
      sourcePage = Number(page[1]);
      continue;
    }
    const start = questionHeading(line, explicit);
    if (start) {
      if (current) rows.push(current);
      headings.push(start.number);
      current = { question: start.text, number: start.number, sourcePage };
      field = "question";
      continue;
    }
    if (!current) continue;
    const label = line.match(
      /^(Correct\s*answers?|Answers?|Answer\s*key|Explanation)\s*[:;]\s*(.*)$/i,
    ) || (/^Explanation\s*$/i.test(line) ? [line, "Explanation", ""] : null)
      || line.match(/^(Access(?:\s*level)?|Topic|Difficulty)\s*:\s*(.*)$/i);
    if (label && /^Access/i.test(label[1]) && !/^(FREE|PREMIUM)$/i.test(label[2])) {
      if (field && field !== "correct_answer") current[field] = `${current[field] || ""}\n${line}`.trim();
      continue;
    }
    if (label) {
      field = /answer/i.test(label[1])
        ? "correct_answer"
        : /access/i.test(label[1])
          ? "access_level"
          : label[1].toLowerCase();
      current[field] = label[2];
      continue;
    }
    const option = line.match(/^([A-H])[.):]\s*(.*)$/i);
    if (option && (field?.startsWith("option_") || option[1].toUpperCase() === "A") &&
      field !== "correct_answer" && field !== "explanation") {
      field = `option_${option[1].toLowerCase()}`;
      // Some PDFs repeat a bare choice label on the next page before its continuation.
      if (option[2].trim() || !Object.hasOwn(current, field)) current[field] = option[2];
    } else if (field && field !== "correct_answer")
      current[field] = `${current[field] || ""}\n${line}`.trim();
    else if (field === "correct_answer" && !current[field]) current[field] = line;
  }
  if (current) rows.push(current);
  return {
    rows,
    headings,
    answerMarkers: content.filter(line => /^(?:Correct\s*answers?|Answers?|Answer\s*key)\s*[:;]/i.test(line)).length,
    hasSimulationSection: simulationStart >= 0,
  };
}
export function parseQuestionBlocks(text) {
  return parseQuestionDocument(text).rows;
}
function answerIds(value) {
  const normalized = String(value || "").trim().replace(/\band\b/gi, ",");
  const prefix = normalized.match(/^[A-H](?:\s*[,;|/&.]\s*[A-H]|\s+[A-H])*/i);
  return prefix ? prefix[0].toUpperCase().match(/\b[A-H]\b/g) || [] : [];
}
function importWarnings(question) {
  const warnings = [];
  const stem = question.text || "";
  const count = stem.match(/\b(?:select|choose|pick|identify)\s+(two|three|four|five|six|2|3|4|5|6)\b|\bwhich\s+(two|three|four|five|six|2|3|4|5|6)\b/i);
  const wordCounts = { two: 2, three: 3, four: 4, five: 5, six: 6 };
  const expected = count && (wordCounts[(count[1] || count[2]).toLowerCase()] || Number(count[1] || count[2]));
  if (expected && question.correctOptionIds.length !== expected)
    warnings.push(`The prompt asks for ${expected} answers, but the source answer key contains ${question.correctOptionIds.length}`);
  else if (/\b(?:select|choose)\s+all\s+that\s+apply\b/i.test(stem) && question.correctOptionIds.length < 2)
    warnings.push("The prompt asks for multiple answers, but the source answer key contains fewer than two");
  if (/\b(?:simulation|click on|drag.and.drop|drop.down menus?|screenshot|exhibit|diagram|figure)\b/i.test(stem))
    warnings.push("This question may depend on an image or interaction; verify it against the source");
  return warnings;
}
function jsonQuestions(buffer) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new ApiError(400, `Invalid JSON: ${error.message}`);
  }
  const items = Array.isArray(parsed) ? parsed : parsed?.questions;
  if (!Array.isArray(items))
    throw new ApiError(400, 'JSON must be an array or an object with a "questions" array. Download the JSON template.');
  if (!items.length) throw new ApiError(400, "The JSON questions array is empty");
  if (items.length > 1000) throw new ApiError(400, "Import up to 1,000 questions at a time");
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new ApiError(400, `Question ${index + 1} must be a JSON object`);
    const sourceErrors = [];
    if (!Array.isArray(item.options)) sourceErrors.push("options must be an array");
    const options = Array.isArray(item.options) ? item.options.map((option, optionIndex) => {
      const expectedId = String.fromCharCode(65 + optionIndex);
      if (option && typeof option === "object" && !Array.isArray(option)) {
        if (option.id !== undefined && String(option.id).toUpperCase() !== expectedId)
          sourceErrors.push(`option ${optionIndex + 1} must use ID ${expectedId}`);
        return { text: option.text };
      }
      return { text: option };
    }) : [];
    if (!Array.isArray(item.correctOptionIds)) sourceErrors.push("correctOptionIds must be an array of option IDs, such as [\"A\"]");
    const correctOptionIds = Array.isArray(item.correctOptionIds)
      ? item.correctOptionIds.map(id => String(id).trim().toUpperCase()) : [];
    const type = item.type
      ? String(item.type).toUpperCase()
      : correctOptionIds.length > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE";
    const supportedType = ["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(type);
    if (!supportedType)
      sourceErrors.push("JSON import supports SINGLE_CHOICE and MULTIPLE_CHOICE only; create PBQs separately");
    for (const key of ["sourceNumber", "sourcePage"])
      if (item[key] !== undefined && (!Number.isInteger(item[key]) || item[key] < 1 || item[key] > 10000))
        sourceErrors.push(`${key} must be an integer from 1 to 10000`);
    const question = normalizeQuestion({
      ...item,
      type: supportedType ? type : "SINGLE_CHOICE",
      text: item.text ?? item.question,
      options,
      correctOptionIds,
    });
    return {
      ...question,
      sourceErrors,
      ...(Number.isInteger(item.sourceNumber) && item.sourceNumber > 0 && item.sourceNumber <= 10000 ? { sourceNumber: item.sourceNumber } : {}),
      ...(Number.isInteger(item.sourcePage) && item.sourcePage > 0 && item.sourcePage <= 10000 ? { sourcePage: item.sourcePage } : {}),
    };
  });
}
export function rowToQuestion(row) {
  const answers = answerIds(row.correct_answer);
  const lastOption = [...optionLetters].reduce((last, key, index) =>
    Object.hasOwn(row, `option_${key}`) ? index : last, -1);
  return normalizeQuestion({
    type: answers.length > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE",
    text: row.question,
    options: [...optionLetters].slice(0, lastOption >= 1 ? lastOption + 1 : 4).map((key) => ({
      text: row[`option_${key}`] || "",
    })),
    correctOptionIds: answers,
    explanation: row.explanation,
    accessLevel: (row.access_level || "FREE").toUpperCase(),
    topic: row.topic,
    difficulty: (row.difficulty || "MEDIUM").toUpperCase(),
  });
}
export async function extractQuestionsWithReport(buffer, extension) {
  let rows;
  let document;
  let questions;
  if (extension === ".json") {
    questions = jsonQuestions(buffer);
  } else if ([".xlsx", ".csv"].includes(extension)) {
    const workbook = new ExcelJS.Workbook();
    if (extension === ".csv") await workbook.csv.read(Readable.from(buffer));
    else await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ApiError(400, "No worksheet found");
    if (sheet.rowCount > 1001)
      throw new ApiError(400, "Import up to 1,000 questions at a time");
    const headers = {};
    sheet.getRow(1).eachCell((cell, col) => {
      headers[col] = cell.text.trim().toLowerCase();
    });
    const missing = templateHeaders
      .slice(0, 7)
      .filter((key) => !Object.values(headers).includes(key));
    if (missing.length)
      throw new ApiError(
        400,
        `Missing columns: ${missing.join(", ")}. Download the template.`,
      );
    rows = [];
    sheet.eachRow((row, index) => {
      if (index > 1)
        rows.push(
          Object.fromEntries(
            Object.entries(headers).map(([col, key]) => [
              key,
              row.getCell(Number(col)).text.trim(),
            ]),
          ),
        );
    });
  } else {
    let text;
    if (extension === ".docx")
      text = (await mammoth.extractRawText({ buffer })).value;
    else {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        text = (await parser.getText()).text;
        document = parseQuestionDocument(text);
        if (document.rows.length && completeOptionCount(document.rows) < document.rows.length * 0.75) {
          try {
            const positioned = await positionedPdfDocument(parser);
            if (positioned?.rows.length === document.rows.length &&
              completeOptionCount(positioned.rows) > completeOptionCount(document.rows)) document = positioned;
          } catch {
            // A failed layout pass must not discard questions found by the text parser.
          }
        }
      } finally {
        await parser.destroy();
      }
      if (text.replace(/--\s*\d+\s+of\s+\d+\s*--/g, "").trim().length < 30)
        throw new ApiError(
          400,
          "This PDF appears scanned. OCR is not enabled. Upload a text-based PDF, Word document, or Excel file.",
        );
    }
    document ||= parseQuestionDocument(text);
    rows = document.rows;
  }
  if (!questions && !rows.length)
    throw new ApiError(
      400,
      "No question blocks found. Use numbered Question headings, labeled answer options, and Answer lines.",
    );
  if (rows?.length > 1000)
    throw new ApiError(400, "Import up to 1,000 questions at a time");
  questions ||= rows.map(row => ({ ...rowToQuestion(row), ...(row.number ? { sourceNumber: row.number } : {}), ...(row.sourcePage ? { sourcePage: row.sourcePage } : {}) }));
  const headings = document?.headings || (extension === ".json" ? questions.map(question => question.sourceNumber).filter(Boolean) : []);
  const unique = new Set(headings);
  const missingNumbers = headings.length && headings[0] === 1
    ? Array.from({ length: Math.max(...headings) }, (_, index) => index + 1).filter(number => !unique.has(number))
    : [];
  return {
    questions,
    report: {
      sourceKind: document ? "document" : extension === ".json" ? "json" : "spreadsheet",
      detectedHeadings: headings.length || questions.length,
      detectedAnswerLines: document?.answerMarkers ?? null,
      numberedRange: headings.length && headings[0] === 1 ? Math.max(...headings) : null,
      extracted: questions.length,
      readyToImport: questions.filter(question => !importDraftErrors(question).length && !question.sourceErrors?.length).length,
      readyToPublish: questions.filter(question => !questionErrors(question).length && !question.sourceErrors?.length).length,
      missingAnswers: questions.filter(question => !question.correctOptionIds.length).length,
      missingExplanations: questions.filter(question => !question.explanation).length,
      needsSourceReview: questions.filter(question => importWarnings(question).length).length,
      duplicateNumbers: headings.length - unique.size,
      missingNumbers: missingNumbers.slice(0, 30),
      hasSimulationSection: Boolean(document?.hasSimulationSection),
    },
  };
}
export async function extractQuestions(buffer, extension) {
  return (await extractQuestionsWithReport(buffer, extension)).questions;
}
export function previewQuestions(questions, existing = []) {
  const seen = new Set(existing.map(duplicateKey));
  const sourceNumberCounts = new Map();
  for (const question of questions) if (question.sourceNumber)
    sourceNumberCounts.set(question.sourceNumber, (sourceNumberCounts.get(question.sourceNumber) || 0) + 1);
  return questions.map((question, index) => {
    const key = duplicateKey(question.text);
    const duplicate = seen.has(key);
    seen.add(key);
    return {
      ...question,
      row: index + 1,
      errors: questionErrors(question),
      importErrors: [...(question.sourceErrors || []), ...importDraftErrors(question)],
      importWarnings: importWarnings(question),
      duplicate,
      duplicateSourceNumber: Boolean(question.sourceNumber && sourceNumberCounts.get(question.sourceNumber) > 1),
    };
  });
}
