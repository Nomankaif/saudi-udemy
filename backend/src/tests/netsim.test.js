import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import app from "../app.js";
import LabAttempt from "../models/lab-attempt.model.js";
import { validateLab, publicLab } from "../services/lab.service.js";
import { simulate, netStates, netCommand } from "../services/netsim.service.js";
import { NETSIM_TEMPLATES } from "../simulation/templates.js";

const solvedJournal = lab => lab.tasks.flatMap(t => t.hint.split("\n").filter(Boolean).map(command => ({ device: t.device, command })));
test("NetSim templates: solutions, failed routes, VLAN isolation, scoped grading and saved configuration", { timeout: 60000 }, async () => {
  for (const template of NETSIM_TEMPLATES) {
    const lab = validateLab(template);
    const report = await simulate(lab, {}, "validate");
    assert.deepEqual(report.errors, []);
    assert.equal(report.score, 100, template.title);
    const safe = publicLab(lab);
    assert.equal(safe.tasks[0].rules, undefined);
    assert.equal(safe.tasks[0].hint, undefined);
    assert.equal(safe.devices[0].initialConfig, undefined);
    assert.match(safe.diagram, /<svg/);
  }
  const vlan = validateLab(NETSIM_TEMPLATES[0]);
  const journal = solvedJournal(vlan);
  const wrongPort = journal.map(e => e.command === "interface FastEthernet0/1" && e.device === "SW1" ? { ...e, command: "interface FastEthernet0/2" } : e);
  const wrong = await simulate(vlan, { journal: wrongPort }, "grade");
  assert.equal(wrong.tasks[0].passed, false, "Correct VLAN on wrong interface must fail");
  const blocked = [...journal, ...["configure terminal", "interface FastEthernet0/1", "switchport access vlan 20", "end"].map(command => ({ device: "SW1", command }))];
  const failed = await simulate(vlan, { journal: blocked }, "grade");
  assert.equal(failed.tasks.at(-1).passed, false, "Different VLANs must not communicate");
  assert.equal(failed.tasks[2].passed, false, "Changes after write memory must invalidate saved check");
  const route = validateLab(NETSIM_TEMPLATES[1]);
  assert.equal((await simulate(route, {}, "grade")).tasks.at(-1).passed, false);
  const oneWay = { journal: solvedJournal(route).filter(e => e.device !== "R2") };
  assert.equal((await simulate(route, oneWay, "grade")).tasks.at(-1).passed, false, "Return route required");
  const first = { snapshot: route, states: await netStates(route) };
  const second = { snapshot: route, states: await netStates(route) };
  await netCommand(first, "R1", "enable");
  assert.equal(first.states.prompts.R1, "R1#");
  assert.equal(second.states.prompts.R1, "R1>");
  const resumed = await simulate(route, JSON.parse(JSON.stringify(first.states)));
  assert.equal(resumed.prompts.R1, "R1#");
  await assert.rejects(netCommand(first, "PC2", "ip 1.2.3.4/24 1.2.3.1"), /editable device/);
  await assert.rejects(netCommand(first, "R1", "enable\nconf t"), /one command/);
  assert.ok((await simulate(route, {}, "complete", { device: "R1", input: "en" })).matches.some(m => m.word === "enable"));
  const ospf = validateLab(NETSIM_TEMPLATES[2]);
  const ospfJournal = solvedJournal(ospf);
  const mismatch = ospfJournal.map(e => e.device === "R2" ? { ...e, command: e.command.replace("area 0", "area 1") } : e);
  assert.equal((await simulate(ospf, { journal: mismatch }, "grade")).tasks[0].passed, false, "Mismatched OSPF areas must fail");
  const disconnected = { ...ospf, links: [
    { fromDevice: "R1", fromInterface: "GigabitEthernet0/0", toDevice: "PC1", toInterface: "eth0" },
    { fromDevice: "R2", fromInterface: "GigabitEthernet0/0", toDevice: "PC2", toInterface: "eth0" },
  ] };
  assert.equal((await simulate(disconnected, { journal: ospfJournal }, "grade")).tasks[0].passed, false, "Matching subnets without a physical path must not form OSPF neighbours");
});

