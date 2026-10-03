import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(new URL("../package.json", import.meta.url));
const jsx = require("react/jsx-runtime");

// Exercise the component's real handlers without accessing the user's admin session.
function screen(request = async () => ({ name: "Cisco Systems" })) {
  const source = readFileSync(new URL("../components/admin/categories.tsx", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  const state = [], calls = [];
  let cursor = 0, refreshes = 0;
  const modules = {
    "react/jsx-runtime": jsx,
    react: { useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; } },
    "lucide-react": { Pencil: "svg", Trash2: "svg", ChevronDown: "svg" },
    "@/lib/api": { api: async (...args) => { calls.push(args); return request(...args); }, messageOf: error => error.message },
    "./ui": { AdminHeading: "header", inputClass: "input", primaryButton: "primary" },
    "./category-fields": { useCategories: () => ({ categories: [{ name: "Cisco", subcategories: [{ name: "CCNA" }] }, { name: "CompTIA", subcategories: [] }], loading: false, error: "", refresh: async () => { refreshes++; } }) },
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  vm.runInNewContext(outputText, context);
  function nodes() {
    cursor = 0;
    const found = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object" || !node.props) return;
      found.push(node); visit(node.props.children);
    }
    visit(context.exports.AdminCategories());
    return found;
  }
  function find(predicate) { const node = nodes().find(predicate); assert.ok(node, "Expected control exists"); return node; }
  return {
    calls, get refreshes() { return refreshes; }, nodes, find,
    click(label) { return find(node => node.type === "button" && (node.props["aria-label"] === label || node.props.children === label)).props.onClick(); },
    name(value) { find(node => node.type === "input" && node.props.autoFocus).props.onChange({ target: { value } }); },
    submit(label) { return find(node => node.type === "form" && node.props["aria-label"] === label).props.onSubmit({ preventDefault() {} }); },
  };
}

test("category editor saves a rename, refreshes the directory, and closes only after success", async () => {
  const ui = screen();
  ui.click("Edit category Cisco");
  ui.name("Cisco Systems");
  await ui.submit("Edit category");
  assert.equal(ui.calls[0][0], "/categories");
  assert.equal(ui.calls[0][1].method, "PATCH");
  assert.deepEqual(JSON.parse(ui.calls[0][1].body), { category: "Cisco", name: "Cisco Systems" });
  assert.equal(ui.refreshes, 1);
  assert.ok(!ui.nodes().some(node => node.type === "form" && node.props["aria-label"] === "Edit category"));
});

test("failed subcategory edits retain the name, display the exact error, and allow retry", async () => {
  let fail = true;
  const ui = screen(async () => { if (fail) throw new Error("Subcategory already exists."); return { name: "CCNA 200-301" }; });
  ui.click("Subcategories for Cisco");
  ui.click("Edit subcategory CCNA under Cisco");
  ui.name("CCNA 200-301");
  await ui.submit("Edit subcategory");
  assert.equal(ui.find(node => node.props.autoFocus).props.value, "CCNA 200-301");
  assert.equal(ui.find(node => node.props.role === "alert").props.children, "Subcategory already exists.");
  assert.equal(ui.refreshes, 0);
  fail = false;
  await ui.submit("Edit subcategory");
  assert.equal(ui.calls[1][0], "/categories/subcategories");
  assert.deepEqual(JSON.parse(ui.calls[1][1].body), { category: "Cisco", subcategory: "CCNA", name: "CCNA 200-301" });
  assert.equal(ui.refreshes, 1);
});

test("delete requires confirmation; cancel makes no request and in-use failures keep the confirmation", async () => {
  const ui = screen(async () => { throw new Error("Cannot delete: used by 1 exam. Reassign it first."); });
  ui.click("Delete category Cisco");
  assert.equal(ui.calls.length, 0);
  ui.click("Cancel");
  assert.equal(ui.calls.length, 0);
  ui.click("Subcategories for Cisco");
  ui.click("Delete subcategory CCNA under Cisco");
  await ui.submit("Delete subcategory");
  assert.equal(ui.calls[0][1].method, "DELETE");
  assert.equal(ui.calls[0][0], "/categories/subcategories");
  assert.deepEqual(JSON.parse(ui.calls[0][1].body), { category: "Cisco", subcategory: "CCNA" });
  assert.match(ui.find(node => node.props.role === "alert").props.children, /1 exam/);
  assert.ok(ui.find(node => node.type === "button" && node.props.children === "Confirm delete"));
});

test("category directory starts collapsed, expands on click, and only opens one category at a time", () => {
  const ui = screen();
  const toggle = label => ui.find(node => node.props["aria-label"] === `Subcategories for ${label}`);
  assert.equal(toggle("Cisco").props["aria-expanded"], false);
  assert.ok(!ui.nodes().some(node => node.props["aria-label"] === "Edit subcategory CCNA under Cisco"));
  ui.click("Subcategories for Cisco");
  assert.equal(toggle("Cisco").props["aria-expanded"], true);
  assert.ok(ui.find(node => node.props["aria-label"] === "Edit subcategory CCNA under Cisco"));
  assert.equal(ui.find(node => node.props.id === toggle("Cisco").props["aria-controls"]).props.hidden, false);
  ui.click("Subcategories for CompTIA");
  assert.equal(toggle("Cisco").props["aria-expanded"], false);
  assert.equal(toggle("CompTIA").props["aria-expanded"], true);
  assert.ok(ui.find(node => node.type === "p" && typeof node.props.children === "string" && node.props.children.startsWith("No subcategories yet.")));
  ui.click("Subcategories for CompTIA");
  assert.equal(toggle("CompTIA").props["aria-expanded"], false);
  assert.equal(ui.calls.length, 0);
});

test("category actions do not toggle the subcategory list or hide an active edit", () => {
  const ui = screen();
  ui.click("Edit category Cisco");
  let toggle = ui.find(node => node.props["aria-label"] === "Subcategories for Cisco");
  assert.equal(toggle.props["aria-expanded"], false);
  assert.equal(toggle.props.disabled, true);
  ui.click("Cancel");
  ui.click("Subcategories for Cisco");
  ui.click("Edit subcategory CCNA under Cisco");
  toggle = ui.find(node => node.props["aria-label"] === "Subcategories for Cisco");
  assert.equal(toggle.props["aria-expanded"], true);
  assert.equal(toggle.props.disabled, true);
});
