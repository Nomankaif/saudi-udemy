import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import app from "../app.js";
import { unlink } from "node:fs/promises";
import filePath from "node:path";
import { mediaDirectory } from "../config/storage.js";
import Attempt from "../models/attempt.model.js";
import { normalizeQuestion, questionErrors } from "../services/question-validation.js";
import { validatePbqAnswers, gradePbq } from "../services/pbq.service.js";
import { scoreQuestions } from "../services/scoring.service.js";

const fixture = () => normalizeQuestion({
  type: "IMAGE_PBQ", text: "Configure the security controls shown in the diagram.",
  imageUrl: "/uploads/media/test.png", explanation: "Use the controls appropriate to each location.",
  accessLevel: "FREE", topic: "Security",
  pbq: { alt: "A firewall between two workstations.", areas: ["text", "select", "radio", "checkbox", "match", "evidence"].map((kind, i) => ({
    id: kind, kind, label: kind + " area", x: 10 + i * 15, y: 50, points: 2,
    evidence: kind === "evidence" ? "Login denied from external host." : "",
    options: ["text", "evidence"].includes(kind) ? [] : [{ id: "a", text: "Allow" }, { id: "b", text: "Deny" }, { id: "c", text: "Inspect" }]
  })) },
  pbqKey: ["text", "select", "radio", "checkbox", "match"].map(kind => ({
    areaId: kind, values: kind === "text" ? ["TLS", "Transport Layer Security"] : kind === "checkbox" ? ["a", "c"] : ["b"], explanation: "Private feedback."
  }))
});
const answers = () => fixture().pbqKey.map(k => ({ areaId: k.areaId, values: k.areaId === "text" ? [" tls "] : k.values }));

const formFixture = () => normalizeQuestion({
  ...fixture(), pbq: {alt: "A VPN firewall and a server label.", areas: [
    {id: "vpn", kind: "form", label: "VPN firewall", x: 50, y: 30, points: 99, options: [], tabs: [{id: "p1", label: "Phase 1"}, {id: "p2", label: "Phase 2"}], fields: [
      {id: "mode", label: "Mode", kind: "text", tabId: "p1", points: 2, options: []},
      {id: "protocol", label: "Protocol", kind: "select", tabId: "p2", points: 2, options: [{id: "esp", text: "ESP"}, {id: "ah", text: "AH"}]},
      {id: "notes", label: "Rules", kind: "textarea", tabId: "p2", points: 2, options: []},
    ]},
    {id: "role", label: "Server role", kind: "text", marker: "question", x: 70, y: 60, points: 1, options: []},
  ]}, pbqKey: [
    {areaId: "vpn", fieldId: "mode", values: ["Tunnel"], explanation: "Private mode feedback."},
    {areaId: "vpn", fieldId: "protocol", values: ["esp"], explanation: "Private protocol feedback."},
    {areaId: "vpn", fieldId: "notes", values: ["Allow internal\nDeny external"], explanation: "Private rules feedback."},
    {areaId: "role", values: ["Database"], explanation: "Private role feedback."},
  ],
});
const formAnswers = () => formFixture().pbqKey.map(({areaId, fieldId, values}) => ({areaId, ...(fieldId ? {fieldId} : {}), values}));

