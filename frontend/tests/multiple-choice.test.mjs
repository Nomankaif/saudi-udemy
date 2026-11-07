import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(new URL("../package.json", import.meta.url));
const jsx = require("react/jsx-runtime");
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const label = node => [node.props.children].flat(Infinity).filter(value => typeof value === "string" || typeof value === "number").join("");
const options = ["10.0.0.1", "8.8.8.8", "192.168.1.1", "1.1.1.1"].map((text, i) => ({ id: String.fromCharCode(65 + i), text }));
const question = (extra = {}) => ({ type: "MULTIPLE_CHOICE", text: "Which addresses are private?", options, correctOptionIds: ["A", "C"], explanation: "Private ranges", accessLevel: "FREE", topic: "IPv4", difficulty: "EASY", imageUrl: "", displayOrder: 1, ...extra });

function harness(file, api = async () => ({}), editorChecks) {
  let cursor = 0, refCursor = 0, first = true;
  const states = [], refs = [], effects = [];
  const modules = {
    "react/jsx-runtime": jsx,
    react: {
      useId: () => "choice-fixture",
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = typeof v === "function" ? v(states[i]) : v; }]; },
      useRef(initial) { const i = refCursor++; return refs[i] ||= { current: initial }; },
      useCallback: fn => fn, useEffect: fn => { if (first) effects.push(fn); },
    },
    "next/link": "a", "next/image": "img", "next/navigation": { useRouter: () => ({ push() {}, replace() {} }) },
    "lucide-react": new Proxy({}, { get: () => "svg" }),
    "@/lib/api": { api, ApiError: class extends Error {}, messageOf: e => e.message },
    "./question-content": { QuestionContent: "article" }, "@/components/question-content": { QuestionContent: "article" },
    "./access-requests": { RequestAccess: "aside" },
    "./drag-drop-question": { DragDropQuestion: "drag", DragDropReview: "drag-review" },
    "@/components/drag-drop-question": { DragDropQuestion: "drag", DragDropReview: "drag-review" },
    "./image-pbq": { ImagePbq: "pbq", PbqReview: "pbq-review" },
    "@/components/image-pbq": { ImagePbq: "pbq", PbqReview: "pbq-review" },
    "@/components/choice-question": { ChoiceQuestion: "choice" },
    "./pbq-editor": { PbqEditor: "pbq-editor", pbqIssues: () => [] },
    "./drag-drop-editor": { DragDropEditor: "drag-editor", dragDropIssues: () => [] },
    "./question-editor": { QuestionEditor: "question-editor", questionIssues: editorChecks?.questionIssues || (() => []), importQuestionIssues: editorChecks?.importQuestionIssues || (() => []) },
    "./ui": { inputClass: "input", primaryButton: "primary", secondaryButton: "secondary" },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; }, setTimeout, clearTimeout, FormData, URL, window: { confirm: () => { throw new Error("MCQ type changes must preserve content without a destructive confirmation"); }, addEventListener() {}, removeEventListener() {} }, Date };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../components/${file}.tsx`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  function render(name, props) {
    cursor = 0; refCursor = 0;
    const found = [];
    function visit(n) { if (Array.isArray(n)) return n.forEach(visit); if (!n?.props) return; found.push(n); visit(n.props.children); }
    visit(context.exports[name](props)); first = false; return found;
  }
  return { render, exports: context.exports, mount: () => effects.forEach(fn => fn()) };
}

test("admin import offers separate document and JSON tabs with a JSON template", () => {
  const h = harness("admin/import-questions");
  const render = () => h.render("ImportQuestions", { examId: "exam-1", onImported() {} });
  let nodes = render();
  assert.equal(nodes.find(node => node.props.id === "import-files-tab").props["aria-selected"], true);
  assert.equal(nodes.find(node => node.props["aria-label"] === "Import question file").props.accept, ".pdf,.docx,.xlsx,.csv");
  nodes.find(node => node.props.id === "import-json-tab").props.onClick();
  nodes = render();
  assert.equal(nodes.find(node => node.props.id === "import-json-tab").props["aria-selected"], true);
  assert.equal(nodes.find(node => node.props["aria-label"] === "Import JSON question file").props.accept, ".json,application/json");
  assert.ok(nodes.some(node => node.props.href === "/api/backend/exams/templates/json"));
});

test("import review filters doubtful and missing-answer rows and blocks invalid bulk selections", async () => {
  const editorChecks = harness("admin/question-editor").exports;
  const rows = [
    question({ text: "Clean question", sourceNumber: 1 }),
    question({ text: "Needs source review", sourceNumber: 2, importWarnings: ["Check the diagram"] }),
    question({ text: "No answer key", sourceNumber: 3, correctOptionIds: [], importErrors: ["Answer key missing"] }),
    question({ text: "Suspected duplicate", sourceNumber: 4, duplicate: true }),
    question({ text: "Repeated number", sourceNumber: 4, duplicateSourceNumber: true }),
  ];
  const report = { sourceKind: "json", detectedHeadings: 5, detectedAnswerLines: null, numberedRange: null, extracted: 5, readyToImport: 4, readyToPublish: 4, missingAnswers: 1, missingExplanations: 0, needsSourceReview: 1, duplicateNumbers: 1, missingNumbers: [], hasSimulationSection: false };
  const h = harness("admin/import-questions", async path => {
    assert.match(path, /\/import\/preview$/);
    return { questions: rows, report };
  }, editorChecks);
  const render = () => h.render("ImportQuestions", { examId: "exam-1", onImported() {} });
  render().find(node => node.props["aria-label"] === "Import question file").props.onChange({ target: { files: [{ name: "sample.json" }] } });
  await tick();
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 1").props.checked, true);
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 2").props.checked, false);
  render().find(node => node.type === "button" && label(node) === "Select all 5").props.onClick();
  assert.equal(render().find(node => node.type === "button" && label(node).includes("selected drafts")).props.disabled, true);
  render().find(node => node.type === "button" && label(node) === "Select valid 3").props.onClick();
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 2").props.checked, true);
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 3").props.checked, false);
  render().find(node => node.props["aria-label"] === "Filter review status").props.onChange({ target: { value: "review" } });
  assert.equal(render().filter(node => String(node.props["aria-label"] || "").startsWith("Import row ")).length, 3);
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 2").props.checked, true);
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 4").props.checked, false);
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 5").props.checked, true);
  render().find(node => node.props["aria-label"] === "Filter review status").props.onChange({ target: { value: "all" } });
  render().find(node => node.props["aria-label"] === "Filter answer key").props.onChange({ target: { value: "missing" } });
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 3").props.checked, false);
  assert.equal(render().filter(node => String(node.props["aria-label"] || "").startsWith("Import row ")).length, 1);
  render().find(node => node.type === "button" && label(node) === "Fix").props.onClick();
  assert.equal(render().find(node => node.props.role === "dialog").props["aria-modal"], "true");
  assert.ok(render().some(node => node.props["aria-label"] === "Close correction"));
  await render().find(node => node.type === "question-editor").props.onSave({ ...rows[2], correctOptionIds: ["A", "C"] });
  assert.equal(render().some(node => node.props.role === "dialog"), false);
  assert.equal(render().filter(node => String(node.props["aria-label"] || "").startsWith("Import row ")).length, 0);
  render().find(node => node.props["aria-label"] === "Filter answer key").props.onChange({ target: { value: "all" } });
  render().find(node => node.props["aria-label"] === "Filter review status").props.onChange({ target: { value: "clean" } });
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 3").props.checked, true);
  render().find(node => node.type === "button" && label(node) === "Select clean 2").props.onClick();
  assert.equal(render().find(node => node.type === "button" && label(node).includes("selected drafts")).props.disabled, false);
  render().find(node => node.props["aria-label"] === "Filter review status").props.onChange({ target: { value: "review" } });
  render().find(node => node.props["aria-label"] === "Filter answer key").props.onChange({ target: { value: "all" } });
  render().find(node => node.type === "button" && label(node) === "Fix").props.onClick();
  await render().find(node => node.type === "question-editor").props.onSave(rows[1]);
  assert.equal(render().some(node => node.props.role === "dialog"), false);
  assert.equal(render().filter(node => String(node.props["aria-label"] || "").startsWith("Import row ")).length, 2);
  render().find(node => node.props["aria-label"] === "Filter review status").props.onChange({ target: { value: "clean" } });
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 2").props.checked, true);
  assert.ok(render().some(node => node.type === "span" && label(node) === "Ready"));
});

test("reviewing a doubtful duplicate moves it to Ready and permits its import", async () => {
  const editorChecks = harness("admin/question-editor").exports;
  const row = question({ text: "Possible duplicate", duplicate: true, importWarnings: ["Verify against source"] });
  const report = { sourceKind: "json", detectedHeadings: 1, detectedAnswerLines: null, numberedRange: null, extracted: 1, readyToImport: 1, readyToPublish: 1, missingAnswers: 0, missingExplanations: 0, needsSourceReview: 1, duplicateNumbers: 0, missingNumbers: [], hasSimulationSection: false };
  let committed, imported = 0;
  const h = harness("admin/import-questions", async (path, options) => {
    if (path.endsWith("/import/preview")) return { questions: [row], report };
    committed = JSON.parse(options.body);
    return { imported: 1 };
  }, editorChecks);
  const render = () => h.render("ImportQuestions", { examId: "exam-1", onImported() { imported++; } });
  render().find(node => node.props["aria-label"] === "Import question file").props.onChange({ target: { files: [{ name: "sample.json" }] } });
  await tick();
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 1").props.checked, false);
  render().find(node => node.type === "button" && label(node) === "Fix").props.onClick();
  await render().find(node => node.type === "question-editor").props.onSave(row);
  assert.ok(render().some(node => node.type === "span" && label(node) === "Ready"));
  assert.equal(render().find(node => node.props["aria-label"] === "Import row 1").props.checked, true);
  assert.equal(render().find(node => node.type === "button" && label(node).includes("selected drafts")).props.disabled, false);
  render().find(node => node.type === "button" && label(node).includes("selected drafts")).props.onClick();
  await tick();
  assert.equal(committed.allowDuplicates, true);
  assert.equal(imported, 1);
});

test("student multiple answers toggle independently, clear and remain keyboard-native checkboxes", () => {
  const h = harness("choice-question"); let value = [];
  const render = (extra = {}) => h.render("ChoiceQuestion", { options, multiple: true, value, onChange: next => { value = next; }, ...extra });
  let inputs = render().filter(n => n.type === "input");
  assert.ok(inputs.every(n => n.props.type === "checkbox"));
  inputs[0].props.onChange(); render().filter(n => n.type === "input")[2].props.onChange();
  assert.deepEqual(plain(value), ["A", "C"]);
  assert.equal(render().filter(n => n.type === "input" && n.props.checked).length, 2);
  render({ disabled: true }).find(n => n.type === "input").props.onChange();
  assert.deepEqual(plain(value), ["A", "C"]);
  render().filter(n => n.type === "input")[0].props.onChange();
  assert.deepEqual(plain(value), ["C"]);
  render().filter(n => n.type === "input")[2].props.onChange();
  assert.deepEqual(plain(value), []);
  assert.ok(render().some(n => n.type === "legend" && n.props.children.includes("every correct option")));
});

test("single choice still replaces the selection and never shows checkboxes", () => {
  const h = harness("choice-question"); let value = ["A"];
  const render = () => h.render("ChoiceQuestion", { options, value, onChange: next => { value = next; } });
  assert.ok(render().filter(n => n.type === "input").every(n => n.props.type === "radio"));
  render().filter(n => n.type === "input")[2].props.onChange();
  assert.deepEqual(plain(value), ["C"]);
});

test("admin preserves options when changing MCQ type, selects multiple keys, previews and saves them", () => {
  const h = harness("admin/question-editor"); let saved;
  const props = { initial: question({ type: "SINGLE_CHOICE", correctOptionIds: ["A"] }), onSave: async q => { saved = q; } };
  const render = () => h.render("QuestionEditor", props);
  render().find(n => n.type === "select" && n.props.value === "SINGLE_CHOICE").props.onChange({ target: { value: "MULTIPLE_CHOICE" } });
  assert.ok(render().some(n => n.type === "li" && n.props.children === "Select two or more correct answers"));
  render().find(n => n.props["aria-label"] === "Option C is correct").props.onChange();
  assert.ok(!render().some(n => n.type === "li"));
  assert.equal(render().find(n => n.props["aria-label"] === "Option C").props.value, options[2].text);
  assert.equal(render().find(n => n.props["aria-label"] === "Option C is correct").props.type, "checkbox");
  render().find(n => n.type === "button" && Array.isArray(n.props.children) && n.props.children.includes("Save draft")).props.onClick();
  assert.deepEqual(plain(saved.correctOptionIds), ["A", "C"]);
  assert.equal(saved.type, "MULTIPLE_CHOICE");
  render().find(n => n.type === "button" && Array.isArray(n.props.children) && n.props.children.includes("Student preview")).props.onClick();
  assert.equal(render().find(n => n.type === "choice").props.multiple, true);
  render().find(n => n.type === "button" && Array.isArray(n.props.children) && n.props.children.includes("Editor")).props.onClick();
  render().find(n => n.type === "select" && n.props.value === "MULTIPLE_CHOICE").props.onChange({ target: { value: "SINGLE_CHOICE" } });
  assert.ok(render().some(n => n.type === "li" && n.props.children === "Select exactly one correct answer"));
  render().find(n => n.props["aria-label"] === "Option C is correct").props.onChange();
  assert.ok(!render().some(n => n.type === "li"));
  for (const key of [["A"], ["A", "A"], ["A", "Z"]]) assert.ok(h.exports.questionIssues(question({ correctOptionIds: key })).length);
});

test("import corrections offer both MCQ types, not unsupported drag-and-drop/PBQ conversions", () => {
  const h = harness("admin/question-editor");
  const tree = h.render("QuestionEditor", { initial: question(), importMode: true, onSave: async () => {} });
  assert.ok(tree.some(n => n.type === "option" && n.props.value === "MULTIPLE_CHOICE"));
  assert.ok(!tree.some(n => n.type === "option" && ["DRAG_DROP", "IMAGE_PBQ"].includes(n.props.value)));
  assert.ok(!tree.some(n => n.type === "button" && label(n) === "Student preview"));
  assert.ok(tree.some(n => n.type === "button" && label(n) === "Save & move to Ready"));
  assert.equal(tree.find(n => n.type === "select" && n.props.value === "MULTIPLE_CHOICE").props.disabled, undefined);
});

test("import editor enables move to Ready only after the missing answer is corrected", () => {
  const h = harness("admin/question-editor");
  const render = () => h.render("QuestionEditor", { initial: question({ correctOptionIds: [], explanation: "" }), importMode: true, onSave: async () => {} });
  const save = () => render().find(n => n.type === "button" && label(n) === "Save & move to Ready");
  assert.equal(save().props.disabled, true);
  render().find(n => n.props["aria-label"] === "Option A is correct").props.onChange();
  render().find(n => n.props["aria-label"] === "Option C is correct").props.onChange();
  assert.equal(save().props.disabled, false);
});

test("admin can add option E and publish without an explanation", () => {
  const h = harness("admin/question-editor");
  const render = () => h.render("QuestionEditor", { initial: question({ type: "SINGLE_CHOICE", correctOptionIds: ["A"] }), onSave: async () => {} });
  render().find(n => n.type === "button" && n.props.children === "Add option").props.onClick();
  render().find(n => n.props["aria-label"] === "Option E").props.onChange({ target: { value: "Fifth option" } });
  render().find(n => n.props["aria-label"] === "Option E is correct").props.onChange();
  assert.deepEqual(plain(h.exports.questionIssues({ ...question(), type: "SINGLE_CHOICE", options: [...options, { id: "E", text: "Fifth option" }], correctOptionIds: ["E"] })), []);
  assert.deepEqual(plain(h.exports.questionIssues({ ...question(), explanation: "" })), []);
  assert.deepEqual(plain(h.exports.importQuestionIssues({ ...question(), explanation: "" })), []);
  assert.equal(render().find(n => n.props["aria-label"] === "Option E is correct").props.checked, true);
});

test("runner resumes multiple selections and coalesces rapid changes without losing review markers", async () => {
  const payload = { attempt: { _id: "a", examTitle: "MCQs", mode: "PRACTICE", status: "IN_PROGRESS", questionCount: 1, examId: "e" }, questions: [{ ...question(), correctOptionIds: undefined, _id: "q" }], answers: [{ attemptQuestionId: "q", selectedOptionIds: ["A", "C"], markedForReview: true }], progress: [{ id: "q", order: 1, number: 1, answered: true, marked: true }], serverNow: new Date().toISOString() };
  let release; const writes = [];
  const h = harness("exam-runner", async (url, init) => {
    if (!init) return payload;
    writes.push(JSON.parse(init.body));
    if (writes.length === 1) await new Promise(resolve => { release = resolve; });
    return {};
  });
  const render = () => h.render("ExamRunner", { id: "a" });
  render(); h.mount(); await tick();
  const control = () => render().find(n => n.type === "choice");
  assert.deepEqual(plain(control().props.value), ["A", "C"]);
  assert.equal(control().props.multiple, true);
  control().props.onChange(["A"]); await tick();
  assert.equal(control().props.disabled, false);
  control().props.onChange(["A", "B"]); control().props.onChange(["A", "B", "D"]);
  assert.equal(writes.length, 1); release(); await tick(); await tick();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].selectedOptionIds, ["A", "B", "D"]);
  assert.equal(writes[1].markedForReview, true);
  assert.ok(render().some(n => n.props.children === "All changes saved"));
});

test("result review uses the full answer set, not only the first correct option", async () => {
  for (const selected of [["A"], ["C", "A"]]) {
    const complete = selected.length === 2;
    const payload = { result: { score: Number(complete), maximumScore: 1, percentage: complete ? 100 : 0, correctCount: Number(complete), incorrectCount: Number(!complete), unansweredCount: 0, passed: complete, topicResults: [] }, attempt: { examTitle: "MCQs", mode: "PRACTICE", passingPercentage: 70 }, total: 1, questions: [{ ...question(), _id: "q" }], answers: [{ attemptQuestionId: "q", selectedOptionIds: selected }] };
    const h = harness("result-view", async () => payload);
    h.render("ResultView", { id: "a" }); h.mount(); await tick();
    const tree = h.render("ResultView", { id: "a" });
    const card = tree.find(n => n.type === "div" && Array.isArray(n.props.children) && n.props.children.some(child => child?.props?.children === "Your answers"));
    assert.match(card.props.className, complete ? /bg-emerald-50/ : /bg-rose-50/);
    assert.ok(tree.some(n => n.props.children === "A. 10.0.0.1, C. 192.168.1.1"));
  }
});
