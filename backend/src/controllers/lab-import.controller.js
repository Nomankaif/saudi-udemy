import { createHash } from "node:crypto";
import path from "node:path";
import Lab from "../models/lab.model.js";
import LabImport from "../models/lab-import.model.js";
import { writeImportSource } from "../services/blob-store.js";
import { validateClassification } from "../services/category.service.js";
import { validateLab } from "../services/lab.service.js";
import { labCandidateIssues, labExclusionReasons, verifyLabCandidate, processNextLabImport, renderLabSourcePage } from "../services/lab-import.service.js";
import { SUPPORTED_NETSIM_RULE_TYPES } from "../services/netsim-validation.js";
import { LAB_IMPORT_CAPABILITIES, labSourceReviewNotes } from "../services/lab-import-capabilities.js";
import { ApiError } from "../utils/api-error.js";
import mongoose from "mongoose";
import Exam from "../models/exam.model.js";
import { removeLegacySharedInstructions, validateImportDetails } from "../services/lab-import-details.js";
import { bulkImportIssues } from "../services/import-review.js";

const example = {
  sourceId: "example-1", engine: "netsim-v1", title: "Two-device interface configuration", category: "Example provider", subcategory: "Example exam",
  instructions: "Enable the connection between R1 and R2. Use the device consoles to complete the task.",
  topology: "R1 Ethernet0/0 connects to R2 Ethernet0/0.",
  devices: [
    { name: "R1", type: "router", interfaces: { "Ethernet0/0": { ip: "10.0.0.1/30", status: "administratively down" } } },
    { name: "R2", type: "router", interfaces: { "Ethernet0/0": { ip: "10.0.0.2/30", status: "up" } } },
  ],
  links: [{ fromDevice: "R1", fromInterface: "Ethernet0/0", toDevice: "R2", toInterface: "Ethernet0/0" }],
  tasks: [{ device: "R1", text: "Enable Ethernet0/0 on R1.", hint: "enable\nconfigure terminal\ninterface Ethernet0/0\nno shutdown\nend", points: 10, rules: [] }],
  access: "FREE", durationMinutes: 60,
  importReview: { sourceCoverage: "complete", requiredCapabilities: ["engine:netsim-v1", "device:router", "interaction:console", "interaction:physical-links"], assumptions: [], unresolvedRequirements: [] },
};

