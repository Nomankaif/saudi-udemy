import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import app from "../app.js";
import { NETSIM_TEMPLATES } from "../simulation/templates.js";

test("lab collection keeps 27-style exercises isolated in one attempt", { timeout: 60000 }, async () => {
  const dbName = `lab_series_test_${randomUUID().replaceAll("-", "")}`;
  process.env.ADMIN_PASSWORD = "lab-series-test-admin-password";
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 5000 });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, method = "GET", body, cookie = "", status = 200) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, status, `${path}: ${JSON.stringify(data).slice(0, 400)}`);
    return { data, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
  }
  try {
    const admin = (await call("/auth/admin/login", "POST", { password: process.env.ADMIN_PASSWORD })).cookie;
    const student = { firstName: "Series", lastName: "Student", email: "series@test.invalid", password: "lab-series-student-password" };
    await call("/auth/register", "POST", student, "", 201);
    const cookie = (await call("/auth/login", "POST", student)).cookie;
    const first = (await call("/labs/admin", "POST", NETSIM_TEMPLATES[0], admin)).data;
    const second = (await call("/labs/admin", "POST", NETSIM_TEMPLATES[1], admin)).data;
    const draft = (await call("/labs/admin/collections", "POST", { title: "Cisco practice collection", category: "Cisco", subcategory: "", labIds: [first._id, second._id], durationMinutes: 120, access: "FREE" }, admin)).data;
    assert.equal(draft.draft.labIds.length, 2);
    const preview = (await call(`/labs/admin/collections/${draft._id}/preview`, "POST", {}, admin, 201)).data;
    assert.equal(preview.series.total, 2);
    await call(`/labs/admin/${draft._id}/publish`, "POST", {}, admin, 400);
    await call(`/labs/admin/${first._id}/publish`, "POST", {}, admin);
    await call(`/labs/admin/${second._id}/publish`, "POST", {}, admin);
    await call(`/labs/admin/${draft._id}/publish`, "POST", {}, admin);
    const catalog = (await call("/labs")).data;
    assert.equal(catalog.find(row => row._id === draft._id).taskCount, 2);
    assert.equal(catalog.some(row => row._id === first._id || row._id === second._id), false, "Member labs appear as one collection in the student catalog");
    let attempt = (await call(`/labs/${draft._id}/start`, "POST", { mode: "PRACTICE" }, cookie, 201)).data;
    const root = `/labs/attempts/${attempt._id}`;
    assert.equal(attempt.series.index, 0);
    assert.equal(attempt.lab.title, NETSIM_TEMPLATES[0].title);
    assert.equal(attempt.lab.tasks[0].hint, undefined);
    attempt = (await call(`${root}/command`, "POST", { device: "SW1", command: "enable" }, cookie)).data;
    assert.equal(attempt.prompts.SW1, "SW1#");
    attempt = (await call(`${root}/select`, "POST", { index: 1 }, cookie)).data;
    assert.equal(attempt.lab.title, NETSIM_TEMPLATES[1].title);
    assert.equal(attempt.transcript.length, 0);
    attempt = (await call(`${root}/select`, "POST", { index: 0 }, cookie)).data;
    assert.equal(attempt.prompts.SW1, "SW1#");
    assert.equal(attempt.transcript.length, 1);
    await call(`${root}/select`, "POST", { index: 2 }, cookie, 400);
    attempt = (await call(`${root}/submit`, "POST", {}, cookie)).data;
    assert.equal(attempt.status, "SUBMITTED");
    assert.equal(attempt.seriesResult.total, NETSIM_TEMPLATES[0].tasks.length + NETSIM_TEMPLATES[1].tasks.length);
    assert.equal((await call("/labs/attempts", "GET", undefined, cookie)).data.filter(row => row._id === attempt._id).length, 1);
    attempt = (await call(`${root}/select`, "POST", { index: 1 }, cookie)).data;
    assert.equal(attempt.result.tasks.length, NETSIM_TEMPLATES[1].tasks.length);
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
