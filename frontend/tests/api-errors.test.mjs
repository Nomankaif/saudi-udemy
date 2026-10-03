import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise the actual browser API helper without a server or generated files.
function loadApi(response) {
  const source = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const context = { exports: {}, FormData, fetch: async () => response };
  vm.runInNewContext(outputText, context);
  return context.exports;
}

test("publish errors retain all question details and the HTTP status", async () => {
  const details = [{ question: 7, questionId: "q7", questionText: "Group the devices", message: "Group Network has 2 slots but 0 items assigned." }];
  const client = loadApi({ ok: false, status: 400, json: async () => ({ message: "Question 7 needs attention", details }) });
  await assert.rejects(client.api("/exams/e1/publish", { method: "POST" }), error => {
    assert.equal(error.status, 400);
    assert.equal(error.message, "Question 7 needs attention");
    assert.equal(error.details, details);
    assert.equal(client.questionIssuesOf(error)[0], details[0]);
    return true;
  });
});

test("missing or malformed details fall back to the original error message", () => {
  const client = loadApi();
  for (const details of [undefined, "not an array", [null, {}, { question: 1, message: {} }]]) {
    const error = new client.ApiError("Access denied", 403, details);
    assert.equal(client.questionIssuesOf(error).length, 0);
    assert.equal(client.messageOf(error), "Access denied");
  }
});

test("successful requests still return their payload", async () => {
  const payload = { published: true };
  const client = loadApi({ ok: true, status: 200, json: async () => payload });
  assert.equal(await client.api("/exams/e1/publish", { method: "POST" }), payload);
});
