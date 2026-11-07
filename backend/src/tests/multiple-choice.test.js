import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import { Document, Paragraph, Packer } from "docx";
import app from "../app.js";
import { normalizeQuestion, questionErrors, importDraftErrors } from "../services/question-validation.js";
import { extractQuestions, parseQuestionBlocks, previewQuestions, reorderPositionedLines, rowToQuestion, templateHeaders, templateRow } from "../services/import.service.js";
import { scoreQuestions } from "../services/scoring.service.js";

const fixture = (extra = {}) => normalizeQuestion({
  type: "MULTIPLE_CHOICE", text: "Which two are private IPv4 addresses?",
  options: ["10.0.0.1", "8.8.8.8", "192.168.1.1", "1.1.1.1"].map(text => ({ text })),
  correctOptionIds: ["A", "C"], explanation: "10/8 and 192.168/16 are private address ranges.",
  accessLevel: "FREE", ...extra,
});

test("multiple-answer validation preserves type and reports invalid answer keys", () => {
  assert.equal(fixture().type, "MULTIPLE_CHOICE");
  assert.deepEqual(questionErrors(fixture()), []);
  for (const key of [[], ["A"], ["A", "A"], ["A", "Z"], ["A", "B", "C", "D", "D"]]) {
    assert.ok(questionErrors(fixture({ correctOptionIds: key })).includes("Select two or more different correct answers from the available options"));
  }
  assert.deepEqual(questionErrors(fixture({ correctOptionIds: ["A", "B", "C", "D"] })), []);
  assert.ok(questionErrors(fixture({ type: "SINGLE_CHOICE" })).includes("Select exactly one correct answer from the available options"));
  assert.deepEqual(questionErrors(fixture({ type: "SINGLE_CHOICE", correctOptionIds: ["A"] })), []);
  assert.equal(fixture({ type: undefined }).type, "SINGLE_CHOICE");
});

test("five- and six-option questions preserve choices and grade option E/F", () => {
  const five = fixture({ type: "SINGLE_CHOICE", options: ["One", "Two", "Three", "Four", "Five"].map(text => ({ text })), correctOptionIds: ["E"] });
  assert.equal(five.options.length, 5);
  assert.deepEqual(questionErrors(five), []);
  assert.equal(scoreQuestions([{ ...five, _id: "five" }], [{ attemptQuestionId: "five", selectedOptionIds: ["E"] }]).score, 1);
  const six = fixture({ options: ["One", "Two", "Three", "Four", "Five", "Six"].map(text => ({ text })), correctOptionIds: ["A", "F"] });
  assert.equal(six.options.length, 6);
  assert.deepEqual(questionErrors(six), []);
  assert.equal(scoreQuestions([{ ...six, _id: "six" }], [{ attemptQuestionId: "six", selectedOptionIds: ["F", "A"] }]).score, 1);
});

test("explanations are optional for drafts and publishing, but answers are required", () => {
  assert.deepEqual(importDraftErrors(fixture({ explanation: "" })), []);
  assert.deepEqual(questionErrors(fixture({ explanation: "" })), []);
  assert.ok(importDraftErrors(fixture({ correctOptionIds: [] })).some(error => error.startsWith("Select ")));
});

test("multiple-answer scoring is exact-set, order independent, with no partial credit", () => {
  const q = { ...fixture(), _id: "q" };
  for (const [selected, score, unanswered] of [
    [["A", "C"], 1, 0], [["C", "A"], 1, 0], [["A"], 0, 0],
    [["A", "B", "C"], 0, 0], [["B", "D"], 0, 0], [["A", "A"], 0, 0], [[], 0, 1],
  ]) {
    const result = scoreQuestions([q], [{ attemptQuestionId: "q", selectedOptionIds: selected }]);
    assert.equal(result.score, score);
    assert.equal(result.correctCount, score);
    assert.equal(result.unansweredCount, unanswered);
    assert.equal(result.incorrectCount, 1 - score - unanswered);
  }
});

test("Excel, CSV and Word imports recognize multiple answer IDs and retain single-answer files", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Questions");
  sheet.addRow(templateHeaders);
  const row = [...templateRow]; row[5] = "A,C";
  sheet.addRow(row); sheet.addRow(templateRow);
  for (const [buffer, extension] of [[await workbook.xlsx.writeBuffer(), ".xlsx"], [await workbook.csv.writeBuffer(), ".csv"]]) {
    const questions = await extractQuestions(buffer, extension);
    assert.equal(questions[0].type, "MULTIPLE_CHOICE");
    assert.deepEqual(questions[0].correctOptionIds, ["A", "C"]);
    assert.deepEqual(questionErrors(questions[0]), []);
    assert.equal(questions[1].type, "SINGLE_CHOICE");
  }
  const lines = ["Question 1: Choose two", "A. First", "B. Second", "C. Third", "D. Fourth", "Correct answers: a, c", "Explanation: Two apply"];
  const doc = await Packer.toBuffer(new Document({ sections: [{ children: lines.map(text => new Paragraph(text)) }] }));
  assert.deepEqual((await extractQuestions(doc, ".docx"))[0].correctOptionIds, ["A", "C"]);
  assert.equal(rowToQuestion(parseQuestionBlocks(lines.join("\n"))[0]).type, "MULTIPLE_CHOICE");
  assert.ok(questionErrors(rowToQuestion({ ...Object.fromEntries(templateHeaders.map((h, i) => [h, row[i]])), correct_answer: "A,A" })).length);
});