export function downloadLabTemplate(request, response) {
  response.attachment("lab-import-template.json").json({
    version: 2,
    _guide: {
      purpose: "Generation and review instructions only. The importer reads the labs array and ignores this _guide object.",
      workflow: ["Create one lab object per complete source exercise, regardless of certification or PDF layout. Never silently omit a task or required interaction.", "Match the source diagram and intended starting state before choosing device interfaces and initialConfig.", "Give each configuration task a complete reference CLI solution. The simulator compares the configuration changes it makes with the student's final state. Add explicit rules only for outcomes such as connectivity, adjacency, negotiation or saved configuration.", "Set importReview.sourceCoverage to complete only when every required part is modeled. Record uncertain interpretations in assumptions and missing or new simulator features in unresolvedRequirements.", "Use requiredCapabilities for every device, interaction and grading behavior used. Any unknown capability identifier is excluded, not guessed or converted to a different behavior.", "Upload JSON; inspect the included/excluded report. Structurally valid labs with a passing reference solution can be imported as drafts. Source notes remain pending until an administrator confirms them before publishing."],
      outputContract: { included: "A lab can be imported as a draft after structural validation, known capabilities, a failing untouched attempt, and a passing reference solution. Source uncertainties remain visible and block publishing until confirmed.", excluded: "Structurally invalid, simulator-incompatible, or untestable labs remain in the review report with specific reasons. Never replace unsupported requirements with a generic config check or silently drop them.", sourceIntegrity: "The software cannot prove that generated content matches a PDF. Compare diagrams, starting configuration, tasks, answers and grading with the source before publishing." },
      importReview: { sourceCoverage: "complete or partial. Use partial when any task, device, source diagram, interaction or answer is not represented. Partial labs may be imported as drafts but require source confirmation before publishing.", requiredCapabilities: "Array of capability IDs from capabilityCatalog. Unknown IDs explicitly identify new behavior and cause exclusion.", assumptions: "List every unverified interpretation; keep empty only after checking the source. These remain pending source review on imported drafts.", unresolvedRequirements: "List behavior the simulator or this JSON cannot express. Such labs remain drafts until an administrator resolves and confirms the source review; unknown required capability IDs still block import.", sourcePages: "Optional lab-level array of source PDF page numbers, outside importReview." },
      sourceInventory: "Set totalExercises to the number of complete source exercises. Put each unsupported or omitted exercise in excluded with sourceId, title, sourcePages and reason. Give every modeled lab a unique sourceId. The total and IDs are checked so missing exercises cannot disappear silently.",
      capabilityCatalog: LAB_IMPORT_CAPABILITIES,
      limits: { labsPerFile: 100, devicesPerLab: "1–12", linksPerLab: "1–48 for netsim-v1", tasksPerLab: "1–50", additionalChecksPerTask: "0–10", durationMinutes: "1–1440" },
      labFields: {
        engine: "Use netsim-v1 for the network simulator.",
        title: "Required; 1–150 characters.",
        categoryAndSubcategory: "Choose these in the upload form; they override values in each lab object.",
        instructions: "Student-facing task scenario. Do not include answers or source answer pages.",
        topology: "Student-facing description. Physical links are defined separately in links.",
        devices: "Each device needs a unique name, type (router, switch, or host) and 1–48 interfaces.",
        links: "Every endpoint must reference an existing device name and one of its interfaces. Each port can have one physical link.",
        tasks: "Each task needs device, text, points (1–100), and a complete private reference solution in hint. Rules are optional additional outcome checks (0–10). The simulator compares only the running-configuration changes made by that task's hint, not the entire device configuration. A hint that makes no configuration change needs an explicit rule. Every configuration hint must be a complete, independently executable CLI session: enter privileged mode with enable before configure terminal (or conf t), and finish with end. Do not assume a previous task left the console in a particular mode.",
        access: "FREE or PREMIUM; omitted values default to FREE.",
        durationMinutes: "Required integer from 1 to 1440.",
      },
      interfaceFormat: {
        requiredStatus: ["up", "down", "administratively down"],
        examples: { "Ethernet0/0": { ip: "10.0.0.1/24", status: "up" }, "Ethernet0/1": { status: "administratively down" } },
        notes: ["Do not leave an interface as {}. Set its intended starting status.", "IPv4 addresses on interfaces must include a prefix such as /24.", "A PC or server uses type host and exactly one interface named eth0. Update link endpoints to eth0 as well."],
      },
      startingState: {
        initialConfig: "Optional per-device string with newline-separated CLI commands. Add it whenever the scenario says VLANs, trunks, routes, OSPF or other settings are already configured. Do not present those preconfigured commands as student tasks.",
        example: "enable\nconfigure terminal\nvlan 10\ninterface Ethernet0/1\nswitchport mode trunk\nend",
        console: "Set console:false for a fixed reference device; at least one device must have console access.",
      },
      taskSolution: {
        purpose: "The importer executes all reference hints from the initial device state and compares each task's configuration changes with the student's final state. Additional rules verify operational outcomes. A partial command fragment can exclude the lab even when the device initialConfig is valid.",
        example: "enable\nconfigure terminal\ninterface Ethernet0/0\nswitchport trunk allowed vlan 5,6\nend",
        notes: ["For every hint that changes configuration, start with enable, then configure terminal or conf t, and finish with end.", "Include the interface or submode commands needed for that task. Each task hint must work on its own; do not rely on the CLI mode left by another task.", "Keep preconfigured device state in initialConfig and the student's expected changes in task hints."],
      },
      grading: {
        supportedRuleTypes: SUPPORTED_NETSIM_RULE_TYPES,
        examples: {
          vlan: { type: "vlan", value: "10" },
          accessVlan: { type: "access_vlan", interface: "Ethernet0/1", value: "10" },
          nativeVlan: { type: "native_vlan", interface: "Ethernet0/1", value: "77" },
          allowedVlans: { type: "allowed_vlans", interface: "Ethernet0/1", value: "10,20-30" },
          etherChannel: { type: "channel_group", interface: "Ethernet0/1", value: "34 active" },
          ospfProcess: { type: "ospf_process", value: "1" },
          ospfNeighbor: { type: "ospf_neighbor", value: "R2" },
          ipv4Interface: { type: "interface_ip", interface: "Ethernet0/0", value: "10.0.0.1/24" },
          ipv6Interface: { type: "interface_ipv6", interface: "Ethernet0/0", value: "2001:db8:12::1/64" },
          staticRoute: { type: "static_route", value: "192.168.2.0/24", nextHop: "10.0.0.2", distance: 1 },
          ping: { type: "ping", value: "192.168.2.10", expect: "success" },
          savedConfig: { type: "saved" },
        },
        notes: ["Reference commands are the default configuration check; rules add outcome checks on the specified device.", "Use a ping, adjacency, negotiation or saved rule when configuration equality alone cannot prove the task works.", "Some rules need an interface or expected value, as shown above.", "Check the expected result against the source and test it in the simulator."],
      },
    },
    sourceInventory: { totalExercises: 1, excluded: [] },
    labs: [structuredClone(example)],
  });
}

