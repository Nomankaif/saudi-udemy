import { isIP } from "node:net";
import { SUPPORTED_NETSIM_RULE_TYPES } from "./netsim-validation.js";
import { validateLab } from "./lab.service.js";

const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const ipv4 = value => typeof value === "string" && isIP(value) === 4;
const cidr = value => typeof value === "string" && /^\d{1,2}$/.test(value.split("/")[1] || "") && value.split("/").length === 2 && ipv4(value.split("/")[0]) && Number(value.split("/")[1]) <= 32;
const ipv6Cidr = value => typeof value === "string" && value.split("/").length === 2 && isIP(value.split("/")[0]) === 6 && /^\d{1,3}$/.test(value.split("/")[1]) && Number(value.split("/")[1]) <= 128;
const interfaceRuleTypes = new Set(["access_vlan", "trunk", "interface_up", "interface_ip", "interface_ipv6", "voice_vlan", "native_vlan", "allowed_vlans", "channel_group", "lldp_neighbor", "lldp_transmit", "lldp_receive", "cdp_enable", "ospf_priority", "ospf_interface", "ospf_dr"]);
const switchRuleTypes = new Set(["vlan", "access_vlan", "trunk", "vlan_name", "voice_vlan", "native_vlan", "allowed_vlans", "channel_group"]);
const routeRuleTypes = new Set(["static_route", "route", "ospf_route"]);

