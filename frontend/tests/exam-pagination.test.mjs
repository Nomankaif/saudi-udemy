import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/exam-pagination.ts", import.meta.url), "utf8");
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { paginateExams } = context.exports;

test("exam pages contain nine distinct results and keep the full result count", () => {
  const exams = Array.from({ length: 23 }, (_, index) => index + 1);
  const first = paginateExams(exams, undefined);
  const second = paginateExams(exams, "2");
  const third = paginateExams(exams, "3");
  assert.equal(first.items.length, 9);
  assert.equal(second.items.length, 9);
  assert.equal(third.items.length, 5);
  assert.equal(first.totalPages, 3);
  assert.deepEqual([...first.items, ...second.items, ...third.items], exams);
  assert.deepEqual([second.from, second.to], [10, 18]);
});

test("invalid and out-of-range page numbers land on an available page", () => {
  const exams = Array.from({ length: 10 }, (_, index) => index);
  for (const invalid of ["0", "-1", "abc", "2extra", "999999999999999999999999"]) {
    assert.equal(paginateExams(exams, invalid).page, 1);
  }
  assert.equal(paginateExams(exams, "99").page, 2);
  assert.deepEqual(paginateExams([], "2").items, []);
});