export async function startLabImport(request, response) {
  const file = request.file;
  if (!file?.buffer) throw new ApiError(400, "Select a PDF or JSON file");
  const sourceKind = path.extname(file.originalname).toLowerCase().slice(1);
  if (!["pdf", "json"].includes(sourceKind)) throw new ApiError(400, "Select a PDF or JSON file");
  if (sourceKind === "pdf" && file.buffer.subarray(0, 5).toString() !== "%PDF-") throw new ApiError(400, "The file is not a valid PDF");
  if (sourceKind === "json" && file.size > 5 * 1024 * 1024) throw new ApiError(400, "JSON files must be 5 MB or smaller");
  const classification = await validateClassification(String(request.body.category || ""), String(request.body.subcategory || ""));
  let details = null;
  if (request.body.details !== undefined) {
    try { details = validateImportDetails(JSON.parse(request.body.details)); }
    catch (error) { if (error instanceof SyntaxError) throw new ApiError(400, "Invalid lab details"); throw error; }
    if (details.examId && (!mongoose.isValidObjectId(details.examId) || !await Exam.exists({ _id: details.examId, status: "PUBLISHED" })))
      throw new ApiError(400, "Select a published exam for this lab");
  }
  const sourcePath = await writeImportSource(file.buffer, sourceKind);
  const job = await LabImport.create({ filename: file.originalname.slice(0, 200), sourcePath, sourceHash: createHash("sha256").update(file.buffer).digest("hex"), sourceKind, details, ...classification, ownerId: request.user._id });
  void processNextLabImport();
  response.status(202).json({ id: job._id, status: job.status });
}

async function ownedJob(request, ready = false) {
  const job = await LabImport.findOne({ _id: request.params.id, ownerId: request.user._id });
  if (!job) throw new ApiError(404, "Lab import not found");
  if (ready && job.status !== "READY") throw new ApiError(409, "Wait for lab extraction to finish");
  return job;
}

