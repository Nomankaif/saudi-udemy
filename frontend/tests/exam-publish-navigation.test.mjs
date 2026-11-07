import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(new URL("../package.json", import.meta.url));
const jsx = require("react/jsx-runtime");
const tick = () => new Promise(resolve => setImmediate(resolve));
const label = node => [node.props.children].flat(Infinity).filter(value => typeof value === "string").join("");

function workspace(publishError) {
  const states = [], refs = [], effects = [], calls = [], destinations = [];
  let cursor = 0, refCursor = 0, first = true;
  const exam = { _id: "exam-1", title: "Network+", slug: "network-plus", status: "DRAFT", draftCount: 1, draftFree: 1 };
  const modules = {
    "react/jsx-runtime": jsx,
    react: {
      useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }]; },
      useRef(initial) { const index = refCursor++; return refs[index] ||= { current: initial }; },
      useCallback: callback => callback,
      useEffect(callback) { if (first) effects.push(callback); },
    },
    "next/link": "a",
    "next/image": "img",
    "next/navigation": { useRouter: () => ({ push: path => destinations.push(path) }) },
    "lucide-react": new Proxy({}, { get: () => "svg" }),
    "@/lib/api": {
      api: async (path, options) => {
        calls.push([path, options]);
        if (path.endsWith("/publish")) { if (publishError) throw publishError; return {}; }
        if (path === "/exams/admin/exam-1") return exam;
        if (path === "/exams/exam-1/questions" && options?.method === "POST") return { _id: "typed-1", ...JSON.parse(options.body) };
        return { questions: [], total: 0, page: 1 };
      },
      messageOf: error => error.message,
      questionIssuesOf: error => error.details || [],
    },
    "./ui": { inputClass: "input", primaryButton: "primary", secondaryButton: "secondary" },
    "./question-editor": { QuestionEditor: "question-editor", blankQuestion: type => ({ type }) },
    "./import-questions": { ImportQuestions: "import-questions" },
    "./category-fields": { CategoryFields: "category-fields" },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; }, setTimeout: callback => { callback(); return 1; }, clearTimeout() {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../components/admin/exam-workspace.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  function render() {
    cursor = 0; refCursor = 0;
    const found = [];
    function visit(node) { if (Array.isArray(node)) return node.forEach(visit); if (!node?.props) return; found.push(node); visit(node.props.children); }
    visit(context.exports.ExamWorkspace({ id: "exam-1" }));
    first = false;
    return found;
  }
  return { render, mount: () => effects.forEach(effect => effect()), calls, destinations };
}

test("publishing from the exam studio returns to the admin exams list", async () => {
  const ui = workspace();
  ui.render(); ui.mount(); await tick();
  const button = ui.render().find(node => node.type === "button" && label(node) === "Publish exam");
  assert.equal(button.props.disabled, false);
  button.props.onClick();
  await tick();
  assert.ok(ui.calls.some(([path, options]) => path === "/exams/exam-1/publish" && options.method === "POST"));
  assert.deepEqual(ui.destinations, ["/admin/exams"]);
});
test("a failed publish stays in the studio to show the error", async () => {
  const ui = workspace(new Error("Fix question 2"));
  ui.render(); ui.mount(); await tick();
  ui.render().find(node => node.type === "button" && label(node) === "Publish exam").props.onClick();
  await tick();
  assert.deepEqual(ui.destinations, []);
  assert.ok(ui.render().some(node => node.type === "p" && label(node).includes("Fix question 2")));
});
