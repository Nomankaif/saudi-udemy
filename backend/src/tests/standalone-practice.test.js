import test from "node:test";
import assert from "node:assert/strict";
import { DragDropPractice, PerformancePractice } from "../models/standalone-practice.model.js";
import { getPublicPractice, submitPractice, createPractice } from "../controllers/standalone-practice.controller.js";

const dragQuestion = {
  type: "DRAG_DROP", text: "Place each device", options: [{ id: "router", text: "Router" }],
  dropTargets: [{ id: "network", label: "Network", capacity: 1 }],
  correctPlacements: [{ itemId: "router", targetId: "network" }],
  correctOptionIds: [], explanation: "The router connects networks.", marks: 1, topic: "Networking",
};
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } });

test("standalone public question hides the answer until submission", async () => {
  const original = DragDropPractice.findOne;
  DragDropPractice.findOne = () => ({ lean: async () => ({ _id: "item-1", title: "Unpublished edit", publishedTitle: "Devices", publishedCategory: "Cisco", publishedSubcategory: "CCNA", publishedQuestion: dragQuestion }) });
  try {
    const visible = response();
    await getPublicPractice({ params: { kind: "drag-drop", id: "item-1" } }, visible);
    assert.equal(visible.body.title, "Devices");
    assert.equal(visible.body.question.correctPlacements, undefined);
    assert.equal(visible.body.question.explanation, undefined);
    const graded = response();
    await submitPractice({ params: { kind: "drag-drop", id: "item-1" }, body: { placements: [{ itemId: "router", targetId: "network" }] } }, graded);
    assert.equal(graded.body.score, 1);
    assert.deepEqual(graded.body.correctPlacements, dragQuestion.correctPlacements);
  } finally { DragDropPractice.findOne = original; }
});

test("published Drag and Drop bank serves its question list without answer keys and grades the selected question", async () => {
  const original = DragDropPractice.findOne;
  const second = { ...dragQuestion, text: "Place the switch", options: [{ id: "switch", text: "Switch" }], correctPlacements: [{ itemId: "switch", targetId: "network" }] };
  DragDropPractice.findOne = () => ({ lean: async () => ({ _id: "bank-1", publishedTitle: "CCNA", publishedCategory: "Cisco", publishedSubcategory: "CCNA", publishedQuestion: dragQuestion, publishedQuestions: [dragQuestion, second] }) });
  try {
    const visible = response();
    await getPublicPractice({ params: { kind: "drag-drop", id: "bank-1" } }, visible);
    assert.equal(visible.body.questions.length, 2);
    assert.equal(visible.body.questions[1].correctPlacements, undefined);
    const graded = response();
    await submitPractice({ params: { kind: "drag-drop", id: "bank-1" }, body: { questionIndex: 1, placements: [{ itemId: "switch", targetId: "network" }] } }, graded);
    assert.equal(graded.body.score, 1);
    assert.deepEqual(graded.body.correctPlacements, second.correctPlacements);
  } finally { DragDropPractice.findOne = original; }
});

test("each standalone type writes to its own collection and enforces its question type", async () => {
  const dragCreate = DragDropPractice.create;
  const pbqCreate = PerformancePractice.create;
  const calls = [];
  DragDropPractice.create = async value => { calls.push(["drag", value]); return value; };
  PerformancePractice.create = async value => { calls.push(["pbq", value]); return value; };
  try {
    const base = { title: "Question", category: "Cisco", subcategory: "CCNA", question: { text: "Configure the diagram", type: "SINGLE_CHOICE", options: [], dropTargets: [], correctPlacements: [], pbq: { alt: "", areas: [] }, pbqKey: [] } };
    await createPractice({ params: { kind: "drag-drop" }, body: base }, response());
    await createPractice({ params: { kind: "performance-based" }, body: base }, response());
    assert.equal(calls[0][0], "drag");
    assert.equal(calls[0][1].draftQuestion.type, "DRAG_DROP");
    assert.equal(calls[1][0], "pbq");
    assert.equal(calls[1][1].draftQuestion.type, "IMAGE_PBQ");
  } finally { DragDropPractice.create = dragCreate; PerformancePractice.create = pbqCreate; }
});
