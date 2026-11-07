import test from "node:test";
import assert from "node:assert/strict";
import Category from "../models/category.model.js";
import Question from "../models/question.model.js";
import { DragDropPractice } from "../models/standalone-practice.model.js";
import { publishDragDropBank } from "../controllers/drag-drop-bank.controller.js";
import DragDropImport from "../models/drag-drop-import.model.js";
import { commitDragDropImport } from "../controllers/drag-drop-import.controller.js";
import { parseJsonCandidates } from "../services/drag-drop-import.service.js";
import Exam from "../models/exam.model.js";
import PublishedQuestion from "../models/published-question.model.js";
import { syncExistingDragDropExams } from "../services/drag-drop-exam.service.js";

const response = () => ({ json(value) { this.body = value; return this; } });
const question = {
  type: "DRAG_DROP", text: "Match each network device to its purpose.",
  options: [{ id: "router", text: "Router" }, { id: "switch", text: "Switch" }],
  dropTargets: [{ id: "routes", label: "Routes packets", capacity: 1 }],
  correctPlacements: [{ itemId: "router", targetId: "routes" }],
  correctOptionIds: [], accessLevel: "FREE", difficulty: "MEDIUM",
  importSourceHash: "private-source-hash", importSourceNumber: 3,
};

test("bank publish snapshots validated questions without import metadata", async () => {
  const originalFindBank = DragDropPractice.findById;
  const originalFindQuestion = Question.find;
  const originalFindCategory = Category.findOne;
  const originalFindExam = Exam.findById;
  const originalCreateExam = Exam.create;
  const originalInsertPublished = PublishedQuestion.insertMany;
  const published = [];
  const exams = [];
  const bank = {
    _id: "bank-id", title: "CCNA Drag and Drop", category: "Cisco", subcategory: "CCNA",
    draftQuestion: { text: "" }, status: "DRAFT", hasUnpublishedChanges: true,
    async save() {},
  };
  DragDropPractice.findById = async () => bank;
  Question.find = () => ({ select() { return this; }, sort() { return this; }, async lean() { return [question]; } });
  Category.findOne = () => ({ async lean() { return { name: "Cisco", subcategories: [{ name: "CCNA", key: "ccna" }] }; } });
  Exam.findById = async () => null;
  Exam.create = async document => { exams.push(document); return document; };
  PublishedQuestion.insertMany = async documents => { published.push(...documents); };
  try {
    const result = response();
    await publishDragDropBank({ params: { id: "bank-id" } }, result);
    assert.equal(result.body.count, 1);
    assert.equal(bank.status, "PUBLISHED");
    assert.equal(bank.publishedQuestions.length, 1);
    assert.deepEqual(bank.publishedQuestions[0].correctPlacements, [{ itemId: "router", targetId: "routes" }]);
    assert.equal(bank.publishedQuestions[0].importSourceHash, undefined);
    assert.equal(exams[0].slug, "drag-drop-bank-id");
    assert.equal(exams[0].sourceKind, "DRAG_DROP_BANK");
    assert.equal(exams[0].questionCount, 1);
    assert.equal(published[0].examId, bank._id);
    assert.equal(published[0].type, "DRAG_DROP");
    assert.deepEqual(published[0].correctPlacements, [{ itemId: "router", targetId: "routes" }]);
  } finally {
    DragDropPractice.findById = originalFindBank;
    Question.find = originalFindQuestion;
    Category.findOne = originalFindCategory;
    Exam.findById = originalFindExam;
    Exam.create = originalCreateExam;
    PublishedQuestion.insertMany = originalInsertPublished;
  }
});

test("imported rows are added to the selected Drag and Drop bank", async () => {
  const originalImport = DragDropImport.findById;
  const originalBank = DragDropPractice.findById;
  const originalCategory = Category.findOne;
  const originalQuestion = Question.findOne;
  const originalInsert = Question.insertMany;
  const [candidate] = parseJsonCandidates(Buffer.from(JSON.stringify({ questions: [question] })), "Cisco", "CCNA");
  const bank = { _id: "bank-id", draftQuestion: { text: "" }, hasUnpublishedChanges: false, async save() {} };
  const inserted = [];
  DragDropImport.findById = async () => ({ status: "READY", bankId: "bank-id", category: "Cisco", subcategory: "CCNA", sourceHash: "source-hash", candidates: [candidate] });
  DragDropPractice.findById = async () => bank;
  Category.findOne = () => ({ async lean() { return { name: "Cisco", subcategories: [{ name: "CCNA", key: "ccna" }] }; } });
  Question.findOne = () => ({ select() { return this; }, sort() { return this; }, async lean() { return null; } });
  Question.insertMany = async documents => { inserted.push(...documents); };
  try {
    const result = response();
    await commitDragDropImport({ params: { id: "job-id" }, body: { selected: [0] } }, result);
    assert.equal(result.body.imported, 1);
    assert.equal(inserted[0].examId, "bank-id");
    assert.equal(inserted[0].type, "DRAG_DROP");
    assert.equal(inserted[0].importSourceHash, "source-hash");
    assert.equal(bank.hasUnpublishedChanges, true);
  } finally {
    DragDropImport.findById = originalImport;
    DragDropPractice.findById = originalBank;
    Category.findOne = originalCategory;
    Question.findOne = originalQuestion;
    Question.insertMany = originalInsert;
  }
});

test("existing published banks are added to the shared exam simulator once", async () => {
  const originalFindBanks = DragDropPractice.find;
  const originalExists = Exam.exists;
  const originalFindExam = Exam.findById;
  const originalCreateExam = Exam.create;
  const originalInsertPublished = PublishedQuestion.insertMany;
  const created = [];
  const snapshots = [];
  DragDropPractice.find = () => ({ async lean() { return [{
    _id: "existing-bank", title: "CCNA", publishedTitle: "CCNA Drag and Drop",
    category: "Cisco", subcategory: "CCNA", publishedCategory: "Cisco", publishedSubcategory: "CCNA",
    publishedAt: new Date("2026-10-01"), publishedQuestions: [question],
  }]; } });
  Exam.exists = async () => created.length > 0;
  Exam.findById = async () => null;
  Exam.create = async value => { created.push(value); return value; };
  PublishedQuestion.insertMany = async values => { snapshots.push(...values); };
  try {
    await syncExistingDragDropExams();
    await syncExistingDragDropExams();
    assert.equal(created.length, 1);
    assert.equal(snapshots.length, 1);
    assert.equal(created[0].publishedRelease, snapshots[0].release);
    assert.equal(created[0].publishedAt.toISOString(), "2026-10-01T00:00:00.000Z");
  } finally {
    DragDropPractice.find = originalFindBanks;
    Exam.exists = originalExists;
    Exam.findById = originalFindExam;
    Exam.create = originalCreateExam;
    PublishedQuestion.insertMany = originalInsertPublished;
  }
});
