import test from "node:test";
import assert from "node:assert/strict";
import { knownCcnaLabCandidates, extractedLabCandidates, parseLabJson, parseLabJsonDocument, verifyLabCandidate, labExclusionReasons } from "../services/lab-import.service.js";
import { downloadLabTemplate } from "../controllers/lab-import.controller.js";
import { applyImportDetails, removeLegacySharedInstructions, validateImportDetails } from "../services/lab-import-details.js";
import { labSourceReviewNotes } from "../services/lab-import-capabilities.js";

test("the supplied CCNA PDF maps to 27 valid reviewable lab drafts with source pages", () => {
  const rows = knownCcnaLabCandidates("Cisco", "CCNA");
  assert.equal(rows.length, 27);
  assert.deepEqual(rows.map(row => row.sourceNumber), Array.from({ length: 27 }, (_, index) => index + 1));
  assert.ok(rows.every(row => !row.reviewed && row.sourcePages.length));
  assert.ok(rows.every(row => row.sourcePages.every(page => page >= 1 && page <= 64)));
  assert.ok(rows.every(row => row.definition.devices.length && row.definition.tasks.length));
});

test("downloaded lab JSON template is structurally ready for import", () => {
  const response = { attachment(name) { this.name = name; return this; }, json(value) { this.body = value; return this; } };
  downloadLabTemplate({}, response);
  assert.equal(response.name, "lab-import-template.json");
  assert.match(response.body._guide.interfaceFormat.notes.join(" "), /eth0/);
  assert.match(response.body._guide.workflow.join(" "), /compares the configuration changes/i);
  assert.match(response.body._guide.labFields.tasks, /enable before configure terminal/);
  assert.match(response.body._guide.taskSolution.example, /^enable\nconfigure terminal[\s\S]*\nend$/);
  assert.ok(response.body._guide.grading.supportedRuleTypes.includes("ospf_neighbor"));
  const [row] = parseLabJson(Buffer.from(JSON.stringify(response.body)), "Cisco", "CCNA");
  assert.deepEqual(row.errors, []);
  assert.equal(response.body.version, 2);
  assert.equal(row.reviewed, false);
  assert.deepEqual(row.errors, []);
  assert.equal(row.definition.access, "FREE");
});

test("unknown simulator behavior blocks import while source uncertainty stays for draft review", () => {
  const response = { attachment() { return this; }, json(value) { this.body = value; return this; } };
  downloadLabTemplate({}, response);
  const lab = structuredClone(response.body.labs[0]);
  lab.importReview.requiredCapabilities.push("interaction:wireless-controller");
  lab.importReview.unresolvedRequirements.push("Configure a wireless controller GUI");
  response.body.labs = [lab];
  const [row] = parseLabJson(Buffer.from(JSON.stringify(response.body)), "Cisco", "CCNA");
  assert.ok(row.errors.some(issue => issue.includes("wireless-controller")));
  assert.ok(labSourceReviewNotes(lab).some(note => note.includes("wireless controller GUI")));
});

test("a simulator-ready lab with source notes can import as a draft", async () => {
  const response = { attachment() { return this; }, json(value) { this.body = value; return this; } };
  downloadLabTemplate({}, response);
  const lab = structuredClone(response.body.labs[0]);
  lab.importReview.sourceCoverage = "partial";
  lab.importReview.assumptions.push("Confirm interface label against the diagram");
  lab.importReview.unresolvedRequirements.push("Confirm the engine handles this connection");
  response.body.labs = [lab];
  const [row] = parseLabJson(Buffer.from(JSON.stringify(response.body)), "Cisco", "CCNA");
  assert.deepEqual(row.errors, []);
  assert.equal(labSourceReviewNotes(row.definition).length, 3);
  const verified = await verifyLabCandidate(row, async (_definition, _states, operation) =>
    operation === "grade" ? { score: 0 } : { valid: true, score: 100, errors: [] });
  assert.equal(verified.verification.status, "PASSED");
  assert.deepEqual(labExclusionReasons(verified), []);
});

