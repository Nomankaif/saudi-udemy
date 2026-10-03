import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(new URL("../package.json", import.meta.url));
const jsx = require("react/jsx-runtime");
const settle = () => new Promise(resolve => setImmediate(resolve));
function nodes(root) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node?.props) return;
    result.push(node); visit(node.props.children);
  }
  visit(root); return result;
}
function load(file, modules, extra = {}) {
  const source = readFileSync(new URL(`../components/${file}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const context = { exports: {}, require: name => {
    if (name === "react/jsx-runtime") return jsx;
    if (name === "next/link") return "a";
    if (name === "lucide-react") return new Proxy({}, { get: () => "svg" });
    return modules[name] || {};
  }, ...extra };
  vm.runInNewContext(outputText, context); return context.exports;
}

test("three-dot menu contains only Update and Delete with correct destinations", () => {
  const names = ["DropdownMenu", "DropdownMenuTrigger", "DropdownMenuContent", "DropdownMenuLinkItem", "DropdownMenuItem", "DropdownMenuSeparator"];
  const { CardActions } = load("admin/card-actions.tsx", { "@/components/ui/dropdown-menu": Object.fromEntries(names.map(name => [name, name])) });
  let deleted = false;
  const props = { title: "CCNA", updateHref: "/admin/exams/1?tab=settings", disabled: false, onDelete: () => { deleted = true; } };
  const tree = nodes(CardActions(props));
  assert.equal(tree.find(n => n.type === "DropdownMenuTrigger").props["aria-label"], "Actions for CCNA");
  const items = tree.filter(n => ["DropdownMenuLinkItem", "DropdownMenuItem"].includes(n.type));
  assert.deepEqual(items.map(n => n.props.children[1]), ["Update", "Delete"]);
  assert.equal(items[0].props.render.props.href, props.updateHref);
  items[1].props.onClick(); assert.equal(deleted, true);
  assert.equal(nodes(CardActions({ ...props, disabled: true })).find(n => n.type === "DropdownMenuTrigger").props.disabled, true);
});

function screen(kind, request) {
  const state = [], calls = [], effects = [];
  let cursor = 0, confirmed = false;
  const row = { _id: "1", title: "CCNA", category: "Cisco", status: "DRAFT", questionCount: 0, freeQuestionCount: 0 };
  const prefix = kind === "exam" ? "/exams" : "/labs/admin";
  const listPath = kind === "exam" ? "/exams/admin/all" : "/labs/admin/all";
  const modules = {
    react: {
      useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
      useRef(initial) { const i = cursor++; return state[i] ||= { current: initial }; },
      useEffect(callback) { const i = cursor++; if (!(i in state)) { state[i] = true; effects.push(callback); } },
    },
    "@/lib/api": { api: async (path, options) => { calls.push([path, options]); return path === listPath ? [row] : request(path, options, row); }, messageOf: e => e.message, questionIssuesOf: e => e.details || [] },
    "./card-actions": { CardActions: "CardActions", cardPublishButton: "publish" },
    "../admin/card-actions": { CardActions: "CardActions", cardPublishButton: "publish" },
  };
  const exports = load(kind === "exam" ? "admin/exam-list.tsx" : "labs/admin.tsx", modules, { window: { confirm: () => confirmed } });
  const Component = kind === "exam" ? exports.AdminExamList : exports.AdminLabs;
  const render = () => { cursor = 0; return nodes(Component({})); };
  const find = predicate => { const node = render().find(predicate); assert.ok(node); return node; };
  return {
    calls, prefix, render, find,
    async init() { render(); effects.forEach(effect => effect()); await settle(); },
    publish: () => find(n => n.props["aria-label"] === "Publish CCNA").props.onClick(),
    confirm: value => { confirmed = value; },
  };
}

for (const kind of ["exam", "lab"]) {
  test(`${kind} card shows a text-only Open link beside Publish in equal columns`, async () => {
    const ui = screen(kind, async () => ({})); await ui.init();
    const open = ui.find(n => n.props["aria-label"] === "Open CCNA");
    assert.equal(open.props.children, "Open");
    assert.equal(open.props.href, kind === "exam" ? "/admin/exams/1" : "/admin/labs/1");
    const row = ui.find(n => n.props.className === "mt-auto grid grid-cols-2 gap-3 pt-6");
    assert.equal(row.props.children[0].props["aria-label"], "Open CCNA");
    assert.equal(row.props.children[1].props["aria-label"], "Publish CCNA");
    assert.equal(row.props.children[1].props.children, "Publish");
  });
  test(`${kind} card publishes once, disables actions while pending, and updates its status`, async () => {
    let resolve;
    const ui = screen(kind, () => new Promise(done => { resolve = done; }));
    await ui.init();
    const click = ui.find(n => n.props["aria-label"] === "Publish CCNA").props.onClick;
    click(); click();
    assert.equal(ui.calls.filter(([, options]) => options?.method === "POST").length, 1);
    assert.equal(ui.calls[1][0], `${ui.prefix}/1/publish`);
    assert.equal(ui.find(n => n.props["aria-label"] === "Publish CCNA").props.disabled, true);
    assert.equal(ui.find(n => n.type === "CardActions").props.disabled, true);
    resolve({ status: "PUBLISHED", questionCount: 5 }); await settle();
    assert.ok(ui.render().some(n => n.props.children === "PUBLISHED"));
    assert.equal(ui.find(n => n.props["aria-label"] === "Publish CCNA").props.disabled, false);
    assert.equal(ui.find(n => n.props["aria-label"] === "Publish CCNA").props.children, "Publish");
  });
  test(`${kind} card retains detailed publishing errors and allows retry`, async () => {
    let fail = true;
    const ui = screen(kind, async () => {
      if (fail) throw { message: "Task or question 2 needs a correct answer.", details: [{ question: 2, message: "Assign the correct drop zone.", questionText: "Match the protocols" }] };
      return { status: "PUBLISHED" };
    });
    await ui.init(); ui.publish(); await settle();
    assert.ok(ui.find(n => n.props.role === "alert"));
    assert.ok(ui.render().some(n => n.props.children === "Task or question 2 needs a correct answer."));
    if (kind === "exam") assert.ok(ui.render().some(n => Array.isArray(n.props.children) && n.props.children.includes("Assign the correct drop zone.")));
    assert.ok(ui.render().some(n => n.props.children === "DRAFT"));
    fail = false; ui.publish(); await settle();
    assert.ok(!ui.render().some(n => n.props.role === "alert"));
  });
  test(`${kind} menu delete keeps confirmation and archives only the selected card`, async () => {
    const ui = screen(kind, async () => ({})); await ui.init();
    ui.find(n => n.type === "CardActions").props.onDelete(); await settle();
    assert.equal(ui.calls.length, 1);
    ui.confirm(true); ui.find(n => n.type === "CardActions").props.onDelete(); await settle();
    assert.equal(ui.calls[1][0], `${ui.prefix}/1`);
    assert.equal(ui.calls[1][1].method, "DELETE");
    assert.ok(!ui.render().some(n => n.type === "article"));
  });
}
