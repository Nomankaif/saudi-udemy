import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import Attempt from "../models/attempt.model.js";
import { normalizeQuestion, questionErrors } from "../services/question-validation.js";
import { validatePlacements } from "../services/drag-drop.service.js";
import { scoreQuestions } from "../services/scoring.service.js";

const fixture = () => normalizeQuestion({
  type: "DRAG_DROP", text: "Group the network components. One item is unused.",
  options: [{ id: "router", text: "Router" }, { id: "switch", text: "Switch" }, { id: "pc", text: "PC" }, { id: "paper", text: "Notebook" }],
  dropTargets: [{ id: "network", label: "Network devices", capacity: 2 }, { id: "endpoint", label: "Endpoints", capacity: 1 }],
  correctPlacements: [{ itemId: "router", targetId: "network" }, { itemId: "switch", targetId: "network" }, { itemId: "pc", targetId: "endpoint" }],
  explanation: "Routers and switches forward network traffic. A PC is an endpoint.", accessLevel: "FREE", topic: "Network fundamentals",
});

test("drag-and-drop definitions, distractors, capacities and exact unordered grading", () => {
  const q = { ...fixture(), _id: "q1" };
  assert.deepEqual(questionErrors(q), []);
  assert.deepEqual(validatePlacements(q, []), []);
  assert.deepEqual(validatePlacements(q, q.correctPlacements.slice(0, 1)), q.correctPlacements.slice(0, 1));
  for (const placements of [null, {}, [null], [{ itemId: "absent", targetId: "network" }], [{ itemId: "router", targetId: "absent" }], [q.correctPlacements[0], q.correctPlacements[0]], [{ itemId: "router", targetId: "endpoint" }, { itemId: "pc", targetId: "endpoint" }]])
    assert.throws(() => validatePlacements(q, placements));
  for (const bad of [
    { options: [q.options[0], q.options[0]] }, { options: [] }, { dropTargets: [] },
    { dropTargets: [{ ...q.dropTargets[0], capacity: 0 }] },
    { correctPlacements: [] }, { correctPlacements: [...q.correctPlacements, q.correctPlacements[0]] },
    { correctPlacements: [{ itemId: "absent", targetId: "network" }] },
    { correctPlacements: q.correctPlacements.slice(0, 2) },
  ]) assert.ok(questionErrors({ ...q, ...bad }).length);
  const score = placements => scoreQuestions([q], [{ attemptQuestionId: "q1", placements, selectedOptionIds: [] }]);
  assert.equal(score([...q.correctPlacements].reverse()).percentage, 100);
  assert.equal(score(q.correctPlacements.slice(0, 2)).incorrectCount, 1);
  assert.equal(score([]).unansweredCount, 1);
  assert.equal(score([...q.correctPlacements.slice(0, 2), { itemId: "paper", targetId: "endpoint" }]).percentage, 0);
  assert.equal(scoreQuestions([q, { _id: "old", correctOptionIds: ["A"], marks: 1 }], [{ attemptQuestionId: "q1", placements: q.correctPlacements }, { attemptQuestionId: "old", selectedOptionIds: ["A"] }]).percentage, 100);
});

test("drag-and-drop validation identifies the exact item, group and correction", () => {
  const q = fixture();
  assert.deepEqual(questionErrors({ ...q, correctPlacements: q.correctPlacements.slice(1) }), [
    "Group “Network devices” has 2 slots but 1 item assigned. Assign 1 more item using Correct destination or change Slots to 1.",
  ]);
  assert.deepEqual(questionErrors({ ...q, dropTargets: [{ ...q.dropTargets[0], capacity: 1 }, q.dropTargets[1]] }), [
    "Group “Network devices” has 1 slot but 2 items assigned. Remove 1 item assignment or change Slots to 2.",
  ]);
  assert.ok(questionErrors({ ...q, options: q.options.map((i, index) => index === 1 ? { ...i, text: "" } : i) }).includes("Item 2: enter the item text."));
  assert.ok(questionErrors({ ...q, dropTargets: [{ ...q.dropTargets[0], label: "", capacity: 0 }, q.dropTargets[1]] }).includes("Group 1: set Slots to a whole number between 1 and 20."));
  assert.ok(questionErrors({ ...q, correctPlacements: [] }).every(message => message.includes("assigned") && message.includes("Correct destination")));
});

