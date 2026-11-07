import test from "node:test";
import assert from "node:assert/strict";
import { extractQuestionsWithReport, previewQuestions } from "../services/import.service.js";
import { downloadTemplate } from "../controllers/import.controller.js";

const upload = value => extractQuestionsWithReport(Buffer.from(JSON.stringify(value)), ".json");
const options = ["First", "Second", "Third", "Fourth"].map((text, index) => ({
  id: String.fromCharCode(65 + index), text,
}));

test("JSON imports arrays and question envelopes through the shared preview, defaulting to Free", async () => {
  const input = {
    questions: [
      { type: "SINGLE_CHOICE", text: "Choose one", options, correctOptionIds: ["b"], explanation: "Second is correct.", sourceNumber: 1, sourcePage: 3 },
      { type: "MULTIPLE_CHOICE", text: "Choose two (Select two)", options, correctOptionIds: ["A", "C"], explanation: "Both apply.", accessLevel: "PREMIUM", sourceNumber: 2 },
    ],
  };
  const { questions, report } = await upload(input);
  const preview = previewQuestions(questions);
  assert.equal(report.sourceKind, "json");
  assert.equal(report.extracted, 2);
  assert.equal(report.readyToImport, 2);
  assert.equal(report.detectedAnswerLines, null);
  assert.equal(questions[0].accessLevel, "FREE");
  assert.equal(questions[1].accessLevel, "PREMIUM");
  assert.deepEqual(questions[0].correctOptionIds, ["B"]);
  assert.equal(questions[0].sourcePage, 3);
  assert.deepEqual(preview.map(question => question.importErrors), [[], []]);
  assert.deepEqual(preview.map(question => question.importWarnings), [[], []]);
  assert.equal((await upload(input.questions)).questions.length, 2);
});

test("JSON preview flags malformed option IDs, unsupported types and missing answer keys", async () => {
  const { questions, report } = await upload({ questions: [
    { text: "Which option?", options: [{ id: "B", text: "First" }, ...options.slice(1)], correctOptionIds: ["A"] },
    { type: "IMAGE_PBQ", text: "Click the diagram", options, correctOptionIds: [] },
    { text: "No answer", options, correctOptionIds: [] },
  ] });
  const preview = previewQuestions(questions);
  assert.equal(report.readyToImport, 0);
  assert.match(preview[0].importErrors.join(" "), /option 1 must use ID A/);
  assert.match(preview[1].importErrors.join(" "), /create PBQs separately/);
  assert.match(preview[2].importErrors.join(" "), /Select exactly one correct answer/);
});

test("questions without explanations remain ready to publish", async () => {
  const { questions, report } = await upload({ questions: [
    { type: "SINGLE_CHOICE", text: "Choose the first option", options, correctOptionIds: ["A"] },
  ] });
  assert.equal(report.missingExplanations, 1);
  assert.equal(report.readyToImport, 1);
  assert.equal(report.readyToPublish, 1);
  assert.deepEqual(previewQuestions(questions)[0].errors, []);
});

test("JSON import rejects syntax errors, wrong shape and oversized batches", async () => {
  await assert.rejects(extractQuestionsWithReport(Buffer.from("{bad"), ".json"), /Invalid JSON/);
  await assert.rejects(upload({ rows: [] }), /questions.*array/);
  await assert.rejects(upload({ questions: [] }), /empty/);
  await assert.rejects(upload({ questions: Array.from({ length: 1001 }, () => ({})) }), /1,000/);
});

test("downloadable JSON template round-trips through the importer", async () => {
  let filename;
  let body;
  const response = {
    attachment(value) { filename = value; return this; },
    json(value) { body = value; return this; },
  };
  await downloadTemplate({ params: { format: "json" } }, response);
  assert.equal(filename, "question-template.json");
  const { questions, report } = await upload(body);
  assert.equal(report.readyToImport, 1);
  assert.equal(questions[0].accessLevel, "FREE");
  assert.deepEqual(previewQuestions(questions)[0].importErrors, []);
});
