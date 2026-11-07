import { SUPPORTED_NETSIM_RULE_TYPES } from "./netsim-validation.js";

// These identifiers describe executable simulator behavior, not certification topics.
export const LAB_IMPORT_CAPABILITIES = [
  "engine:netsim-v1",
  "device:router", "device:switch", "device:host",
  "interaction:console", "interaction:physical-links",
  ...SUPPORTED_NETSIM_RULE_TYPES.map(type => `rule:${type}`),
];

const known = new Set(LAB_IMPORT_CAPABILITIES);
const unique = values => [...new Set(values)];

export function labSourceReviewNotes(definition) {
  const review = definition?.importReview;
  if (!review || typeof review !== "object" || Array.isArray(review)) return [];
  const notes = [];
  if (review.sourceCoverage !== "complete") notes.push("Confirm the entire source exercise is modeled before publishing");
  for (const assumption of Array.isArray(review.assumptions) ? review.assumptions : [])
    if (typeof assumption === "string" && assumption.trim()) notes.push(`Check against source: ${assumption.trim()}`);
  for (const requirement of Array.isArray(review.unresolvedRequirements) ? review.unresolvedRequirements : [])
    if (typeof requirement === "string" && requirement.trim()) notes.push(`Confirm simulator support: ${requirement.trim()}`);
  return unique(notes);
}

export function labCapabilityIssues(definition) {
  const issues = [];
  const review = definition?.importReview;
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return ["Import review: add importReview with sourceCoverage, requiredCapabilities, assumptions and unresolvedRequirements"];
  }
  if (!["complete", "partial"].includes(review.sourceCoverage)) issues.push("Import review: sourceCoverage must be complete or partial");
  for (const field of ["requiredCapabilities", "assumptions", "unresolvedRequirements"]) {
    if (!Array.isArray(review[field]) || review[field].some(value => typeof value !== "string" || !value.trim()))
      issues.push(`Import review: ${field} must be an array of nonempty strings`);
  }
  for (const capability of Array.isArray(review.requiredCapabilities) ? review.requiredCapabilities : []) {
    if (!known.has(capability)) issues.push(`Unsupported capability: ${capability}`);
  }
  if (Array.isArray(review.requiredCapabilities)) {
    const declared = new Set(review.requiredCapabilities);
    const used = ["engine:netsim-v1"];
    for (const device of Array.isArray(definition.devices) ? definition.devices : []) {
      if (device?.type) used.push(`device:${device.type}`);
      if (device?.console !== false) used.push("interaction:console");
    }
    if (Array.isArray(definition.links) && definition.links.length) used.push("interaction:physical-links");
    for (const task of Array.isArray(definition.tasks) ? definition.tasks : [])
      for (const rule of Array.isArray(task?.rules) ? task.rules : [])
        if (rule?.type) used.push(`rule:${rule.type}`);
    for (const capability of unique(used)) if (known.has(capability) && !declared.has(capability))
      issues.push(`Undeclared capability used by lab: ${capability}`);
  }
  if (definition?.engine !== "netsim-v1") issues.push("Unsupported import engine: verified imports require netsim-v1");
  for (const [index, task] of (Array.isArray(definition?.tasks) ? definition.tasks : []).entries()) {
    if (!task?.hint?.trim()) issues.push(`Task ${index + 1}: add executable reference solution commands in hint`);
  }
  return unique(issues);
}