test("PBQ form fields have separate keys, tab validation, multiline grading and bounded configuration", () => {
  const q = formFixture();
  assert.deepEqual(questionErrors(q), []);
  assert.equal(q.marks, 7); // The container's 99 points must never be counted.
  assert.equal(q.pbq.areas[1].marker, "question");
  assert.equal(gradePbq(q, formAnswers()).earned, 7);
  assert.equal(gradePbq(q, formAnswers().slice(0, 1)).earned, 2);
  assert.equal(gradePbq(q, [{areaId: "vpn", fieldId: "notes", values: [" allow internal\r\ndeny external "]}]).earned, 2);
  assert.equal(gradePbq(q, [{areaId: "vpn", fieldId: "notes", values: ["Allow internal Deny external"]}]).earned, 0);
  assert.equal(gradePbq(q, [{areaId: "vpn", values: ["Tunnel"]}]).earned, 0);
  assert.equal(validatePbqAnswers(q, formAnswers()).length, 4);
  for (const entry of [{areaId: "vpn", values: ["Tunnel"]}, {areaId: "vpn", fieldId: "deleted", values: ["x"]}, {areaId: "role", fieldId: "mode", values: ["Database"]}, {areaId: "vpn", fieldId: "mode", values: ["x", "y"]}, {areaId: "vpn", fieldId: "protocol", values: ["Tunnel"]}]) assert.throws(() => validatePbqAnswers(q, [entry]));
  assert.throws(() => validatePbqAnswers(q, [formAnswers()[0], formAnswers()[0]]));
  for (const bad of [
    {fields: []}, {tabs: [{id: "p1", label: ""}]}, {tabs: [...q.pbq.areas[0].tabs, {id: "empty", label: "Empty"}]},
    ...[{tabId: "missing"}, {label: ""}, {points: 0}, {kind: "form"}, {id: "protocol"}].map(patch => ({fields: [{...q.pbq.areas[0].fields[0], ...patch}, ...q.pbq.areas[0].fields.slice(1)]})),
  ]) assert.ok(questionErrors({...q, pbq: {...q.pbq, areas: [{...q.pbq.areas[0], ...bad}, q.pbq.areas[1]]}}).length);
  assert.ok(questionErrors({...q, pbqKey: q.pbqKey.slice(1)}).some(e => /Mode.*correct answer/.test(e)));
  assert.ok(questionErrors({...q, pbqKey: [...q.pbqKey, {...q.pbqKey[0], fieldId: "deleted"}]}).some(e => /deleted areas or fields/.test(e)));
  assert.throws(() => normalizeQuestion({...q, pbq: {alt: "", areas: [{...q.pbq.areas[0], fields: Array(21).fill(q.pbq.areas[0].fields[0])}]}}));
  assert.throws(() => normalizeQuestion({...q, pbq: {alt: "", areas: Array(40).fill({...q.pbq.areas[0], fields: Array(20).fill(q.pbq.areas[0].fields[0])})}}));
  const injected = structuredClone(q);
  injected.pbq.areas[0].fields[0].correctAnswer = "Do not expose me";
  assert.ok(!JSON.stringify(normalizeQuestion(injected).pbq).includes("Do not expose me"));
});

test("image PBQ validates all interaction types and grades per area", () => {
  const q = { ...fixture(), _id: "q" };
  assert.deepEqual(questionErrors(q), []);
  assert.equal(q.marks, 10);
  assert.equal(q.pbq.areas.at(-1).points, 0);
  assert.equal(q.pbq.areas[0].width, 8);
  assert.equal(q.pbq.areas[0].height, 14);
  const sized = normalizeQuestion({...q,pbq:{...q.pbq,areas:q.pbq.areas.map(a=>({...a,width:12,height:20}))}});
  assert.equal(sized.pbq.areas[0].width,12);
  assert.deepEqual(questionErrors(sized),[]);
  for(const dimensions of [{width:0},{height:101},{width:NaN}]) {
    const bad={...q,pbq:{...q.pbq,areas:[{...q.pbq.areas[0],...dimensions},...q.pbq.areas.slice(1)]}};
    assert.ok(questionErrors(bad).some(error=>error.includes("clickable width and height")));
  }
  assert.equal(gradePbq(q, answers()).earned, 10);
  const partial = answers().slice(0, 2);
  const score = scoreQuestions([q], [{ attemptQuestionId: "q", pbqAnswers: partial }]);
  assert.equal(score.score, 4);
  assert.equal(score.percentage, 40);
  assert.equal(score.incorrectCount, 1);
  assert.equal(scoreQuestions([q], []).unansweredCount, 1);
  q.pbq.areas[0].caseSensitive = true;
  assert.equal(gradePbq(q, answers()).earned, 8);
  assert.equal(gradePbq(q, [{ areaId: "checkbox", values: ["a", "b", "c"] }]).earned, 0);
});

test("image PBQ rejects malformed, foreign and duplicate answers", () => {
  const q = fixture();
  assert.deepEqual(validatePbqAnswers(q, [{ areaId: "text", values: ["   "] }]), []);
  assert.deepEqual(validatePbqAnswers(q, answers())[0].values, ["tls"]);
  for (const input of [null, {}, [null], [{ areaId: "unknown", values: [] }], [{ areaId: "evidence", values: ["x"] }],
    [answers()[0], answers()[0]], [{ areaId: "text", values: ["x", "y"] }], [{ areaId: "text", values: [1] }],
    [{ areaId: "select", values: ["unknown"] }], [{ areaId: "checkbox", values: ["a", "a"] }]]) {
    assert.throws(() => validatePbqAnswers(q, input));
  }
  for (const change of [
    { imageUrl: "" }, { pbqKey: [] }, { pbqKey: [...q.pbqKey, q.pbqKey[0]] },
    { pbq: { ...q.pbq, alt: "" } },
    ...[{ x: 101 }, { y: -1 }, { points: 0 }, { kind: "shell" }, { label: "" }].map(bad => ({ pbq: { ...q.pbq, areas: [{ ...q.pbq.areas[0], ...bad }, ...q.pbq.areas.slice(1)] } }))
  ]) assert.ok(questionErrors({ ...q, ...change }).length);
  assert.throws(() => normalizeQuestion({ ...q, pbq: { areas: Array(41).fill(q.pbq.areas[0]) } }));
  assert.throws(() => normalizeQuestion({ ...q, pbqKey: [{ areaId: "text", values: ["x".repeat(501)] }] }));
});

