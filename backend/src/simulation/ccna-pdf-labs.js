// Manually authored from all 27 items in CCNA-LABS 18-8.pdf.
// No document parser, OCR, image extraction, AI service or runtime generation.
// Shared builders only remove repetition between individually specified labs.
const cli = (...lines) => ["enable", "configure terminal", ...lines.flat(), "end"].join("\n");
const rule = (type, value = "", iface) => ({ type, value: String(value), ...(iface ? { interface: iface } : {}) });
const port = n => `Ethernet0/${n}`;
const device = (name, type, interfaces, initialConfig = "", console = true, gateway = "") => ({ name, type, interfaces, initialConfig, console, gateway });
const sw = (name, count = 4, initial = "") => device(name, "switch", Object.fromEntries(Array.from({ length: count }, (_, n) => [port(n), { status: "up" }])), initial);
const router = (name, addresses, initial = "", console = true) => device(name, "router", Object.fromEntries(Object.entries(addresses).map(([name, ip]) => [name, { status: "up", ...(ip ? { ip } : {}) }])), initial, console);
const host = (name, ip, gateway = "") => device(name, "host", { eth0: { ip, status: "up" } }, "", false, gateway);
const link = (a, ap, b, bp) => ({ fromDevice: a, fromInterface: ap, toDevice: b, toInterface: bp });
const task = (lab, device, text, commands, rules) => lab.tasks.push({ id: lab.tasks.length + 1, device, text, hint: commands, rules, points: 10 });
function base(number, pages, name, devices, links, notes = "") {
  return { number, pages, reviewNotes: notes, templateId: -200 - number, definition: {
    engine: "netsim-v1", title: `CCNA ${String(number).padStart(2, "0")} — ${name}`, category: "Cisco", subcategory: "CCNA", access: "FREE", durationMinutes: 30,
    devices, links, tasks: [],
    instructions: `Complete the tasks using the device consoles. Existing addressing and configurations are the starting point; do not change unrelated settings. Save your final configurations. This is a configuration simulator, not a live Cisco IOS environment.`,
    topology: "",
  } };
}
function finish(entry, notes = "") {
  const lab = entry.definition;
  lab.authorNotes = `Source: CCNA-LABS 18-8.pdf, item ${entry.number}, pages ${entry.pages}. Manually authored.\n${entry.reviewNotes || "No source discrepancy identified for the graded tasks."}`;
  lab.topology = lab.links.map(l => `${l.fromDevice} ${l.fromInterface} — ${l.toDevice} ${l.toInterface}`).join("\n") + (notes ? `\n\n${notes}` : "");
  for (const d of lab.devices.filter(d => d.console)) task(lab, d.name, "Save the final running configuration to startup configuration.", "enable\nwrite memory", [rule("saved")]);
  return entry;
}
function vlanInit(ids, extra = []) { return cli(ids.flatMap(v => [`vlan ${v}`, "exit"]), extra); }
function addressLab(number, pages, ipv4, mask, first4, last4, ipv6, first6, last6, iface = port(0), notes = "") {
  const entry = base(number, pages, "IPv4 and IPv6 addressing", [router("R1", { [iface]: "" }), router("R2", { [iface]: "" })], [link("R1", iface, "R2", iface)], notes);
  for (const [name, address4, address6, position] of [["R1", first4, first6, "first"], ["R2", last4, last6, "last"]]) {
    task(entry.definition, name, `On ${iface}, assign the ${position} usable IPv4 host address in ${ipv4}. Keep the interface enabled.`, cli(`interface ${iface}`, `ip address ${address4} ${mask}`, "no shutdown"), [rule("interface_ip", `${address4}/${ipv4.split("/")[1]}`, iface), rule("interface_up", "", iface)]);
    task(entry.definition, name, `On ${iface}, enable IPv6 and assign the ${position} host address in ${ipv6}. For this exercise, exclude the subnet-router anycast address; IPv6 has no broadcast address.`, cli(`interface ${iface}`, "ipv6 enable", `ipv6 address ${address6}/${ipv6.split("/")[1]}`), [rule("interface_ipv6", `${address6}/${ipv6.split("/")[1]}`, iface)]);
  }
  return finish(entry, `Link prefixes: ${ipv4}; ${ipv6}.`);
}
function accessTask(lab, name, index, data, voice) {
  const iface = port(index);
  task(lab, name, `Configure ${iface} as an access port${data ? ` in data VLAN ${data}` : " (default data VLAN 1)"}${voice ? ` with voice VLAN ${voice}` : ""}.`, cli(`interface ${iface}`, "switchport mode access", ...(data ? [`switchport access vlan ${data}`] : []), ...(voice ? [`switchport voice vlan ${voice}`] : []), "no shutdown"), [rule("access_vlan", data || 1, iface), ...(voice ? [rule("voice_vlan", voice, iface)] : [])]);
}
function namedVlan(lab, name, id, label) {
  task(lab, name, `Create VLAN ${id} and name it exactly ${label}.`, cli(`vlan ${id}`, `name ${label}`), [rule("vlan_name", `${id}|${label}`)]);
}
function neighbors(lab, name, other, iface = port(0), disableCdp = false) {
  task(lab, name, `Enable LLDP neighbor discovery on ${iface} toward ${other}${disableCdp ? "; disable CDP on this interface" : ""}.`, cli("lldp run", `interface ${iface}`, "lldp transmit", "lldp receive", ...(disableCdp ? ["no cdp enable"] : [])), [rule("lldp_neighbor", other, iface), rule("lldp_transmit", "enabled", iface), rule("lldp_receive", "enabled", iface), ...(disableCdp ? [rule("cdp_enable", "disabled", iface)] : [])]);
}
function voiceLab(number, pages, vlans, assignments, disableCdp = false) {
  const entry = base(number, pages, "Data and voice VLANs with LLDP", [sw("SW1"), sw("SW2")], [link("SW1", port(0), "SW2", port(0))], "LLDP is globally disabled initially; solutions explicitly enable it. Access ports are intentionally available without attached endpoints. Voice VLAN configuration is graded; voice calls are not simulated.");
  for (const name of ["SW1", "SW2"]) {
    for (const [id, label] of vlans) namedVlan(entry.definition, name, id, label);
    for (const [index, data, voice] of assignments[name]) accessTask(entry.definition, name, index, data, voice);
    neighbors(entry.definition, name, name === "SW1" ? "SW2" : "SW1", port(0), disableCdp);
  }
  return finish(entry, "E0/1–E0/3 are end-user ports. The E0/0 inter-switch link is the LLDP discovery link. Voice VLANs configure the switch port; telephone signaling is outside this exercise.");
}
function departmentLab(number, pages, first, second, special = false) {
  const [v1, label1, address1, pc1] = first, [v2, label2, address2, pc2] = second;
  const pcPort = special ? 2 : 1, routerPort = special ? 0 : 2, interPort = special ? 1 : 0;
  const switches = [sw("SW-1", 3, vlanInit([v2], [`interface ${port(routerPort)}`, `switchport access vlan ${v1}`])), sw("SW-2", 3, vlanInit([v1], [`interface ${port(routerPort)}`, `switchport access vlan ${v2}`]))];
  const routers = special ? [router("R1", { [port(0)]: `${address1}/24`, [port(1)]: `${address2}/24` }, "", false)] : [router("R1", { [port(0)]: `${address1}/24` }, "", false), router("R2", { [port(0)]: `${address2}/24` }, "", false)];
  const entry = base(number, pages, `${label1} and ${label2} access networks`, [...routers, ...switches, host("PC1", `${pc1}/24`, address1), host("PC2", `${pc2}/24`, address2)], [link("R1", port(0), "SW-1", port(routerPort)), link(special ? "R1" : "R2", special ? port(1) : port(0), "SW-2", port(routerPort)), link("SW-1", port(interPort), "SW-2", port(interPort)), link("SW-1", port(pcPort), "PC1", "eth0"), link("SW-2", port(pcPort), "PC2", "eth0")], "The source omits host masks; this authored lab uses /24. Router uplinks are preconfigured access segments; tagged router subinterfaces are not student tasks in this lab. LLDP is enabled on the actual inter-switch ports, not the router-facing ports incorrectly used in some source answers.");
  for (const [name, id, label] of [["SW-1", v1, label1], ["SW-2", v2, label2]]) {
    namedVlan(entry.definition, name, id, label); accessTask(entry.definition, name, pcPort, id);
    neighbors(entry.definition, name, name === "SW-1" ? "SW-2" : "SW-1", port(interPort));
  }
  if (special) task(entry.definition, "SW-1", "Disable LLDP transmission and reception on the port connected to PC1.", cli(`interface ${port(pcPort)}`, "no lldp transmit", "no lldp receive"), [rule("lldp_transmit", "disabled", port(pcPort)), rule("lldp_receive", "disabled", port(pcPort))]);
  return finish(entry, `PC1: ${pc1}/24, gateway ${address1}, VLAN ${v1}.\nPC2: ${pc2}/24, gateway ${address2}, VLAN ${v2}.\nRouter uplinks are already configured; complete the access-port and neighbor-discovery tasks.`);
}
function bundleTask(lab, name, group, mode, allowed, native = 1) {
  task(lab, name, `Configure E0/0 and E0/1 as 802.1Q trunks. Permit ${allowed === "all" ? "all VLANs" : `only VLANs ${allowed}`}${native !== 1 ? `; use native VLAN ${native}` : ""}.`, cli("interface range e0/0-1", "switchport trunk encapsulation dot1q", "switchport mode trunk", `switchport trunk allowed vlan ${allowed}`, `switchport trunk native vlan ${native}`, "no shutdown"), [0, 1].flatMap(i => [rule("trunk", "", port(i)), rule("allowed_vlans", allowed, port(i)), rule("native_vlan", native, port(i))]));
  task(lab, name, `Bundle E0/0 and E0/1 into LACP Port-channel ${group}, using ${mode} mode. Preserve the trunk settings.`, cli("interface range e0/0-1", `channel-group ${group} mode ${mode}`), [0, 1].map(i => rule("channel_group", `${group} ${mode}`, port(i))));
}
function bundleLab(number, pages, group, allowed, modes, native = 1, twoPcs = false) {
  const data = native === 99 ? 110 : 10;
  const ids = [...new Set([1, data, 30, native, ...allowed.split(",").map(Number).filter(Number.isFinite)])];
  const switches = ["SW1", "SW2"].map(name => sw(name, 4, vlanInit(ids, [`interface e0/2`, `switchport access vlan ${data}`, "interface e0/3", "switchport access vlan 30"])));
  const devices = [...switches, host("PC1", "10.2.2.10/24"), host("PC2", "10.2.2.20/24"), ...(twoPcs ? [] : [host("PC3", "10.3.3.10/24"), host("PC4", "10.3.3.20/24")])];
  const links = [link("SW1", port(0), "SW2", port(0)), link("SW1", port(1), "SW2", port(1)), link("SW1", port(2), "PC1", "eth0"), link("SW2", port(2), "PC2", "eth0"), ...(twoPcs ? [] : [link("SW1", port(3), "PC3", "eth0"), link("SW2", port(3), "PC4", "eth0")])];
  const entry = base(number, pages, `LACP Port-channel ${group}${native === 99 ? " and native VLAN 99" : ""}`, devices, links, number === 17 ? "The question requires VLANs 99 and 110; the source answer omits 99. The authored solution and grader require both." : "VLANs and end-user ports are preconfigured. Host masks omitted in the source use /24.");
  ["SW1", "SW2"].forEach((name, i) => bundleTask(entry.definition, name, group, modes[i], allowed, native));
  return finish(entry, `PC1 and PC2: VLAN ${data}, 10.2.2.0/24.${twoPcs ? "" : " PC3 and PC4: VLAN 30, 10.3.3.0/24."}\nBoth parallel switch links must join the channel. LACP active initiates negotiation; passive responds.`);
}
function ospfLab(number, pages, pid, large = false, onR1 = false) {
  const a = large ? "122" : "12", b = large ? "133" : "13", c = large ? "223" : "23";
  const loops = large ? ["10.11.11.11", "10.22.22.22", "10.33.33.33"] : ["10.1.1.1", "10.2.2.2", "10.3.3.3"];
  const target = onR1 ? "R1" : "R2";
  const rid = onR1 ? `10.0.${a}.1` : number === 2 ? "10.22.22.22" : loops[1];
  const devices = [router("R1", { [port(0)]: `10.0.${a}.1/30`, [port(1)]: `10.0.${b}.1/29`, Loopback0: `${loops[0]}/32` }), router("R2", { [port(0)]: `10.0.${a}.2/30`, [port(1)]: `10.0.${c}.2/28`, Loopback0: `${loops[1]}/32` }), router("R3", { [port(0)]: `10.0.${b}.3/29`, [port(1)]: `10.0.${c}.3/28`, Loopback0: `${loops[2]}/32` })];
  devices.forEach((d, i) => { if (d.name !== target) { d.console = false; d.initialConfig = cli(`router ospf ${pid}`, `router-id ${loops[i]}`, "network 10.0.0.0 0.255.255.255 area 0"); } });
  const entry = base(number, pages, `${target} OSPF process ${pid} and DR election`, devices, [link("R1", port(0), "R2", port(0)), link("R1", port(1), "R3", port(0)), link("R2", port(1), "R3", port(1))], "Transit host addresses are authored because the diagram provides only subnets. Peer routers are preconfigured. Roles are recalculated deterministically from priority and router ID; real OSPF non-preemption and election timers are not modeled. Priority 255 makes the target preferred in this topology, not universally guaranteed DR in every network.");
  const lab = entry.definition;
  task(lab, target, `Configure OSPF process ${pid} with router ID ${rid}${onR1 ? " (the E0/0 address)" : number !== 2 ? " (the Loopback0 address)" : ""}.`, cli(`router ospf ${pid}`, `router-id ${rid}`), [rule("ospf_process", pid), rule("ospf_router_id", rid)]);
  if (onR1) task(lab, target, `Enable OSPF process ${pid}, area 0 directly on E0/0 and E0/1, not with network statements.`, cli("interface range e0/0-1", `ip ospf ${pid} area 0`), [0, 1].map(i => rule("ospf_interface", `${pid} 0`, port(i))));
  else task(lab, target, `Under the OSPF process, advertise the exact prefixes 10.0.${a}.0/30 and 10.0.${c}.0/28 in area 0.`, cli(`router ospf ${pid}`, `network 10.0.${a}.0 0.0.0.3 area 0`, `network 10.0.${c}.0 0.0.0.15 area 0`), [rule("ospf_network", `10.0.${a}.0/30 0`), rule("ospf_network", `10.0.${c}.0/28 0`)]);
  task(lab, target, `Form adjacencies with ${onR1 ? "R2 and R3" : "R1 and R3"}. Set priority 255 on both Ethernet interfaces so ${target} is preferred as DR on both links.`, cli("interface range e0/0-1", "ip ospf priority 255"), [rule("ospf_neighbor", onR1 ? "R2" : "R1"), rule("ospf_neighbor", "R3"), ...[0, 1].flatMap(i => [rule("ospf_priority", 255, port(i)), rule("ospf_dr", "", port(i))])]);
  return finish(entry, devices.map(d => `${d.name}: ${Object.entries(d.interfaces).map(([name, info]) => `${name} ${info.ip}`).join(", ")}`).join("\n") + "\nAll OSPF links use area 0. Peer configurations are provided.");
}
function firstTrunkLab() {
  const entry = base(1, "1–4", "Trunk restrictions and LACP Port-channel 34", [router("R1", { [port(0)]: "" }, "", false), ...[1, 2, 3, 4].map(n => sw(`SW-${n}`, 3, vlanInit([5, 6, 77], ["interface range e0/0-2", "switchport mode trunk"])))], [link("R1", port(0), "SW-1", port(0)), link("SW-1", port(1), "SW-2", port(1)), link("SW-1", port(2), "SW-3", port(2)), link("SW-2", port(2), "SW-4", port(2)), link("SW-3", port(0), "SW-4", port(0)), link("SW-3", port(1), "SW-4", port(1))]);
  const lab = entry.definition;
  task(lab, "SW-1", "On E0/0 permit only VLANs 5 and 6.", cli("interface e0/0", "switchport trunk allowed vlan 5,6"), [rule("allowed_vlans", "5,6", port(0))]);
  for (const name of ["SW-1", "SW-2"]) task(lab, name, "Use native VLAN 77 on E0/1.", cli("interface e0/1", "switchport trunk native vlan 77"), [rule("native_vlan", 77, port(1))]);
  task(lab, "SW-2", "On E0/2 permit only VLAN 6.", cli("interface e0/2", "switchport trunk allowed vlan 6"), [rule("allowed_vlans", "6", port(2))]);
  for (const [name, mode] of [["SW-3", "active"], ["SW-4", "passive"]]) task(lab, name, `Create LACP Port-channel 34 with E0/0 and E0/1, preserving their trunks. Only SW-3 initiates negotiation (${name}: ${mode}).`, cli("interface range e0/0-1", `channel-group 34 mode ${mode}`), [0, 1].flatMap(i => [rule("channel_group", `34 ${mode}`, port(i)), rule("trunk", "", port(i))]));
  return finish(entry, "All shown switch ports are initially 802.1Q trunks. VLANs 5, 6 and 77 already exist.");
}
function squareTrunkLab() {
  const entry = base(8, "18–19", "Restricted trunks and Port-channel 12", [1, 2, 3, 4].map(n => sw(`SW-${n}`, 3, vlanInit([12, 22], n >= 3 ? ["interface range e0/1-2", "switchport mode trunk"] : n === 2 ? ["interface e0/2", "switchport mode trunk"] : []))), [link("SW-1", port(0), "SW-2", port(0)), link("SW-1", port(1), "SW-2", port(1)), link("SW-1", port(2), "SW-3", port(2)), link("SW-2", port(2), "SW-4", port(2)), link("SW-3", port(1), "SW-4", port(1))], "The source solution omits switchport mode trunk on SW-1 E0/2; this lab requires and configures it.");
  entry.definition.devices.filter(d => ["SW-3", "SW-4"].includes(d.name)).forEach(d => { d.console = false; });
  for (const name of ["SW-1", "SW-2"]) bundleTask(entry.definition, name, 12, "active", "1,12,22");
  task(entry.definition, "SW-1", "Configure E0/2 as an 802.1Q trunk permitting only VLANs 12 and 22.", cli("interface e0/2", "switchport mode trunk", "switchport trunk allowed vlan 12,22"), [rule("allowed_vlans", "12,22", port(2))]);
  return finish(entry);
}
function triangleTrunkLab() {
  const entry = base(22, "49–50", "Native VLAN 35 and active/passive LACP", [1, 2, 3].map(n => sw(`SW-${n}`, 3, vlanInit([35]))), [link("SW-1", port(0), "SW-2", port(0)), link("SW-1", port(1), "SW-2", port(1)), link("SW-1", port(2), "SW-3", port(0)), link("SW-2", port(2), "SW-3", port(1))]);
  bundleTask(entry.definition, "SW-1", 12, "active", "all"); bundleTask(entry.definition, "SW-2", 12, "passive", "all");
  for (const [name, ports] of [["SW-1", [2]], ["SW-2", [2]], ["SW-3", [0, 1]]]) task(entry.definition, name, `Configure ${ports.map(port).join(" and ")} as trunks with native VLAN 35.`, cli(ports.flatMap(i => [`interface ${port(i)}`, "switchport mode trunk", "switchport trunk native vlan 35"])), ports.map(i => rule("native_vlan", 35, port(i))));
  return finish(entry);
}
function phoneLab() {
  const entry = base(11, "24–26", "Voice/data access and discovery controls", [router("R1", { [port(0)]: "10.10.1.1/24" }, "", false), sw("SW-1", 3, vlanInit([11, 30], ["interface e0/0", "switchport mode trunk", "interface e0/2", "switchport mode trunk"])), sw("SW-2", 2, vlanInit([10, 11, 30], ["interface e0/0", "switchport mode trunk"])), host("PC1", "10.10.1.10/24"), host("PC2", "192.168.30.10/24")], [link("R1", port(0), "SW-1", port(2)), link("SW-1", port(0), "SW-2", port(0)), link("SW-1", port(1), "PC1", "eth0"), link("SW-2", port(1), "PC2", "eth0")], "The IP phone is represented by the PC data pass-through connection, not a phone emulator. Voice VLAN 11 is configured and graded on SW-1 E0/1. VoIP signaling and the preconfigured router-on-a-stick are outside the graded tasks.");
  namedVlan(entry.definition, "SW-1", 10, "Engineering"); accessTask(entry.definition, "SW-1", 1, 10, 11); accessTask(entry.definition, "SW-2", 1, 30);
  neighbors(entry.definition, "SW-1", "SW-2"); neighbors(entry.definition, "SW-2", "SW-1");
  task(entry.definition, "SW-1", "Disable CDP on E0/2, the link toward R1.", cli("interface e0/2", "no cdp enable"), [rule("cdp_enable", "disabled", port(2))]);
  return finish(entry, "SW-1 E0/1 represents the phone's data pass-through to PC1: data VLAN 10 and voice VLAN 11 (phone 10.11.1.10/24). Phone signaling is not simulated. PC2 uses data VLAN 30. R1 is a fixed upstream device; its subinterfaces are not part of this exercise.");
}
function staticLab(number, pages, floating = false) {
  const edge = floating ? "SJC" : "DC", branch = floating ? "SQL" : "Branch", hq = floating ? "OAK" : "HQ";
  const edgeIsp = floating ? "209.165.201.1" : "209.165.201.2", isp = floating ? "209.165.201.2" : "209.165.201.1";
  const pc = floating ? "10.10.44.2" : "10.0.44.2", pcNet = floating ? "10.10.44.0" : "10.0.44.0";
  const eh = floating ? "10.10.34" : "10.0.23", eb = floating ? "10.10.24" : "10.0.22", bh = floating ? "10.10.54" : "10.0.24";
  const ebEdge = floating ? 1 : 2, ebBranch = floating ? 2 : 1;
  const devices = [router("ISP", { [port(0)]: `${isp}/27`, [port(1)]: "209.165.202.130/27" }, cli(`ip route 10.0.0.0 255.0.0.0 ${edgeIsp}`), false), router(edge, { [port(0)]: `${edgeIsp}/27`, [port(1)]: `${eh}.1/30`, [port(2)]: `${eb}.${ebEdge}/30` }, cli(`ip route ${pcNet} 255.255.255.0 ${eh}.2`)), router(hq, { [port(0)]: `${eh}.2/30`, [port(1)]: `${bh}.2/30`, [port(2)]: `${pcNet.replace(/\.0$/, ".1")}/24`, ...(floating ? { [port(3)]: "10.10.10.2/30" } : {}) }, cli(`ip route 0.0.0.0 0.0.0.0 ${eh}.1`), false), router(branch, { [port(0)]: `${eb}.${ebBranch}/30`, [port(1)]: `${bh}.1/30`, ...(floating ? { [port(2)]: "10.10.10.1/30" } : {}) }, floating ? cli(`ip route 0.0.0.0 0.0.0.0 ${eb}.${ebEdge}`) : ""), host("PC", `${pc}/24`, pcNet.replace(/\.0$/, ".1")), host("WebServer", "209.165.202.129/27", "209.165.202.130")];
  const entry = base(number, pages, floating ? "Default, host and floating static routes" : "Branch and internet static routing", devices, [link("ISP", port(0), edge, port(0)), link("ISP", port(1), "WebServer", "eth0"), link(edge, port(1), hq, port(0)), link(edge, port(2), branch, port(0)), link(branch, port(1), hq, port(1)), link(hq, port(2), "PC", "eth0"), ...(floating ? [link(branch, port(2), hq, port(3))] : [])], floating ? "The source server 209.165.202.129/27 cannot use gateway 209.165.202.1/27. This lab corrects the ISP server-facing interface and server gateway to 209.165.202.130/27. Unspecified baseline/return routes are supplied. Floating-route distance is graded, not silently ignored." : "Items 26 and 27 repeat the same scenario and are retained separately. Unspecified host masks and return routes are supplied. The server-facing ISP interface is authored as 209.165.202.130/27.");
  task(entry.definition, edge, `Configure an IPv4 default route through ISP (${isp}). Verify reachability to the WebServer, 209.165.202.129.`, cli(`ip route 0.0.0.0 0.0.0.0 ${isp}`), [{ type: "static_route", value: "0.0.0.0/0", nextHop: isp, distance: 1 }, rule("ping", "209.165.202.129")]);
  task(entry.definition, branch, floating ? `Configure a host route to PC ${pc} through ${bh}.2 using the primary 10.10.54.0/30 link.` : `Configure a route to the PC LAN ${pcNet}/24 through HQ (${bh}.2).`, cli(`ip route ${floating ? pc : pcNet} ${floating ? "255.255.255.255" : "255.255.255.0"} ${bh}.2`), [{ type: "static_route", value: `${floating ? pc : pcNet}/${floating ? 32 : 24}`, nextHop: `${bh}.2`, distance: 1 }]);
  task(entry.definition, branch, floating ? `Configure a floating host route to ${pc} through 10.10.10.2, with administrative distance 10, for loss of the primary link.` : `Configure a default route to the internet using the shortest path, directly through DC (${eb}.${ebEdge}).`, cli(floating ? `ip route ${pc} 255.255.255.255 10.10.10.2 10` : `ip route 0.0.0.0 0.0.0.0 ${eb}.${ebEdge}`), [{ type: "static_route", value: floating ? `${pc}/32` : "0.0.0.0/0", nextHop: floating ? "10.10.10.2" : `${eb}.${ebEdge}`, distance: floating ? 10 : 1 }]);
  return finish(entry, devices.map(d => `${d.name}: ${Object.entries(d.interfaces).map(([n, p]) => `${n} ${p.ip}`).join(", ")}`).join("\n") + "\nAll links and return routes are preconfigured. WebServer gateway: 209.165.202.130.");
}