test("text PDFs parse heading and answer variants, inline options, page furniture and simulation cutoff", () => {
  const text = [
    "Practice Questions", "Page 1", "QUESTION 1", "Which control applies? A. First", "B. Second", "C. Third", "D. Fourth E. Fifth", "ANSWER; E.",
    "-- 1 of 3 --", "Practice Questions", "Page 2", "QUESTION 2", "Choose two. (Select two).", "A. One", "B. Two", "C. Three", "D. Four", "E. Five", "F. Six", "Correct Answer: A,F.",
    "Simulations – performance-based questions", "Question: 1", "Click the device",
  ].join("\n");
  const rows = parseQuestionBlocks(text);
  assert.equal(rows.length, 2);
  const first = rowToQuestion(rows[0]);
  assert.equal(first.options.length, 5);
  assert.deepEqual(first.correctOptionIds, ["E"]);
  assert.doesNotMatch(first.text, /Practice Questions|Page 1/);
  const second = rowToQuestion(rows[1]);
  assert.equal(second.options.length, 6);
  assert.deepEqual(second.correctOptionIds, ["A", "F"]);
  assert.deepEqual(questionErrors(second), []);
});

test("layout-aware PDF fallback pairs out-of-order option labels with their text", () => {
  const items = [
    { str: "A.", x: 50, y: 141, width: 12 },
    { str: "B.", x: 50, y: 161, width: 12 },
    { str: "C.", x: 50, y: 181, width: 12 },
    { str: "Question #:1", x: 39, y: 80, width: 60 },
    { str: "Which setting applies?", x: 39, y: 110, width: 130 },
    { str: "First setting", x: 69, y: 141, width: 70 },
    { str: "Second setting", x: 69, y: 161, width: 80 },
    { str: "Third setting", x: 69, y: 181, width: 70 },
    { str: "Answer: B", x: 39, y: 211, width: 60 },
    { str: "Explanation", x: 39, y: 240, width: 70 },
    { str: "The second setting applies.", x: 39, y: 260, width: 160 },
    { str: "Page header", x: 30, y: 18, width: 60 },
    { str: "Page footer", x: 30, y: 780, width: 60 },
  ];
  const rows = parseQuestionBlocks(reorderPositionedLines(items, 792).join("\n"));
  assert.equal(rows.length, 1);
  const question = rowToQuestion(rows[0]);
  assert.deepEqual(question.options.map(option => option.text), ["First setting", "Second setting", "Third setting"]);
  assert.deepEqual(question.correctOptionIds, ["B"]);
  assert.equal(question.explanation, "The second setting applies.");
  assert.deepEqual(questionErrors(question), []);
});

test("a repeated empty option label on the next page keeps the previous option text", () => {
  const rows = parseQuestionBlocks([
    "Question #:1", "Which setting applies?", "A. First", "B. Second", "C. Third", "G. Start of long option",
    "-- 1 of 2 --", "G.", "continuation on the next page", "Answer: B", "Explanation", "The second applies.",
  ].join("\n"));
  assert.equal(rows[0].option_g, "Start of long option\ncontinuation on the next page");
});

test("Network+-style PDF pages retain question numbers and pages while warning on unsafe source answers", () => {
  const text = [
    "Exam : N10-009", "IT Certification Guaranteed, The Easy Way!", "1", "-- 1 of 3 --",
    "QUESTION NO: 1", "Which two protocols are used? (Select two)",
    "A. First", "B. Second", "C. Third", "D. Fourth", "Answer: A C", "Explanation: Both apply.",
    "IT Certification Guaranteed, The Easy Way!", "2", "-- 2 of 3 --",
    "QUESTION NO: 2", "Which two settings are needed? (Select two)",
    "A. First", "B. Second", "C. Third", "D. Fourth", "Answer: B", "Explanation: The source key is incomplete.",
    "IT Certification Guaranteed, The Easy Way!", "3", "-- 3 of 3 --",
  ].join("\n");
  const rows = parseQuestionBlocks(text);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.number), [1, 2]);
  assert.deepEqual(rows.map(row => row.sourcePage), [2, 3]);
  const questions = rows.map(row => rowToQuestion(row));
  assert.equal(questions[0].accessLevel, "FREE");
  assert.deepEqual(questions[0].correctOptionIds, ["A", "C"]);
  assert.doesNotMatch(questions[0].explanation, /IT Certification Guaranteed|\n2/);
  assert.deepEqual(previewQuestions(questions)[0].importWarnings, []);
  assert.match(previewQuestions(questions)[1].importWarnings[0], /asks for 2 answers/);
});