test("source inventory reports omitted exercises and explicit exclusions", () => {
  const response = { attachment() { return this; }, json(value) { this.body = value; return this; } };
  downloadLabTemplate({}, response);
  response.body.sourceInventory.totalExercises = 3;
  response.body.sourceInventory.excluded = [{ sourceId: "2", title: "Unsupported GUI lab", sourcePages: [7], reason: "Requires a graphical firewall editor" }];
  const incomplete = parseLabJsonDocument(Buffer.from(JSON.stringify(response.body)), "Cisco", "CCNA");
  assert.ok(incomplete.inventoryIssues.some(issue => issue.includes("3 exercises declared")));
  assert.ok(labExclusionReasons(incomplete.candidates[0]).some(issue => issue.includes("Source inventory")));
  response.body.sourceInventory.totalExercises = 2;
  const complete = parseLabJsonDocument(Buffer.from(JSON.stringify(response.body)), "Cisco", "CCNA");
  assert.deepEqual(complete.inventoryIssues, []);
  assert.equal(complete.sourceExclusions[0].reason, "Requires a graphical firewall editor");
});

test("declared capabilities must cover the devices and grading rules actually used", () => {
  const response = { attachment() { return this; }, json(value) { this.body = value; return this; } };
  downloadLabTemplate({}, response);
  response.body.labs[0].tasks[0].rules = [{ type: "interface_up", interface: "Ethernet0/0" }];
  response.body.labs[0].importReview.requiredCapabilities = ["engine:netsim-v1"];
  const [row] = parseLabJson(Buffer.from(JSON.stringify(response.body)), "Cisco", "CCNA");
  assert.ok(row.errors.some(issue => issue.includes("device:router")));
  assert.ok(row.errors.some(issue => issue.includes("rule:interface_up")));
});

test("only an executable reference solution with an incomplete untouched attempt is supported", async () => {
  const response = { attachment() { return this; }, json(value) { this.body = value; return this; } };
  downloadLabTemplate({}, response);
  const [row] = parseLabJson(Buffer.from(JSON.stringify(response.body)), "Cisco", "CCNA");
  const supported = await verifyLabCandidate(row, async (_lab, _state, operation) => operation === "grade" ? { score: 0 } : { valid: true, score: 100, errors: [], tasks: [{ id: 1, passed: true }] });
  assert.equal(supported.verification.status, "PASSED");
  assert.deepEqual(labExclusionReasons(supported), []);
  const wrong = await verifyLabCandidate(row, async (_lab, _state, operation) => operation === "grade" ? { score: 0 } : { valid: false, score: 0, errors: ["Task 1: unsupported command"], tasks: [{ id: 1, passed: false }] });
  assert.equal(wrong.verification.status, "FAILED");
  assert.ok(labExclusionReasons(wrong).some(issue => issue.includes("unsupported command")));
  const unavailable = await verifyLabCandidate(row, async () => { throw new Error("Python missing"); });
  assert.equal(unavailable.verification.status, "UNAVAILABLE");
  assert.ok(labExclusionReasons(unavailable).some(issue => issue.includes("Python missing")));
});

test("incomplete JSON labs remain available for correction", () => {
  const [row] = parseLabJson(Buffer.from(JSON.stringify({ labs: [{ title: "Incomplete lab", engine: "netsim-v1", devices: [], tasks: [] }] })), "Cisco", "CCNA");
  assert.equal(row.reviewed, false);
  assert.ok(row.errors.some(issue => /Devices:/i.test(issue)));
  assert.ok(row.errors.some(issue => /Tasks:/i.test(issue)));
});

test("review lists device, interface and task issues together", () => {
  const response = { attachment() { return this; }, json(value) { this.body = value; return this; } };
  downloadLabTemplate({}, response);
  const lab = structuredClone(response.body.labs[0]);
  delete lab.devices[0].interfaces["Ethernet0/0"].status;
  lab.devices[1].interfaces["Ethernet0/0"].ip = "10.0.0.2";
  lab.tasks[0].rules = [];
  lab.tasks[0].hint = "";
  const [row] = parseLabJson(Buffer.from(JSON.stringify({ labs: [lab] })), "Cisco", "CCNA");
  assert.equal(row.reviewed, false);
  assert.ok(row.errors.some(issue => /R1.*Ethernet0\/0.*status/.test(issue)));
  assert.ok(row.errors.some(issue => /R2.*Ethernet0\/0.*prefix/.test(issue)));
  assert.ok(row.errors.some(issue => /Task 1.*reference solution or an explicit check/.test(issue)));
});