export const CCNA_PDF_LABS = [
  firstTrunkLab(),
  ospfLab(2, "5–6", 30),
  voiceLab(3, "7–9", [[77, "IT_User_VLAN"], [88, "HR_User_VLAN"], [177, "IT_Voice_VLAN"], [188, "HR_Voice_VLAN"]], { SW1: [[1, 77, 177], [2, 77], [3, 88, 188]], SW2: [[3, 77], [1, 88, 188], [2, 1, 177]] }),
  addressLab(4, "10–11", "10.12.18.24/29", "255.255.255.248", "10.12.18.25", "10.12.18.30", "2001:db8:12::c/126", "2001:db8:12::d", "2001:db8:12::f", port(1), "Diagram E0/1 takes precedence over the source answer's E0/0."),
  addressLab(5, "12–13", "10.10.24.0/28", "255.255.255.240", "10.10.24.1", "10.10.24.14", "2001:db8:18::/125", "2001:db8:18::1", "2001:db8:18::7"),
  departmentLab(6, "14–15", [15, "OPS", "172.16.15.1", "172.16.15.10"], [66, "ENGINEERING", "192.168.66.1", "192.168.66.50"]),
  bundleLab(7, "16–17", 10, "10,30", ["active", "active"]),
  squareTrunkLab(),
  departmentLab(9, "20–21", [35, "SALES", "10.35.1.1", "10.35.1.99"], [39, "MARKETING", "10.39.1.1", "10.39.1.99"], true),
  addressLab(10, "22–23", "172.16.16.32/29", "255.255.255.248", "172.16.16.33", "172.16.16.38", "2001:db8:12::34/126", "2001:db8:12::35", "2001:db8:12::37", port(1), "Diagram E0/1 takes precedence over the source answer's E0/0."),
  phoneLab(),
  voiceLab(12, "27–28", [[77, "User_VLAN"], [177, "Voice_VLAN"]], { SW1: [[1, 77, 177], [2, 77, 177], [3, 77, 177]], SW2: [[1, 77, 177], [2, 77, 177], [3, 77, 177]] }),
  addressLab(13, "29–30", "10.0.12.4/30", "255.255.255.252", "10.0.12.5", "10.0.12.6", "2001:db8:12::/126", "2001:db8:12::1", "2001:db8:12::3"),
  addressLab(14, "31–32", "10.0.12.0/27", "255.255.255.224", "10.0.12.1", "10.0.12.30", "2001:db8:12::/122", "2001:db8:12::1", "2001:db8:12::3f", port(0), "Corrected source answer ::1f to ::3f: a /122 has six host bits and ends in hexadecimal 3f."),
  ospfLab(15, "33–35", 122, true),
  ospfLab(16, "36–38", 30, false, true),
  bundleLab(17, "39–40", 20, "99,110", ["active", "active"], 99, true),
  voiceLab(18, "41–42", [[100, "Engineering"], [102, "Engineering_Voice"]], { SW1: [[1, 100, 102], [2, 100, 102], [3, 100, 102]], SW2: [[1, 100, 102], [2, 100, 102], [3, 100, 102]] }, true),
  bundleLab(19, "43–44", 10, "10,11,30", ["active", "passive"]),
  voiceLab(20, "45–46", [[201, "Sales"], [202, "Sales_Voice"]], { SW1: [[1, 201, 202], [2, 201, 202], [3, 201, 202]], SW2: [[1, 201, 202], [2, 201, 202], [3, 201, 202]] }),
  addressLab(21, "47–48", "192.168.18.16/30", "255.255.255.252", "192.168.18.17", "192.168.18.18", "2001:db8:12::10/126", "2001:db8:12::11", "2001:db8:12::13"),
  triangleTrunkLab(),
  departmentLab(23, "51–53", [15, "OPS", "172.16.15.1", "172.16.15.10"], [66, "ENGINEERING", "192.168.66.1", "192.168.66.50"]),
  staticLab(24, "54–58", true),
  ospfLab(25, "59–60", 10),
  staticLab(26, "61–62"),
  staticLab(27, "63–64"),
];