test("NetSim rejects malformed links, addresses and grading rules", () => {
  const lab = structuredClone(NETSIM_TEMPLATES[0]);
  assert.throws(() => validateLab({ ...lab, links: [...lab.links, lab.links[0]] }), /already connected/);
  assert.throws(() => validateLab({ ...lab, links: [{ ...lab.links[0], toInterface: "missing" }] }), /missing/);
  assert.throws(() => validateLab({ ...lab, tasks: [{ ...lab.tasks[0], rules: [{ type: "unknown" }] }] }), /Unknown/);
  assert.throws(() => validateLab({ ...lab, tasks: [{ ...lab.tasks[0], rules: [{ type: "ping", value: "1.1.1.1" }] }] }), /require a PC/);
  lab.devices[0].interfaces["FastEthernet0/1"].ip = "999.1.2.3/24";
  assert.throws(() => validateLab(lab), /IPv4/);
});

test("NetSim API: publish, server timer, hidden answers, locked PCs, resume, expiry and ownership", { timeout: 60000 }, async () => {
  const dbName = `netsim_test_${randomUUID().replaceAll("-", "")}`;
  process.env.ADMIN_PASSWORD = "netsim-test-admin-password";
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 5000 });
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, method = "GET", body, cookie = "", status = 200) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, status, `${path}: ${JSON.stringify(data).slice(0, 300)}`);
    return { data, cookie: response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ") };
  }
  try {
    const admin = (await call("/auth/admin/login", "POST", { password: process.env.ADMIN_PASSWORD })).cookie;
    assert.equal((await call("/labs/admin/import-simulations", "POST", {}, admin)).data.imported, 3);
    assert.equal((await call("/labs/admin/import-simulations", "POST", {}, admin)).data.imported, 0);
    const student = { firstName: "Net", lastName: "Test", email: "netsim@test.invalid", password: "netsim-student-password" };
    await call("/auth/register", "POST", student, "", 201);
    const cookie = (await call("/auth/login", "POST", student)).cookie;
    const lab = (await call("/labs/admin", "POST", NETSIM_TEMPLATES[1], admin)).data;
    assert.equal((await call(`/labs/admin/${lab._id}/validate`, "POST", {}, admin)).data.valid, true);
    await call(`/labs/admin/${lab._id}/validate`, "POST", {}, cookie, 403);
    await call(`/labs/admin/${lab._id}/publish`, "POST", {}, admin);
    let attempt = (await call(`/labs/${lab._id}/start`, "POST", { mode: "EXAM", durationMinutes: 1440 }, cookie, 201)).data;
    const root = `/labs/attempts/${attempt._id}`;
    assert.ok(new Date(attempt.deadline).getTime() - Date.now() < 31 * 60000, "Student cannot extend author timer");
    assert.equal(attempt.lab.tasks[0].rules, undefined);
    assert.equal(attempt.states, undefined);
    await call(root, "GET", undefined, admin, 404);
    await call(`${root}/check`, "POST", {}, cookie, 403);
    await call(`${root}/solution`, "POST", {}, cookie, 403);
    await call(`${root}/reset`, "POST", {}, cookie, 403);
    await call(`${root}/command`, "POST", { device: "PC2", command: "enable" }, cookie, 400);
    attempt = (await call(`${root}/command`, "POST", { device: "R1", command: "enable" }, cookie)).data;
    assert.equal(attempt.prompts.R1, "R1#");
    assert.equal((await call(root, "GET", undefined, cookie)).data.prompts.R1, "R1#");
    await LabAttempt.updateOne({ _id: attempt._id }, { $set: { deadline: new Date(Date.now() - 1000) } });
    assert.equal((await call(root, "GET", undefined, cookie)).data.status, "SUBMITTED");
    await call(`${root}/command`, "POST", { device: "R1", command: "conf t" }, cookie, 409);
    assert.equal((await call(`${root}/submit`, "POST", {}, cookie)).data.status, "SUBMITTED");
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, dbName);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
