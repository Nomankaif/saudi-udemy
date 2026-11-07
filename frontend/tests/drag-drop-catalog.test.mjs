import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function load(fetch) {
  const source = readFileSync(new URL("../lib/exams.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, require: () => ({}), fetch, process: { env: {} } };
  vm.runInNewContext(code, context);
  return context.exports;
}

test("published Drag and Drop exams use the same exam catalog and detail API", async () => {
  const calls = [];
  const bank = {
    _id: "bank-1", slug: "drag-drop-bank-1", sourceKind: "DRAG_DROP_BANK",
    title: "CCNA Drag and Drop", category: "CCNA", subcategory: "ccna",
    questionCount: 56, freeQuestionCount: 56, durationMinutes: 60,
  };
  const fetch = async url => { calls.push(url); return { ok: true, json: async () => url.endsWith("/exams") ? [bank] : bank }; };
  const { publicExams, publicExam } = load(fetch);
  const [exam] = await publicExams();
  const detail = await publicExam(exam.slug);
  assert.equal(exam.kind, "DRAG_DROP");
  assert.equal(exam.slug, "drag-drop-bank-1");
  assert.equal(detail.id, exam.id);
  assert.equal(detail.questionCount, 56);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => !url.includes("practice-items")));
});
