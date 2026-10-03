import { ApiError } from "../utils/api-error.js";
import { createDeviceState, getPrompt } from "../vendor/lab-ccna/iosHelpers.js";
import { processCommand } from "../vendor/lab-ccna/iosCommands.js";
import { getTaskResults } from "../vendor/lab-ccna/taskVerification.js";
import { lookupCmd } from "../vendor/lab-ccna/iosCmdTree.js";
import { renderTopologySVG } from "../vendor/lab-ccna/topoRenderer.js";
import { validateNetDefinition } from "./netsim-validation.js";
import { renderLabTopology } from "./lab-topology.js";

export function validateLab(input) {
  const fail = message => { throw new ApiError(400, message); };
  const text = (value, name, max, required = true) => {
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail(`Invalid ${name}`);
    return value.trim();
  };
  if (!input || JSON.stringify(input).length > 150000 || /"(?:__proto__|constructor|prototype)"\s*:/.test(JSON.stringify(input))) fail("Invalid lab definition");
  const title = text(input.title, "title", 150);
  const authorNotes = text(input.authorNotes || "", "review notes", 5000, false);
  const engine = input.engine || "legacy";
  if (!["legacy", "netsim-v1"].includes(engine)) fail("Unsupported lab engine");
  const category = text(input.category, "category", 100);
  const subcategory = text(input.subcategory ?? "", "subcategory", 100, false);
  const imageUrl = text(input.imageUrl ?? "", "cover image", 2048, false);
  if (imageUrl && !/^\/uploads\/media\/[A-Za-z0-9._-]+$/.test(imageUrl)) fail("Select an uploaded cover image");
  if (!Array.isArray(input.devices) || input.devices.length < 1 || input.devices.length > 12) fail("Use between 1 and 12 devices");
  const devices = input.devices.map(d => {
    if (!d || typeof d !== "object") fail("Invalid device");
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,30}$/.test(d.name) || ["constructor", "prototype", "__proto__"].includes(d.name)) fail("Device names must be unique letters, numbers or hyphens");
    if (!(engine === "netsim-v1" ? ["router", "switch", "host"] : ["router", "switch"]).includes(d.type)) fail("Unsupported device type");
    if (!d.interfaces || typeof d.interfaces !== "object" || Array.isArray(d.interfaces) || Object.keys(d.interfaces).length > 48) fail("Invalid device interfaces");
    const interfaces = {};
    for (const [name, info] of Object.entries(d.interfaces)) {
      if (!/^[A-Za-z][A-Za-z0-9/.:-]{0,40}$/.test(name) || ["constructor", "prototype"].includes(name)) fail("Invalid interface name");
      if (!info || !["up", "down", "administratively down"].includes(info.status)) fail("Invalid interface status");
      interfaces[name] = { status: info.status, ...(info.ip ? { ip: text(info.ip, "interface address", 80) } : {}) };
    }
    return { name: d.name, hostname: d.name, type: d.type, interfaces, ...(engine === "netsim-v1" ? { console: d.console !== false, gateway: text(d.gateway || "", "gateway", 40, false), initialConfig: text(d.initialConfig || "", "initial commands", 12000, false) } : {}) };
  });
  const names = new Set(devices.map(d => d.name));
  if (names.size !== devices.length) fail("Device names must be unique");
  if (!Array.isArray(input.tasks) || input.tasks.length < 1 || input.tasks.length > 50) fail("Use between 1 and 50 tasks");
  const netDefinition = engine === "netsim-v1" ? validateNetDefinition(input, devices, text) : null;
  const tasks = netDefinition ? netDefinition.tasks : input.tasks.map((task, index) => {
    if (!task || typeof task !== "object") fail("Invalid task");
    if (!names.has(task.device)) fail(`Task ${index + 1}: select an existing device`);
    if (!Array.isArray(task.check) || !task.check.length || task.check.length > 30 || task.check.some(row => !Array.isArray(row) || !row.length || row.length > 20 || row.some(k => typeof k !== "string" || !k.trim() || k.length > 200))) fail(`Task ${index + 1}: provide command checks`);
    return { id: index + 1, device: task.device, text: text(task.text, "task instructions", 5000), hint: text(task.hint || "", "solution", 8000, false), check: task.check };
  });
  if (!["FREE", "PREMIUM"].includes(input.access)) fail("Select an access level");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) fail("Duration must be 1–1440 minutes");
  return { engine, authorNotes, ...(netDefinition ? { links: netDefinition.links } : {}), title, category, subcategory, imageUrl, devices, tasks, topology: text(input.topology || "", "topology", 20000, false), instructions: text(input.instructions || "", "instructions", 20000, false), access: input.access, examId: input.examId || null, durationMinutes: input.durationMinutes };
}

export const initialStates = lab => Object.fromEntries(lab.devices.map(device => [device.name, createDeviceState(device)]));
export function execute(state, command) {
  if (typeof command !== "string" || command.length > 1000 || /[\r\n\x00-\x08]/.test(command) || /(?:__proto__|constructor|prototype)/i.test(command)) throw new ApiError(400, "Enter one supported command, up to 1,000 characters");
  // Bound interface-range expansion in the upstream parser.
  if (/\brange\b/i.test(command) && [...command.matchAll(/\d+/g)].some(m => Number(m[0]) > 128)) throw new ApiError(400, "Interface range is too large");
  const prompt = getPrompt(state);
  if (command.trimEnd().endsWith("?")) {
    const { matches } = lookupCmd(command.trimEnd().slice(0, -1), state.mode);
    return { state, prompt, output: matches.map(m => `${m.word.padEnd(28)} ${m.desc}`).join("\n") || "% No matching commands" };
  }
  const result = processCommand(command, structuredClone(state));
  result.state.commandHistory = result.state.commandHistory.slice(-200);
  if (JSON.stringify(result.state).length > 200000) throw new ApiError(400, "Device configuration limit reached");
  return { ...result, prompt };
}
export function grade(attempt) {
  const checks = getTaskResults(attempt.snapshot, attempt.states);
  const tasks = attempt.snapshot.tasks.map(t => ({ id: t.id, text: t.text, device: t.device, passed: Boolean(checks[t.id]), solution: t.hint }));
  const correct = tasks.filter(t => t.passed).length;
  return { tasks, correct, total: tasks.length, score: Math.round(correct / tasks.length * 100) };
}
export function publicLab(lab) {
  const { title, category, instructions, topology, devices, tasks, access, examId, durationMinutes } = lab;
  return { title, category, subcategory: lab.subcategory || "", instructions, topology, engine: lab.engine || "legacy", links: lab.links, diagram: lab.engine === "netsim-v1" ? renderLabTopology(lab) : renderTopologySVG({ devices, topology }, "light"), devices: devices.map(({ initialConfig, ...d }) => d), tasks: tasks.map(({ id, text, device, points }) => ({ id, text, device, points })), access, examId, durationMinutes };
}
export function presentAttempt(a) {
  return { _id: a._id, labId: a.labId, lab: publicLab(a.snapshot), mode: a.mode, status: a.status, deadline: a.deadline, solutionViewed: a.solutionViewed, transcript: a.transcript, prompts: a.snapshot.engine === "netsim-v1" ? a.states.prompts : Object.fromEntries(Object.entries(a.states).map(([name, state]) => [name, getPrompt(state)])), result: a.status === "SUBMITTED" ? a.result : undefined };
}
