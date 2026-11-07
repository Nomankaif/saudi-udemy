import test from "node:test";
import assert from "node:assert/strict";
import { buildPdfCandidates, parseJsonCandidates } from "../services/drag-drop-import.service.js";
import DragDropImport from "../models/drag-drop-import.model.js";
import { updateDragDropCandidate } from "../controllers/drag-drop-import.controller.js";

const template = {
  version: 1,
  questions: [{
    title: "Match devices",
    text: "Match each device with its role.",
    options: [{ id: "router", text: "Router" }, { id: "switch", text: "Switch" }, { id: "unused", text: "Unused" }],
    dropTargets: [{ id: "routes", label: "Routes packets", capacity: 1 }, { id: "frames", label: "Forwards frames", capacity: 1 }],
    correctPlacements: [{ itemId: "router", targetId: "routes" }, { itemId: "switch", targetId: "frames" }],
  }],
};

test("valid JSON rows can be selected for draft import", () => {
  const [row] = parseJsonCandidates(Buffer.from(JSON.stringify(template)), "Cisco", "CCNA");
  assert.deepEqual(row.errors, []);
  assert.equal(row.reviewed, true);
  assert.equal(row.question.accessLevel, "FREE");
  assert.equal(row.question.correctPlacements.length, 2);
});

test("malformed JSON rows remain in review with specific errors", () => {
  const rows = parseJsonCandidates(Buffer.from(JSON.stringify({ questions: [{ title: "Incomplete", text: "Sort the items", options: "wrong" }] })), "Cisco", "CCNA");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reviewed, false);
  assert.ok(rows[0].errors.some(issue => issue.includes("options array")));
  assert.ok(rows[0].errors.some(issue => issue.includes("destination")));
});

test("correcting a malformed JSON row clears shape errors and marks it ready", async () => {
  const originalFind = DragDropImport.findById;
  const [row] = parseJsonCandidates(Buffer.from(JSON.stringify({ questions: [{ title: "Incomplete", text: "Sort the items", options: "wrong" }] })), "Cisco", "CCNA");
  const job = { status: "READY", sourceKind: "json", candidates: [row], markModified() {}, async save() {} };
  DragDropImport.findById = async () => job;
  try {
    const response = { json(value) { this.body = value; return this; } };
    await updateDragDropCandidate({ params: { id: "job-id", index: "0" }, body: { title: template.questions[0].title, question: template.questions[0], reviewed: true } }, response);
    assert.deepEqual(response.body.errors, []);
    assert.equal(response.body.reviewed, true);
  } finally {
    DragDropImport.findById = originalFind;
  }
});

test("repeated JSON source numbers are renumbered and flagged", () => {
  const input = { questions: [
    { ...template.questions[0], sourceNumber: 3 },
    { ...template.questions[0], sourceNumber: 3 },
  ] };
  const rows = parseJsonCandidates(Buffer.from(JSON.stringify(input)), "Cisco", "CCNA");
  assert.notEqual(rows[0].sourceNumber, rows[1].sourceNumber);
  assert.equal(rows[1].reviewed, false);
  assert.match(rows[1].warnings[0], /renumbered/);
});

test("PDF candidates retain source pages and flag incomplete OCR answers", () => {
  const pages = [
    { page: 1, number: 1, total: 2, prompt: "Drag and drop the devices.", answer: false, blocks: [] },
    { page: 2, number: 1, total: 2, prompt: "", answer: false, blocks: [
      { color: "blue", text: "Router", top: 100, left: 50, confidence: 90 },
      { color: "blue", text: "Switch", top: 150, left: 50, confidence: 90 },
      { color: "yellow", text: "Routes packets", top: 100, left: 600, confidence: 90 },
    ] },
    { page: 3, number: null, total: null, prompt: "", answer: true, blocks: [] },
  ];
  const result = buildPdfCandidates(pages, "Cisco", "CCNA");
  assert.equal(result.expectedItems, 2);
  assert.deepEqual(result.candidates[0].sourcePages, [1, 2, 3]);
  assert.deepEqual(result.candidates[0].answerPages, [3]);
  assert.equal(result.candidates[0].reviewed, false);
  assert.ok(result.candidates[0].warnings.some(issue => issue.includes("Answer mapping")));
  assert.ok(result.candidates[1].errors.some(issue => issue.includes("not found")));
});