test("drag-and-drop API: draft/edit/publish, hidden key, resume, review, snapshot, expiry and ownership", { timeout: 60000 }, async () => {
  const dbName = `drag_drop_test_${randomUUID().replaceAll("-", "")}`;
  process.env.ADMIN_PASSWORD = "drag-drop-test-admin-password";
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 5000 });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, method = "GET", body, cookie = "", expected = 200) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data).slice(0, 400)}`);
    return { data, cookie: response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") };
  }
  try {
    const admin = (await call("/auth/admin/login", "POST", { password: process.env.ADMIN_PASSWORD })).cookie;
    const credentials = { firstName: "Drag", lastName: "Tester", email: "drag@test.invalid", password: "Drag-test-password" };
    await call("/auth/register", "POST", credentials, "", 201);
    const student = (await call("/auth/login", "POST", credentials)).cookie;
    const exam = (await call("/exams", "POST", { title: "Drag-drop test", category: "Cisco", shortDescription: "Test fixture" }, admin, 201)).data;
    const q = { ...fixture(), displayOrder: 7 };
    const draft = (await call(`/exams/${exam._id}/questions`, "POST", { ...q, correctPlacements: [] }, admin, 201)).data;
    const rejection = (await call(`/exams/${exam._id}/publish`, "POST", {}, admin, 400)).data;
    assert.match(rejection.message, /Question 7: Group “Network devices”/);
    assert.equal(rejection.details.length, 2);
    assert.ok(rejection.details.every(issue => issue.question === 7 && issue.questionId === draft._id && issue.questionText === q.text));
    assert.match(rejection.details[0].message, /2 slots but 0 items assigned/);
    assert.match(rejection.details[1].message, /Group “Endpoints”/);
    const updated = (await call(`/exams/${exam._id}/questions/${draft._id}`, "PATCH", q, admin)).data;
    assert.deepEqual(updated.correctPlacements, q.correctPlacements);
    assert.equal(updated.type, "DRAG_DROP");
    const adminList = (await call(`/exams/${exam._id}/admin/questions`, "GET", undefined, admin)).data;
    assert.deepEqual(adminList.questions[0].correctPlacements, q.correctPlacements);
    await call(`/exams/${exam._id}/publish`, "POST", {}, admin);
    const attempt = (await call("/attempts", "POST", { examId: exam._id, mode: "PRACTICE" }, student, 201)).data;
    const path = `/attempts/${attempt._id}`;
    const batch = (await call(`${path}/questions`, "GET", undefined, student)).data;
    const question = batch.questions[0], answerPath = `${path}/answers/${question._id}`;
    assert.equal(question.type, "DRAG_DROP");
    assert.equal(question.dropTargets.length, 2);
    assert.ok(!JSON.stringify(batch).includes("correctPlacements"));
    assert.ok(!JSON.stringify(batch).includes("correctOptionIds"));
    assert.ok(!JSON.stringify(batch).includes(q.explanation));
    await call(answerPath, "PUT", { placements: q.correctPlacements }, admin, 404);
    for (const placements of [[q.correctPlacements[0], q.correctPlacements[0]], [{ itemId: "router", targetId: "foreign" }], [{ itemId: "router", targetId: "endpoint" }, { itemId: "pc", targetId: "endpoint" }]])
      await call(answerPath, "PUT", { placements }, student, 400);
    await call(answerPath, "PUT", { selectedOptionIds: ["router"], placements: [] }, student, 400);
    await call(answerPath, "PUT", { placements: q.correctPlacements.slice(0, 1), markedForReview: true }, student);
    const resumed = (await call(`${path}/questions`, "GET", undefined, student)).data;
    assert.equal(resumed.progress[0].answered, true);
    assert.equal(resumed.progress[0].marked, true);
    assert.deepEqual(resumed.answers[0].placements, q.correctPlacements.slice(0, 1));
    await call(answerPath, "PUT", { placements: [] }, student);
    assert.equal((await call(`${path}/questions`, "GET", undefined, student)).data.progress[0].answered, false);
    await call(answerPath, "PUT", { placements: [...q.correctPlacements].reverse() }, student);
    // Later edits must not change this attempt's labels or answer key.
    await call(`/exams/${exam._id}/questions/${draft._id}`, "PATCH", { ...q, dropTargets: q.dropTargets.map(t => ({ ...t, label: `Changed ${t.label}` })), correctPlacements: [...q.correctPlacements.slice(0, 2), { itemId: "paper", targetId: "endpoint" }] }, admin);
    await call(`/exams/${exam._id}/publish`, "POST", {}, admin);
    const reveal = (await call(`${path}/explanation/${question._id}`, "GET", undefined, student)).data;
    assert.deepEqual(reveal.correctPlacements, q.correctPlacements);
    assert.equal((await call(`${path}/submit`, "POST", {}, student)).data.percentage, 100);
    const result = (await call(`${path}/result`, "GET", undefined, student)).data;
    assert.deepEqual(result.questions[0].correctPlacements, q.correctPlacements);
    assert.equal(result.questions[0].dropTargets[0].label, "Network devices");
    await call(answerPath, "PUT", { placements: [] }, student, 409);
    const timed = (await call("/attempts", "POST", { examId: exam._id, mode: "TIMED", durationMinutes: 1 }, student, 201)).data;
    const timedQuestion = (await call(`/attempts/${timed._id}/questions`, "GET", undefined, student)).data.questions[0];
    await call(`/attempts/${timed._id}/explanation/${timedQuestion._id}`, "GET", undefined, student, 403);
    await call(`/attempts/${timed._id}/answers/${timedQuestion._id}`, "PUT", { placements: q.correctPlacements.slice(0, 1) }, student);
    await Attempt.updateOne({ _id: timed._id }, { expiresAt: new Date(Date.now() - 1000) });
    await call(`/attempts/${timed._id}/answers/${timedQuestion._id}`, "PUT", { placements: [] }, student, 409);
    const expired = (await call(`/attempts/${timed._id}/result`, "GET", undefined, student)).data;
    assert.equal(expired.result.incorrectCount, 1);
    assert.equal(expired.result.unansweredCount, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