test("review explains missing CLI mode transitions in imported solutions", () => {
  const response = { attachment() { return this; }, json(value) { this.body = value; return this; } };
  downloadLabTemplate({}, response);
  const lab = structuredClone(response.body.labs[0]);
  lab.tasks[0].hint = "conf t\ninterface Ethernet0/0\nno shutdown";
  const [row] = parseLabJson(Buffer.from(JSON.stringify({ labs: [lab] })), "Cisco", "CCNA");
  assert.ok(row.errors.some(issue => issue.includes("start the solution with enable")));
  assert.ok(row.errors.some(issue => issue.includes("finish the solution with end")));
});

test("unrecognized PDF items preserve pages and require topology and grading configuration", () => {
  const rows = extractedLabCandidates([
    { page: 1, text: "Item 1 of 2. Configure VLAN 10 on SW1." },
    { page: 2, text: "Answer for item 1. switchport access vlan 10" },
    { page: 3, text: "Item 2 of 2. Configure a static route on R1." },
  ], "Cisco", "CCNA");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].sourcePages, [1, 2]);
  assert.deepEqual(rows[1].sourcePages, [3]);
  assert.ok(rows.every(row => !row.reviewed && row.errors.length && !row.definition.devices.length));
});

test("import details give a single lab its entered name and preserve source task instructions", () => {
  const rows = extractedLabCandidates([{ page: 1, text: "Lab 1. Configure VLAN 10." }], "Cisco", "CCNA");
  const details = validateImportDetails({ title: "VLAN practice", instructions: "Work through the task.", access: "FREE", durationMinutes: 45, imageUrl: "/uploads/media/lab-cover.webp" });
  const [row] = applyImportDetails(rows, details);
  assert.equal(row.definition.title, "VLAN practice");
  assert.equal(row.definition.instructions, "Work through the task.");
  assert.equal(row.definition.imageUrl, "/uploads/media/lab-cover.webp");
  assert.equal(row.definition.durationMinutes, 45);
  assert.equal(row.definition.access, "FREE");
});

test("a multi-lab file keeps distinct source titles and instructions under shared details", () => {
  const rows = extractedLabCandidates([{ page: 1, text: "Lab 1. Configure VLAN 10." }, { page: 2, text: "Lab 2. Configure OSPF." }], "Cisco", "CCNA");
  rows[0].definition.instructions = "Configure VLAN 10 on SW1.";
  rows[1].definition.instructions = "Configure OSPF on R1.";
  const details = validateImportDetails({ title: "Network skills", instructions: "Use the device consoles.", access: "FREE", durationMinutes: 60 });
  const updated = applyImportDetails(rows, details);
  assert.match(updated[0].definition.title, /^Network skills: 1 · Imported lab 1$/);
  assert.match(updated[1].definition.title, /^Network skills: 2 · Imported lab 2$/);
  assert.equal(updated[0].definition.instructions, "Configure VLAN 10 on SW1.");
  assert.equal(updated[1].definition.instructions, "Configure OSPF on R1.");
  rows[1].definition.instructions = "";
  assert.equal(applyImportDetails(rows, details)[1].definition.instructions, "Use the device consoles.");
  assert.throws(() => validateImportDetails({ title: "Paid", access: "PREMIUM", durationMinutes: 60 }), /Link a published exam/);
});

test("an existing multi-lab preview drops an older shared instruction prefix", () => {
  const row = { definition: { instructions: "Basic LAN exercise\n\nConfigure VLAN 77 and LACP." } };
  assert.equal(removeLegacySharedInstructions(row, { instructions: "Basic LAN exercise" }, 27).definition.instructions, "Configure VLAN 77 and LACP.");
  assert.equal(removeLegacySharedInstructions(row, { instructions: "Basic LAN exercise" }, 1), row);
});