/** Collect field-specific review issues. Core validation remains the final authority. */
export function labImportIssues(definition) {
  const issues = [];
  const add = issue => { if (issues.length < 250 && !issues.includes(issue)) issues.push(issue); };
  if (!plainObject(definition)) return ["Lab: enter a JSON object"];
  if (typeof definition.title !== "string" || !definition.title.trim() || definition.title.length > 150) add("Title: enter 1–150 characters");
  if (definition.engine && !["netsim-v1", "legacy"].includes(definition.engine)) add("Engine: use netsim-v1 for network simulation");
  if (!["FREE", "PREMIUM"].includes(definition.access)) add("Access: choose FREE or PREMIUM");
  if (!Number.isInteger(definition.durationMinutes) || definition.durationMinutes < 1 || definition.durationMinutes > 1440) add("Duration: use 1–1440 minutes");
  if (definition.instructions !== undefined && (typeof definition.instructions !== "string" || definition.instructions.length > 20000)) add("Student instructions: use text up to 20,000 characters");
  if (definition.topology !== undefined && (typeof definition.topology !== "string" || definition.topology.length > 20000)) add("Topology description: use text up to 20,000 characters");

  const devices = definition.devices;
  if (!Array.isArray(devices) || devices.length < 1 || devices.length > 12) add("Devices: add 1–12 routers, switches or PCs");
  const deviceMap = new Map();
  let consoleCount = 0;
  for (const [index, device] of (Array.isArray(devices) ? devices : []).entries()) {
    const label = `Device ${index + 1}${device?.name ? ` (${device.name})` : ""}`;
    if (!plainObject(device)) { add(`${label}: enter a device object`); continue; }
    if (typeof device.name !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,30}$/.test(device.name) || ["constructor", "prototype", "__proto__"].includes(device.name)) add(`${label}: use a unique device name with letters, numbers or hyphens`);
    else if (deviceMap.has(device.name)) add(`${label}: device name is repeated`);
    else deviceMap.set(device.name, device);
    if (!["router", "switch", "host"].includes(device.type)) add(`${label}: type must be router, switch or host`);
    if (device.console !== false) consoleCount++;
    const interfaces = device.interfaces;
    if (!plainObject(interfaces) || !Object.keys(interfaces).length || Object.keys(interfaces).length > 48) add(`${label}: add 1–48 interfaces`);
    if (device.type === "host" && (!plainObject(interfaces) || Object.keys(interfaces).length !== 1 || !Object.hasOwn(interfaces, "eth0"))) add(`${label}: a PC or host needs exactly one interface named eth0; update its links too`);
    for (const [name, info] of Object.entries(plainObject(interfaces) ? interfaces : {})) {
      const location = `${label} / ${name}`;
      if (!/^[A-Za-z][A-Za-z0-9/.:-]{0,40}$/.test(name) || ["constructor", "prototype"].includes(name)) add(`${location}: invalid interface name`);
      if (!plainObject(info)) { add(`${location}: use an object with status and optional IPv4/prefix`); continue; }
      if (!["up", "down", "administratively down"].includes(info.status)) add(`${location}: status must be up, down or administratively down`);
      if (info.ip && !cidr(info.ip)) add(`${location}: IP must include a valid IPv4 prefix, such as 10.0.0.1/24`);
    }
    if (device.gateway && !ipv4(device.gateway)) add(`${label}: gateway must be an IPv4 address`);
    if (device.initialConfig !== undefined && (typeof device.initialConfig !== "string" || device.initialConfig.length > 12000 || device.initialConfig.split("\n").length > 100)) add(`${label}: initialConfig must be at most 100 commands and 12,000 characters`);
  }
  if (Array.isArray(devices) && devices.length && !consoleCount) add("Devices: allow console access to at least one device");

  const links = definition.links;
  if (definition.engine !== "legacy" && (!Array.isArray(links) || links.length < 1 || links.length > 48)) add("Links: add 1–48 physical connections");
  const usedPorts = new Set();
  for (const [index, link] of (Array.isArray(links) ? links : []).entries()) {
    const label = `Link ${index + 1}`;
    if (!plainObject(link)) { add(`${label}: enter a connection object`); continue; }
    for (const side of ["from", "to"]) {
      const name = link[`${side}Device`], iface = link[`${side}Interface`];
      const device = deviceMap.get(name);
      if (!device || !plainObject(device.interfaces) || !Object.hasOwn(device.interfaces, iface)) add(`${label}: ${side} endpoint ${name || "?"} / ${iface || "?"} must match a device interface`);
      const key = `${name}:${iface}`;
      if (usedPorts.has(key)) add(`${label}: ${name} / ${iface} is already connected`);
      usedPorts.add(key);
    }
    if (link.fromDevice && link.fromDevice === link.toDevice) add(`${label}: connect two different devices`);
  }

  const tasks = definition.tasks;
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 50) add("Tasks: add 1–50 tasks with reference solutions or checks");
  for (const [index, task] of (Array.isArray(tasks) ? tasks : []).entries()) {
    const label = `Task ${index + 1}${task?.device ? ` (${task.device})` : ""}`;
    if (!plainObject(task)) { add(`${label}: enter a task object`); continue; }
    const device = deviceMap.get(task.device);
    if (!device) add(`${label}: choose an existing device`);
    if (typeof task.text !== "string" || !task.text.trim() || task.text.length > 5000) add(`${label}: enter task instructions up to 5,000 characters`);
    if (!Number.isInteger(task.points) || task.points < 1 || task.points > 100) add(`${label}: points must be 1–100`);
    if (task.hint !== undefined && (typeof task.hint !== "string" || task.hint.length > 8000)) add(`${label}: solution hint must be text up to 8,000 characters`);
    if (typeof task.hint === "string") {
      const commands = task.hint.split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(line => line && !line.startsWith("!"));
      const configAt = commands.findIndex(line => /^(?:conf t|configure terminal)$/.test(line));
      if (configAt >= 0 && !commands.slice(0, configAt).some(line => /^(?:enable|en)$/.test(line))) add(`${label}: start the solution with enable before configure terminal`);
      if (configAt >= 0 && !commands.slice(configAt + 1).includes("end")) add(`${label}: finish the solution with end so the next task starts in the correct CLI mode`);
    }
    if (task.rules !== undefined && !Array.isArray(task.rules)) add(`${label}: additional checks must be a list`);
    if (Array.isArray(task.rules) && task.rules.length > 10) add(`${label}: use at most 10 additional checks`);
    if (!String(task.hint || "").trim() && !(Array.isArray(task.rules) && task.rules.length)) add(`${label}: add a reference solution or an explicit check`);
    for (const [ruleIndex, rule] of (Array.isArray(task.rules) ? task.rules : []).entries()) {
      const where = `${label} / rule ${ruleIndex + 1}`;
      if (!plainObject(rule)) { add(`${where}: enter a grading rule object`); continue; }
      if (!SUPPORTED_NETSIM_RULE_TYPES.includes(rule.type)) { add(`${where}: unsupported rule type ${String(rule.type)}`); continue; }
      if (interfaceRuleTypes.has(rule.type) && !rule.interface) add(`${where}: select the interface to grade`);
      else if (rule.interface && device && !Object.hasOwn(device.interfaces || {}, rule.interface)) add(`${where}: ${rule.interface} is not an interface on ${device.name}`);
      if (switchRuleTypes.has(rule.type) && device && device.type !== "switch") add(`${where}: ${rule.type} requires a switch`);
      if ((routeRuleTypes.has(rule.type) || rule.type.startsWith("ospf_")) && device && device.type !== "router") add(`${where}: ${rule.type} requires a router`);
      if (rule.type === "interface_ip" && !cidr(rule.value)) add(`${where}: expected IPv4 address needs a prefix, such as 10.0.0.1/24`);
      if (rule.type === "interface_ipv6" && !ipv6Cidr(rule.value)) add(`${where}: expected IPv6 address needs a prefix`);
      if (routeRuleTypes.has(rule.type) && !cidr(rule.value)) add(`${where}: route destination needs an IPv4 prefix`);
      if (rule.type === "static_route" && !ipv4(rule.nextHop)) add(`${where}: enter a valid nextHop IPv4 address`);
      if (rule.type === "ping" && !ipv4(rule.value)) add(`${where}: ping destination must be an IPv4 address`);
      if (["vlan", "access_vlan", "voice_vlan", "native_vlan"].includes(rule.type) && (!/^\d+$/.test(String(rule.value || "")) || +rule.value < 1 || +rule.value > 4094)) add(`${where}: VLAN ID must be 1–4094`);
      if (rule.type === "channel_group" && !/^([1-9]\d{0,3}) (active|passive|on|desirable|auto)$/.test(String(rule.value || ""))) add(`${where}: use channel number and mode, such as 34 active`);
      if (rule.type === "config" && (typeof rule.value !== "string" || !rule.value.trim() || /[\r\n]/.test(rule.value))) add(`${where}: enter one running-configuration line`);
    }
  }

  try { validateLab(definition); }
  catch (error) {
    const message = error.message || "Complete the lab definition";
    const covered = (
      (message === "Invalid interface status" && issues.some(issue => issue.includes("status must"))) ||
      (/add a reference solution or an explicit check/.test(message) && issues.some(issue => issue.includes("reference solution or an explicit check"))) ||
      (/PCs require one interface named eth0/.test(message) && issues.some(issue => issue.includes("interface named eth0"))) ||
      (/add at least one interface/.test(message) && issues.some(issue => issue.includes("add 1–48 interfaces"))) ||
      (/use an IPv4 address\/prefix/.test(message) && issues.some(issue => issue.includes("IPv4 prefix"))) ||
      (/between 1 and 12 devices/.test(message) && issues.some(issue => issue.startsWith("Devices:")))
    );
    if (!covered) add(`Simulator validation: ${message}`);
  }
  return issues;
}
