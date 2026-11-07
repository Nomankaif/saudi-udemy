import path from "node:path";
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph } from "docx";
import Exam from "../models/exam.model.js";
import Question from "../models/question.model.js";
import { ApiError } from "../utils/api-error.js";
import {
  extractQuestionsWithReport,
  previewQuestions,
  templateHeaders,
  templateRow,
} from "../services/import.service.js";
import {
  normalizeQuestion,
  importDraftErrors,
} from "../services/question-validation.js";
export async function previewImport(request, response) {
  if (!request.file)
    throw new ApiError(400, "Select an XLSX, CSV, DOCX, PDF or JSON file");
  if (!(await Exam.exists({ _id: request.params.id })))
    throw new ApiError(404, "Exam not found");
  const { questions, report } = await extractQuestionsWithReport(
    request.file.buffer,
    path.extname(request.file.originalname).toLowerCase(),
  );
  const existing = await Question.find({
    examId: request.params.id,
    isActive: true,
  })
    .select("text")
    .lean();
  response.json({
    questions: previewQuestions(
      questions,
      existing.map((item) => item.text),
    ),
    report,
    filename: request.file.originalname,
  });
}
export async function commitImport(request, response) {
  if (
    !Array.isArray(request.body.questions) ||
    !request.body.questions.length ||
    request.body.questions.length > 1000
  )
    throw new ApiError(400, "Select between 1 and 1,000 questions");
  if (!(await Exam.exists({ _id: request.params.id })))
    throw new ApiError(404, "Exam not found");
  const questions = request.body.questions.map(normalizeQuestion);
  const invalid = questions.flatMap((question, index) =>
    importDraftErrors(question).map((message) => `Row ${index + 1}: ${message}`),
  );
  if (invalid.length) throw new ApiError(400, invalid.slice(0, 10).join("; "));
  const existing = await Question.find({
    examId: request.params.id,
    isActive: true,
  })
    .select("text")
    .lean();
  if (
    !request.body.allowDuplicates &&
    previewQuestions(
      questions,
      existing.map((item) => item.text),
    ).some((item) => item.duplicate)
  )
    throw new ApiError(
      409,
      "Duplicate questions found. Remove duplicates or explicitly allow them.",
    );
  const last = await Question.findOne({ examId: request.params.id })
    .sort({ displayOrder: -1 })
    .lean();
  await Question.insertMany(
    questions.map((question, index) => ({
      ...question,
      examId: request.params.id,
      displayOrder: (last?.displayOrder || 0) + index + 1,
    })),
  );
  await Exam.updateOne(
    { _id: request.params.id },
    { hasUnpublishedChanges: true },
  );
  response.json({ imported: questions.length });
}
export async function downloadTemplate(request, response) {
  const format = request.params.format;
  if (format === "json") {
    response.attachment("question-template.json").json({
      questions: [{
        type: "SINGLE_CHOICE",
        text: templateRow[0],
        options: templateRow.slice(1, 5).map((text, index) => ({
          id: String.fromCharCode(65 + index), text,
        })),
        correctOptionIds: ["A"],
        explanation: templateRow[6],
        accessLevel: "FREE",
        topic: templateRow[8],
        difficulty: templateRow[9],
      }],
    });
    return;
  }
  if (format === "docx") {
    const lines = [
      `Question 1: ${templateRow[0]}`,
      ...templateRow
        .slice(1, 5)
        .map((option, i) => `${String.fromCharCode(65 + i)}. ${option}`),
      "Answer: A",
      `Explanation: ${templateRow[6]}`,
      "Access: FREE",
      "Topic: Security fundamentals",
      "Difficulty: EASY",
    ];
    response
      .attachment("question-template.docx")
      .send(
        await Packer.toBuffer(
          new Document({
            sections: [{ children: lines.map((text) => new Paragraph(text)) }],
          }),
        ),
      );
    return;
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Questions");
  sheet.addRow(templateHeaders);
  sheet.addRow(templateRow);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 28;
  });
  if (format === "csv")
    response
      .attachment("question-template.csv")
      .send(await workbook.csv.writeBuffer());
  else if (format === "xlsx")
    response
      .attachment("question-template.xlsx")
      .send(await workbook.xlsx.writeBuffer());
  else throw new ApiError(400, "Choose xlsx, csv, docx or json");
}