export async function getLabImport(request, response) {
  const job = await ownedJob(request);
  const candidates = job.status === "READY" ? job.candidates.map(row => {
    const updated = removeLegacySharedInstructions(row, job.details, job.candidates.length);
    return { ...updated, errors: labCandidateIssues(updated), exclusionReasons: labExclusionReasons(updated), reviewNotes: labSourceReviewNotes(updated.definition) };
  }) : [];
  const excluded = candidates.filter(row => row.exclusionReasons.length).map(row => ({ sourceNumber: row.sourceNumber, title: row.title, reasons: row.exclusionReasons }));
  response.json({ id: job._id, filename: job.filename, sourceKind: job.sourceKind, category: job.category, subcategory: job.subcategory, details: job.details, status: job.status, error: job.error, processedPages: job.processedPages, totalPages: job.totalPages, expectedItems: job.expectedItems, processedItems: job.processedItems, inventoryIssues: job.inventoryIssues || [], sourceExclusions: job.sourceExclusions || [], summary: { supported: candidates.length - excluded.length, excluded }, candidates });
}

export async function getLabSourcePage(request, response) {
  const job = await ownedJob(request);
  if (job.sourceKind !== "pdf") throw new ApiError(404, "PDF import not found");
  const page = Number(request.params.page);
  if (!Number.isInteger(page) || page < 1 || page > (job.totalPages || 0)) throw new ApiError(400, "Invalid source page");
  response.set("Cache-Control", "private, no-store");
  response.type("png").send(await renderLabSourcePage(job.sourcePath, page));
}

export async function updateLabCandidate(request, response) {
  const job = await ownedJob(request, true);
  const index = Number(request.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= job.candidates.length) throw new ApiError(404, "Lab row not found");
  const old = job.candidates[index];
  const input = request.body?.definition;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "Enter a lab definition");
  const definition = { ...input, category: job.category, subcategory: job.subcategory, access: input.access || "FREE" };
  const candidate = await verifyLabCandidate({ ...old, title: String(definition.title || "").trim(), definition, reviewed: false });
  if (request.body.reviewed && !labExclusionReasons(candidate).length && !labSourceReviewNotes(candidate.definition).length) candidate.reviewed = true;
  job.candidates[index] = candidate;
  job.markModified("candidates");
  await job.save();
  response.json({ ...candidate, exclusionReasons: labExclusionReasons(candidate), reviewNotes: labSourceReviewNotes(candidate.definition) });
}

export async function commitLabImport(request, response) {
  const job = await ownedJob(request, true);
  const selected = request.body?.selected;
  if (!Array.isArray(selected) || !selected.length || selected.length > 100 || selected.some(index => !Number.isInteger(index) || index < 0 || index >= job.candidates.length) || new Set(selected).size !== selected.length)
    throw new ApiError(400, "Select between 1 and 100 distinct labs");
  const classification = await validateClassification(job.category, job.subcategory);
  const candidates = selected.map(index => removeLegacySharedInstructions(job.candidates[index], job.details, job.candidates.length));
  const confirmReview = request.body?.confirmReview === true;
  const verified = [];
  for (const row of candidates) verified.push(await verifyLabCandidate(row));
  const problems = bulkImportIssues(verified, "Lab", confirmReview, labExclusionReasons);
  if (problems.length) throw new ApiError(400, problems.slice(0, 8).join("; "));
  const duplicates = await Lab.find({ importSourceHash: job.sourceHash, importSourceNumber: { $in: candidates.map(candidate => candidate.sourceNumber) } }).select("importSourceNumber").lean();
  if (duplicates.length) throw new ApiError(409, `Source lab ${duplicates[0].importSourceNumber} was already imported`);
  const documents = verified.map(row => ({ title: row.definition.title, ...classification, draft: validateLab({ ...row.definition, ...classification }), status: "DRAFT", importSourceHash: job.sourceHash, importSourceNumber: row.sourceNumber, sourceReview: { status: row.reviewed && !labSourceReviewNotes(row.definition).length ? "CONFIRMED" : "PENDING", notes: labSourceReviewNotes(row.definition), sourcePages: row.sourcePages, ...(row.reviewed && !labSourceReviewNotes(row.definition).length ? { confirmedAt: new Date() } : {}) } }));
  try { await Lab.insertMany(documents, { ordered: true }); }
  catch (error) { if (error.code === 11000) throw new ApiError(409, "Some selected labs were already imported"); throw error; }
  response.json({ imported: documents.length });
}