test("image PBQ API: publish errors, private keys, partial credit, resume and immutable snapshots", { timeout: 60000 }, async () => {
  const dbName = "pbq_test_" + randomUUID().replaceAll("-", "");
  process.env.ADMIN_PASSWORD = "pbq-test-admin-password";
  await mongoose.connect("mongodb://127.0.0.1:27017/" + dbName, { serverSelectionTimeoutMS: 5000 });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port + "/api";
  async function call(path, method = "GET", body, cookie = "", expected = 200) {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json();
    assert.equal(r.status, expected, method + " " + path + ": " + JSON.stringify(data).slice(0, 600));
    return { data, cookie: r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ") };
  }
  const uploadedFiles = [];
  try {
    const admin = (await call("/auth/admin/login", "POST", { password: process.env.ADMIN_PASSWORD })).cookie;
    const credentials = { firstName: "PBQ", lastName: "Tester", email: "pbq@test.invalid", password: "Pbq-test-password" };
    await call("/auth/register", "POST", credentials, "", 201);
    const student = (await call("/auth/login", "POST", credentials)).cookie;
    async function upload(cookie, buffer, expected) {
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: "image/png" }), "diagram.png");
      const response = await fetch(base + "/media/pbq", { method: "POST", headers: { Cookie: cookie }, body: form });
      assert.equal(response.status, expected);
      return response.json();
    }
    await upload("", Buffer.from("not an image"), 401);
    await upload(student, Buffer.from("not an image"), 403);
    await upload(admin, Buffer.from("not an image"), 400);
    await upload(admin, Buffer.alloc(5 * 1024 * 1024 + 1), 400);
    const uploaded = await upload(admin, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nYQAAAAASUVORK5CYII=", "base64"), 201);
    assert.match(uploaded.url, /^\/uploads\/media\/cover-[a-f0-9-]+\.png$/);
    uploadedFiles.push(filePath.join(mediaDirectory, filePath.basename(uploaded.url)));
    const image = await fetch(base.replace(/\/api$/, "") + uploaded.url);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-type"), /image\/png/);
    const exam = (await call("/exams", "POST", { title: "PBQ test", category: "Security", shortDescription: "Test fixture" }, admin, 201)).data;
    const q = fixture(), root = "/exams/" + exam._id;
    const draft = (await call(root + "/questions", "POST", { ...q, pbqKey: [] }, admin, 201)).data;
    const rejection = (await call(root + "/publish", "POST", {}, admin, 400)).data;
    assert.match(rejection.message, /PBQ area 1.*correct answer/);
    await call(root + "/questions/" + draft._id, "PATCH", q, admin);
    const saved = (await call(root + "/admin/questions", "GET", undefined, admin)).data.questions[0];
    assert.equal(saved.pbqKey.length, 5);
    await call(root + "/publish", "POST", {}, admin);
    const attempt = (await call("/attempts", "POST", { examId: exam._id, mode: "PRACTICE" }, student, 201)).data;
    const path = "/attempts/" + attempt._id;
    const batch = (await call(path + "/questions", "GET", undefined, student)).data;
    assert.equal(batch.questions[0].pbq.areas.length, 6);
    assert.equal(batch.questions[0].pbq.areas[0].width,8);
    assert.equal(batch.questions[0].pbq.areas[0].height,14);
    assert.ok(!JSON.stringify(batch).includes("pbqKey"));
    assert.ok(!JSON.stringify(batch).includes("Private feedback"));
    const questionId = batch.questions[0]._id, answerPath = path + "/answers/" + questionId;
    await call(answerPath, "PUT", { pbqAnswers: answers() }, admin, 404);
    await call(answerPath, "PUT", { pbqAnswers: [{ areaId: "bad", values: ["x"] }] }, student, 400);
    await call(answerPath, "PUT", { pbqAnswers: answers().slice(0, 2), markedForReview: true }, student);
    let resumed = (await call(path + "/questions", "GET", undefined, student)).data;
    assert.equal(resumed.progress[0].answered, true);
    assert.equal(resumed.answers[0].pbqAnswers.length, 2);
    await call(answerPath, "PUT", { pbqAnswers: [] }, student);
    resumed = (await call(path + "/questions", "GET", undefined, student)).data;
    assert.equal(resumed.progress[0].answered, false);
    await call(answerPath, "PUT", { pbqAnswers: answers().slice(0, 2) }, student);
    await call(root + "/questions/" + draft._id, "PATCH", { ...q, pbqKey: q.pbqKey.map(k => k.areaId === "select" ? { ...k, values: ["a"] } : k) }, admin);
    await call(root + "/publish", "POST", {}, admin);
    const reveal = (await call(path + "/explanation/" + questionId, "GET", undefined, student)).data;
    assert.deepEqual(reveal.pbqKey.find(k => k.areaId === "select").values, ["b"]);
    assert.equal((await call(path + "/submit", "POST", {}, student)).data.percentage, 40);
    const result = (await call(path + "/result", "GET", undefined, student)).data;
    assert.equal(result.questions[0].pbqGrade.earned, 4);
    await call(answerPath, "PUT", { pbqAnswers: [] }, student, 409);
    const timed = (await call("/attempts", "POST", { examId: exam._id, mode: "TIMED", durationMinutes: 1 }, student, 201)).data;
    const timedPath = "/attempts/" + timed._id;
    const tq = (await call(timedPath + "/questions", "GET", undefined, student)).data.questions[0];
    await call(timedPath + "/explanation/" + tq._id, "GET", undefined, student, 403);
    await Attempt.updateOne({ _id: timed._id }, { expiresAt: new Date(Date.now() - 1000) });
    await call(timedPath + "/answers/" + tq._id, "PUT", { pbqAnswers: answers() }, student, 409);

    const formExam = (await call("/exams", "POST", {title: "Tabbed PBQ test", category: "Security", shortDescription: "Test fixture"}, admin, 201)).data;
    const formRoot = "/exams/" + formExam._id, formQ = formFixture();
    const formDraft = (await call(formRoot + "/questions", "POST", formQ, admin, 201)).data;
    const formSaved = (await call(formRoot + "/admin/questions", "GET", undefined, admin)).data.questions[0];
    assert.equal(formSaved.pbqKey[0].fieldId, "mode");
    await call(formRoot + "/publish", "POST", {}, admin);
    const fa = (await call("/attempts", "POST", {examId: formExam._id, mode: "PRACTICE"}, student, 201)).data;
    const fp = "/attempts/" + fa._id;
    const fq = (await call(fp + "/questions", "GET", undefined, student)).data.questions[0];
    assert.equal(fq.pbq.areas[0].fields[0].tabId, "p1");
    assert.ok(!JSON.stringify(fq).includes("pbqKey"));
    assert.ok(!JSON.stringify(fq).includes("Private mode feedback"));
    const correct = formAnswers();
    await call(fp + "/answers/" + fq._id, "PUT", {pbqAnswers: [{areaId: "vpn", fieldId: "wrong", values: ["x"]}]}, student, 400);
    await call(fp + "/answers/" + fq._id, "PUT", {pbqAnswers: correct.filter(a => a.fieldId !== "notes")}, student);
    const restored = (await call(fp + "/questions", "GET", undefined, student)).data.answers[0].pbqAnswers;
    assert.equal(restored.find(a => a.fieldId === "protocol").values[0], "esp");
    await call(formRoot + "/questions/" + formDraft._id, "PATCH", {...formQ, pbqKey: formQ.pbqKey.map(k => k.fieldId === "mode" ? {...k, values: ["Transport"]} : k)}, admin);
    await call(formRoot + "/publish", "POST", {}, admin);
    assert.equal((await call(fp + "/explanation/" + fq._id, "GET", undefined, student)).data.pbqKey.find(k => k.fieldId === "mode").values[0], "Tunnel");
    await call(fp + "/submit", "POST", {}, student);
    const fr = (await call(fp + "/result", "GET", undefined, student)).data;
    assert.equal(fr.questions[0].pbqGrade.earned, 5);
    assert.equal(fr.questions[0].pbqGrade.maximum, 7);
    assert.equal(fr.questions[0].pbqGrade.items.find(i => i.fieldId === "notes").earned, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const file of uploadedFiles) {
      assert.equal(filePath.dirname(file), mediaDirectory);
      await unlink(file);
    }
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
