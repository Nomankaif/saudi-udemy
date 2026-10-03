import { isIP } from "node:net";
import { ApiError } from "../utils/api-error.js";

const fail = message => { throw new ApiError(400, message); };
const ipv4 = v => typeof v === "string" && isIP(v) === 4;
const cidr = v => typeof v === "string" && v.split("/").length === 2 && ipv4(v.split("/")[0]) && /^\d{1,2}$/.test(v.split("/")[1]) && Number(v.split("/")[1]) <= 32;
const extraTypes = ["interface_ipv6", "vlan_name", "voice_vlan", "native_vlan", "allowed_vlans", "channel_group", "lldp_neighbor", "lldp_transmit", "lldp_receive", "cdp_enable", "ospf_process", "ospf_router_id", "ospf_priority", "ospf_interface", "ospf_network", "ospf_neighbor", "ospf_dr"];
const extraInterfaces = ["interface_ipv6", "voice_vlan", "native_vlan", "allowed_vlans", "channel_group", "lldp_neighbor", "lldp_transmit", "lldp_receive", "cdp_enable", "ospf_priority", "ospf_interface", "ospf_dr"];
export function validateNetDefinition(input, devices, text) {
  if (!devices.some(d => d.console !== false)) fail("Allow console access to at least one device");
  for (const d of devices) {
    if (!Object.keys(d.interfaces).length) fail(`${d.name}: add at least one interface`);
    if (d.type === "host" && (Object.keys(d.interfaces).length !== 1 || !d.interfaces.eth0)) fail(`${d.name}: PCs require one interface named eth0`);
    for (const i of Object.values(d.interfaces)) if (i.ip && !cidr(i.ip)) fail(`${d.name}: use an IPv4 address/prefix, such as 10.0.0.1/24`);
    if (d.gateway && !ipv4(d.gateway)) fail(`${d.name}: invalid gateway`);
    if (d.initialConfig.split("\n").length > 100) fail(`${d.name}: use at most 100 initial commands`);
  }
  const deviceMap = new Map(devices.map(d => [d.name, d]));
  if (!Array.isArray(input.links) || input.links.length < 1 || input.links.length > 48) fail("Add between 1 and 48 physical connections");
  const used = new Set();
  const links = input.links.map(link => {
    if (!link || typeof link !== "object") fail("Invalid connection");
    const result = {};
    for (const side of ["from", "to"]) {
      const device = link[`${side}Device`], iface = link[`${side}Interface`];
      if (!deviceMap.has(device) || !Object.hasOwn(deviceMap.get(device).interfaces, iface)) fail("A connection references a missing device or interface");
      const key = `${device}:${iface}`;
      if (used.has(key)) fail(`${key} is already connected`);
      used.add(key); result[`${side}Device`] = device; result[`${side}Interface`] = iface;
    }
    if (result.fromDevice === result.toDevice) fail("Connect two different devices");
    return result;
  });
  const tasks = input.tasks.map((t, index) => {
    if (!t || typeof t !== "object") fail("Invalid task");
    const dev = deviceMap.get(t.device);
    if (!dev) fail(`Task ${index + 1}: select a device`);
    if (!Number.isInteger(t.points) || t.points < 1 || t.points > 100) fail(`Task ${index + 1}: points must be 1–100`);
    if (!Array.isArray(t.rules) || !t.rules.length || t.rules.length > 10) fail(`Task ${index + 1}: add 1–10 grading rules`);
    const rules = t.rules.map(rule => {
      if (!rule || typeof rule !== "object") fail("Invalid grading rule");
      const { type } = rule;
      if (!["vlan", "access_vlan", "trunk", "interface_up", "interface_ip", "static_route", "route", "ospf_route", "saved", "ping", "config", ...extraTypes].includes(type)) fail("Unknown grading rule");
      const value = text(rule.value || "", "expected value", 300, false);
      const iface = rule.interface || "";
      if (iface && !Object.hasOwn(dev.interfaces, iface)) fail(`${dev.name}: grading interface does not exist`);
      if (["access_vlan", "trunk", "interface_up", "interface_ip", ...extraInterfaces].includes(type) && !iface) fail("Select the interface to grade");
      if (["vlan_name", "voice_vlan", "native_vlan", "allowed_vlans", "channel_group"].includes(type) && dev.type !== "switch") fail("This check requires a switch");
      if (type.startsWith("ospf_") && dev.type !== "router") fail("OSPF checks require a router");
      if (type === "interface_ipv6" && !(isIP(value.split("/")[0]) === 6 && /^\d{1,3}$/.test(value.split("/")[1] || "") && value.split("/").length === 2 && Number(value.split("/")[1]) <= 128)) fail("Expected IPv6 address must include a prefix from 0–128");
      if (["voice_vlan", "native_vlan"].includes(type) && (!/^\d+$/.test(value) || +value < 1 || +value > 4094)) fail("VLAN ID must be 1–4094");
      if (type === "vlan_name" && !/^([1-9]\d{0,3})\|[^\s|]{1,32}$/.test(value)) fail("Use VLAN-ID|Name, for example 77|User_VLAN");
      if (type === "vlan_name" && +value.split("|")[0] > 4094) fail("VLAN ID must be 1–4094");
      if (type === "allowed_vlans" && !["all", "none"].includes(value) && !value.split(",").every(part => /^\d+(?:-\d+)?$/.test(part) && +part.split("-")[0] >= 1 && +part.split("-").at(-1) <= 4094 && +part.split("-")[0] <= +part.split("-").at(-1))) fail("Use all, none or VLAN IDs/ranges such as 10,20-30");
      if (type === "channel_group" && !/^([1-9]\d{0,3}) (active|passive|on|desirable|auto)$/.test(value)) fail("Use channel number and mode, for example 10 active");
      if (type === "channel_group" && +value.split(" ")[0] > 4094) fail("Channel number must be 1–4094");
      if (["lldp_transmit", "lldp_receive", "cdp_enable"].includes(type) && !["enabled", "disabled"].includes(value)) fail("Expected state must be enabled or disabled");
      if (["ospf_neighbor", "lldp_neighbor"].includes(type) && (!deviceMap.has(value) || value === dev.name)) fail("Select another existing device name as the neighbor");
      if (type === "ospf_router_id" && !ipv4(value)) fail("Router ID must be an IPv4 address");
      if (["ospf_priority", "ospf_process"].includes(type) && (!/^\d+$/.test(value) || +value < (type === "ospf_process" ? 1 : 0) || +value > (type === "ospf_process" ? 65535 : 255))) fail("OSPF priority must be 0–255; process ID must be 1–65535");
      if (type === "ospf_interface" && (!/^\d+ \d+$/.test(value) || +value.split(" ")[0] < 1 || +value.split(" ")[0] > 65535 || +value.split(" ")[1] > 4294967295)) fail("Use process ID and area, for example 30 0");
      if (type === "ospf_network" && (!cidr(value.split(" ")[0]) || !/^\d+$/.test(value.split(" ")[1] || "") || value.split(" ").length !== 2 || +value.split(" ")[1] > 4294967295)) fail("Use network/prefix and area, for example 10.0.12.0/30 0");
      if (["vlan", "access_vlan", "trunk"].includes(type) && dev.type !== "switch") fail("VLAN and trunk rules require a switch");
      if (["vlan", "access_vlan"].includes(type) && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 4094)) fail("VLAN ID must be 1–4094");
      if (["static_route", "route", "ospf_route"].includes(type) && dev.type !== "router") fail("Route checks require a router");
      if (["interface_ip", "static_route", "route", "ospf_route"].includes(type) && !cidr(value)) fail("Expected address must be IPv4/prefix");
      if (type === "static_route" && !ipv4(rule.nextHop)) fail("Enter a valid next-hop IPv4 address");
      if (type === "ping" && (!["host", "router"].includes(dev.type) || !ipv4(value))) fail("Connectivity checks require a PC or router and destination IPv4 address");
      if (type === "static_route" && rule.distance !== undefined && (!Number.isInteger(rule.distance) || rule.distance < 1 || rule.distance > 255)) fail("Administrative distance must be 1–255");
      if (type === "ping" && rule.expect && !["success", "fail"].includes(rule.expect)) fail("Select reachable or blocked");
      if (type === "config" && (!value || /[\r\n]/.test(value))) fail("Enter one exact running-configuration line");
      return { type, value, interface: iface, ...(type === "static_route" ? { nextHop: rule.nextHop, ...(rule.distance !== undefined ? { distance: rule.distance } : {}) } : {}), ...(type === "ping" ? { expect: rule.expect || "success" } : {}) };
    });
    return { id: index + 1, device: t.device, text: text(t.text, "task instructions", 5000), hint: text(t.hint || "", "solution", 8000, false), points: t.points, rules };
  });
  return { links, tasks };
}
