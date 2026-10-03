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
const options = ["10.0.0.1", "8.8.8.8", "192.168.1.1", "1.1.1.1"].map((text, i) => ({ id: String.fromCharCode(65 + i), text }));
const question = (extra = {}) => ({ type: "MULTIPLE_CHOICE", text: "Which addresses are private?", options, correctOptionIds: ["A", "C"], explanation: "Private ranges", accessLevel: "FREE", topic: "IPv4", difficulty: "EASY", imageUrl: "", displayOrder: 1, ...extra });

function harness(file, api = async () => ({})) {
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
    "./ui": { inputClass: "input", primaryButton: "primary", secondaryButton: "secondary" },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; }, setTimeout, clearTimeout, window: { confirm: () => { throw new Error("MCQ type changes must preserve content without a destructive confirmation"); }, addEventListener() {}, removeEventListener() {} }, Date };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../components/${file}.tsx`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  function render(name, props) {
    cursor = 0; refCursor = 0;
    const found = [];
    function visit(n) { if (Array.isArray(n)) return n.forEach(visit); if (!n?.props) return; found.push(n); visit(n.props.children); }
    visit(context.exports[name](props)); first = false; return found;
  }
  return { render, exports: context.exports, mount: () => effects.forEach(fn => fn()) };
}

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
  assert.ok(render().some(n => n.type === "li" && n.props.children === "Select two to four correct answers"));
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
  assert.equal(tree.find(n => n.type === "select" && n.props.value === "MULTIPLE_CHOICE").props.disabled, undefined);
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
