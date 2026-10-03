import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ApiError } from "../utils/api-error.js";

const bridge = fileURLToPath(new URL("../simulation/bridge.py", import.meta.url));
let running = 0;
export const isNetSim = lab => lab.engine === "netsim-v1";

// Each operation reconstructs a private topology from the immutable lab and
// MongoDB command journal. No shared workspace IDs, pickle or user shell code.
export async function simulate(lab, states = {}, operation = "inspect", extra = {}) {
  if (running >= 4) throw new ApiError(503, "Lab engine is busy. Your progress is saved; please retry.");
  const payload = JSON.stringify({ lab, journal: states.journal || [], operation, ...extra });
  if (payload.length > 2000000) throw new ApiError(400, "Lab session size limit reached");
  running++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.env.NETSIM_PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-X", "utf8", "-B", "-u", bridge], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let output = "", settled = false;
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => { child.kill(); finish(new ApiError(503, "Lab operation exceeded its time limit. No changes were saved.")); }, 12000);
      child.on("error", () => finish(new ApiError(503, "Lab engine unavailable. Configure NETSIM_PYTHON with Python 3.12 or newer.")));
      child.stdin.on("error", () => {});
      child.stdout.on("data", chunk => { output += chunk.toString(); if (output.length > 2000000) { child.kill(); finish(new ApiError(400, "Lab output limit reached")); } });
      child.stderr.on("data", () => {});
      child.on("close", code => {
        if (code !== 0) return finish(new ApiError(503, "Lab engine could not complete this operation. No changes were saved."));
        try { const result = JSON.parse(output); if (result.error) finish(new ApiError(400, result.error)); else finish(null, result); }
        catch { finish(new ApiError(503, "Invalid lab engine response")); }
      });
      child.stdin.end(payload);
    });
  } finally { running--; }
}

export async function netStates(lab) {
  const result = await simulate(lab);
  return { journal: [], prompts: result.prompts };
}
export async function netCommand(a, device, command) {
  if (!a.snapshot.devices.some(d => d.name === device && d.console !== false)) throw new ApiError(400, "Select an editable device in this lab");
  if (typeof command !== "string" || command.length > 1000 || /[\r\n\x00-\x1f]/.test(command)) throw new ApiError(400, "Enter one command, up to 1,000 characters");
  if (a.states.journal.length >= 2000) throw new ApiError(400, "This session has reached its 2,000-command limit. Submit or start a new session.");
  const result = await simulate(a.snapshot, a.states, "command", { device, command });
  a.states = { journal: [...a.states.journal, { device, command }], prompts: result.prompts };
  return result;
}
