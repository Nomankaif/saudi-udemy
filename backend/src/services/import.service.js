import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { Readable } from "node:stream";
import {
  normalizeQuestion,
  questionErrors,
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
export function parseQuestionBlocks(text) {
  const rows = [];
  let current;
  let field;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) continue;
    const start = line.match(
      /^(?:Question\s*\d*\s*[:.)-]|Q\s*\d+\s*[:.)-]|\d+[.)])\s*(.*)$/i,
    );
    if (start) {
      if (current) rows.push(current);
      current = { question: start[1] };
      field = "question";
      continue;
    }
    if (!current) continue;
    const option = line.match(/^([A-D])[.):]\s*(.*)$/i);
    const label = line.match(
      /^(Correct\s*answers?|Answers?|Explanation|Access(?:\s*level)?|Topic|Difficulty)\s*:\s*(.*)$/i,
    );
    if (option) {
      field = `option_${option[1].toLowerCase()}`;
      current[field] = option[2];
    } else if (label) {
      field = /answer/i.test(label[1])
        ? "correct_answer"
        : /access/i.test(label[1])
          ? "access_level"
          : label[1].toLowerCase();
      current[field] = label[2];
    } else if (field)
      current[field] = `${current[field] || ""}\n${line}`.trim();
  }
  if (current) rows.push(current);
  return rows;
}
export function rowToQuestion(row) {
  const answers = typeof row.correct_answer === "string" && row.correct_answer.trim()
    ? row.correct_answer.trim().toUpperCase().split(/\s*[,;|]\s*|\s+/)
    : [];
  return normalizeQuestion({
    type: answers.length > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE",
    text: row.question,
    options: ["a", "b", "c", "d"].map((key) => ({
      text: row[`option_${key}`] || "",
    })),
    correctOptionIds: answers,
    explanation: row.explanation,
    accessLevel: (row.access_level || "PREMIUM").toUpperCase(),
    topic: row.topic,
    difficulty: (row.difficulty || "MEDIUM").toUpperCase(),
  });
}
export async function extractQuestions(buffer, extension) {
  let rows;
  if ([".xlsx", ".csv"].includes(extension)) {
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
      } finally {
        await parser.destroy();
      }
      if (text.replace(/--\s*\d+\s+of\s+\d+\s*--/g, "").trim().length < 30)
        throw new ApiError(
          400,
          "This PDF appears scanned. OCR is not enabled. Upload a text-based PDF, Word document, or Excel file.",
        );
    }
    rows = parseQuestionBlocks(text);
  }
  if (!rows.length)
    throw new ApiError(
      400,
      "No question blocks found. Use the template with Question, A–D, Answer and Explanation labels.",
    );
  if (rows.length > 1000)
    throw new ApiError(400, "Import up to 1,000 questions at a time");
  return rows.map(rowToQuestion);
}
export function previewQuestions(questions, existing = []) {
  const seen = new Set(existing.map(duplicateKey));
  return questions.map((question, index) => {
    const key = duplicateKey(question.text);
    const duplicate = seen.has(key);
    seen.add(key);
    return {
      ...question,
      row: index + 1,
      errors: questionErrors(question),
      duplicate,
    };
  });
}