test("API: publish mixed questions, save/resume selections, protect keys and grade immutable snapshots", { timeout: 30000 }, async t => {
  t.mock.method(console, "log", () => {});
  const dbName = `multiple_choice_test_${randomUUID().replaceAll("-", "")}`;
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "multiple-choice-test-password";
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 5000 });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, method = "GET", body, cookie = "", status = 200) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    return { data, cookie: response.headers.getSetCookie().map(item => item.split(";")[0]).join("; ") };
  }
  try {
    const admin = (await call("/auth/admin/login", "POST", { password: process.env.ADMIN_PASSWORD })).cookie;
    const user = { firstName: "Multiple", lastName: "Tester", email: "multiple@test.invalid", password: "Student-test-password" };
    await call("/auth/register", "POST", user, "", 201);
    const student = (await call("/auth/login", "POST", user)).cookie;
    const exam = (await call("/exams", "POST", { title: "Mixed MCQ fixture", category: "Testing", shortDescription: "Test fixture", durationMinutes: 5, attemptSize: 2 }, admin, 201)).data;
    const draft = (await call(`/exams/${exam._id}/questions`, "POST", fixture({ correctOptionIds: ["A"] }), admin, 201)).data;
    const invalid = (await call(`/exams/${exam._id}/publish`, "POST", {}, admin, 400)).data;
    assert.match(invalid.message, /two or more different correct answers/);
    await call(`/exams/${exam._id}/questions/${draft._id}`, "PATCH", fixture(), admin);
    await call(`/exams/${exam._id}/import/commit`, "POST", { questions: [fixture({ text: "Choose one", type: "SINGLE_CHOICE", correctOptionIds: ["B"] })] }, admin);
    await call(`/exams/${exam._id}/publish`, "POST", {}, admin);
    const attempt = (await call("/attempts", "POST", { examId: exam._id, mode: "PRACTICE" }, student, 201)).data;
    const batch = (await call(`/attempts/${attempt._id}/questions`, "GET", undefined, student)).data;
    const multi = batch.questions.find(q => q.type === "MULTIPLE_CHOICE");
    const single = batch.questions.find(q => q.type === "SINGLE_CHOICE");
    assert.ok(multi && single);
    for (const q of batch.questions) {
      assert.ok(!("correctOptionIds" in q)); assert.ok(!("explanation" in q));
    }
    const answerPath = `/attempts/${attempt._id}/answers/${multi._id}`;
    for (const selectedOptionIds of [["Z"], ["A", "A"], "A,C", null, [1]]) {
      await call(answerPath, "PUT", { selectedOptionIds }, student, 400);
    }
    await call(`/attempts/${attempt._id}/answers/${single._id}`, "PUT", { selectedOptionIds: ["A", "B"] }, student, 400);
    // Saving permits any valid subset, without revealing how many options are correct.
    await call(answerPath, "PUT", { selectedOptionIds: ["A", "B", "C", "D"] }, student);
    await call(answerPath, "PUT", { selectedOptionIds: [] }, student);
    await call(answerPath, "PUT", { selectedOptionIds: ["C", "A"], markedForReview: true }, student);
    const resumed = (await call(`/attempts/${attempt._id}/questions`, "GET", undefined, student)).data;
    assert.deepEqual(resumed.answers[0].selectedOptionIds, ["C", "A"]);
    assert.equal(resumed.answers[0].markedForReview, true);
    await call(`/attempts/${attempt._id}/answers/${single._id}`, "PUT", { selectedOptionIds: ["B"] }, student);
    await call(`/exams/${exam._id}/questions/${draft._id}`, "PATCH", fixture({ correctOptionIds: ["B", "D"] }), admin);
    await call(`/exams/${exam._id}/publish`, "POST", {}, admin);
    const reveal = (await call(`/attempts/${attempt._id}/explanation/${multi._id}`, "GET", undefined, student)).data;
    assert.deepEqual(reveal.correctOptionIds, ["A", "C"]);
    const result = (await call(`/attempts/${attempt._id}/submit`, "POST", {}, student)).data;
    assert.equal(result.correctCount, 2); assert.equal(result.percentage, 100);
    const review = (await call(`/attempts/${attempt._id}/result`, "GET", undefined, student)).data;
    assert.deepEqual(review.questions.find(q => q.type === "MULTIPLE_CHOICE").correctOptionIds, ["A", "C"]);
    await call(answerPath, "PUT", { selectedOptionIds: ["B", "D"] }, student, 409);
    const timed = (await call("/attempts", "POST", { examId: exam._id, mode: "TIMED" }, student, 201)).data;
    const timedBatch = (await call(`/attempts/${timed._id}/questions`, "GET", undefined, student)).data;
    const timedMulti = timedBatch.questions.find(q => q.type === "MULTIPLE_CHOICE");
    await call(`/attempts/${timed._id}/explanation/${timedMulti._id}`, "GET", undefined, student, 403);
    await call(`/attempts/${timed._id}/answers/${timedMulti._id}`, "PUT", { selectedOptionIds: ["B"] }, student);
    const partial = (await call(`/attempts/${timed._id}/submit`, "POST", {}, student)).data;
    assert.equal(partial.score, 0); assert.equal(partial.incorrectCount, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
  }
});
