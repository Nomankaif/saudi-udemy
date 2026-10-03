// iosShow.js — All show command implementations

import { normalizeInterface } from "./iosHelpers.js";
import { buildRunningConfig } from "./iosConfig.js";

// ─── INTERFACE STATE HELPERS ─────────────────────────────────────────────────
export function getPortInfo(iface, cmds) {
  const info = { mode: "access", accessVlan: "1", voiceVlan: null, nativeVlan: "1", allowedVlans: "ALL",
    encap: "negotiate", trunk: false, nonegotiate: false, portfast: false, bpduguard: false,
    channelGroup: null, channelMode: null, cdp: null, lldpTx: null, lldpRx: null };
  for (const c of cmds) {
    if (c.startsWith("switchport mode ")) info.mode = c.replace("switchport mode ", "");
    if (c.startsWith("switchport access vlan ")) info.accessVlan = c.replace("switchport access vlan ", "");
    if (c.startsWith("switchport voice vlan ")) info.voiceVlan = c.replace("switchport voice vlan ", "");
    if (c.startsWith("switchport trunk native vlan ")) info.nativeVlan = c.replace("switchport trunk native vlan ", "");
    if (c.startsWith("switchport trunk allowed vlan ")) info.allowedVlans = c.replace("switchport trunk allowed vlan ", "");
    if (c.startsWith("switchport trunk encapsulation ")) info.encap = c.replace("switchport trunk encapsulation ", "");
    if (c === "switchport nonegotiate") info.nonegotiate = true;
    if (c === "spanning-tree portfast") info.portfast = true;
    if (c === "spanning-tree bpduguard enable") info.bpduguard = true;
    if (c.startsWith("channel-group ")) {
      const m = c.match(/channel-group\s+(\d+)\s+mode\s+(\S+)/);
      if (m) { info.channelGroup = m[1]; info.channelMode = m[2]; }
    }
    if (c === "no cdp enable") info.cdp = false;
    if (c === "cdp enable") info.cdp = true;
    if (c === "lldp transmit") info.lldpTx = true;
    if (c === "no lldp transmit") info.lldpTx = false;
    if (c === "lldp receive") info.lldpRx = true;
    if (c === "no lldp receive") info.lldpRx = false;
  }
  info.trunk = info.mode === "trunk";
  return info;
}

// ─── IOS ABBREVIATION EXPANSION ──────────────────────────────────────────────
// Expands abbreviated show commands to their canonical forms
// e.g. "r" → "running-config", "ip int br" → "ip interface brief"
function expandShowAbbr(input) {
  const words = input.trim().split(/\s+/);
  if (words.length === 0 || words[0] === "") return input;

  // Top-level show subcommands
  const topCmds = [
    "access-lists", "arp", "cdp", "clock", "dhcp", "etherchannel",
    "flash", "history", "interfaces", "inventory", "ip", "ipv6",
    "lldp", "logging", "mac", "ntp", "port-security", "running-config",
    "spanning-tree", "startup-config", "users", "version", "vlan",
  ];

  // IP sub-subcommands
  const ipCmds = [
    "access-lists", "arp", "dhcp", "interface", "nat", "ospf",
    "protocols", "route", "ssh",
  ];

  // Match first word — prefer exact match
  const w0 = words[0].toLowerCase();
  const exact0 = topCmds.find(c => c === w0);
  if (exact0) {
    words[0] = exact0;
  } else {
    const match0 = topCmds.filter(c => c.startsWith(w0));
    if (match0.length === 1) {
      words[0] = match0[0];
    } else if (match0.length > 1) {
      return null;
    }
  }

  // If first word is "ip" or "ipv6" and there are more words, expand sub-sub
  if ((words[0] === "ip" || words[0] === "ipv6") && words.length > 1) {
    const w1 = words[1].toLowerCase();
    const cmds = words[0] === "ip" ? ipCmds : ["interface", "ospf", "route"];
    const exact1 = cmds.find(c => c === w1);
    if (exact1) {
      words[1] = exact1;
    } else {
      const match1 = cmds.filter(c => c.startsWith(w1));
      if (match1.length === 1) words[1] = match1[0];
    }

    // Third-level: "ip interface brief", "ip ospf neighbor/interface"
    if (words.length > 2) {
      const w2 = words[2].toLowerCase();
      if (words[1] === "interface") {
        const opts = ["brief", "summary"];
        const m = opts.filter(c => c.startsWith(w2));
        if (m.length === 1) words[2] = m[0];
      } else if (words[1] === "ospf") {
        const opts = ["neighbor", "interface", "database"];
        const m = opts.filter(c => c.startsWith(w2));
        if (m.length === 1) words[2] = m[0];
      } else if (words[1] === "dhcp") {
        const opts = ["snooping", "pool", "binding"];
        const m = opts.filter(c => c.startsWith(w2));
        if (m.length === 1) words[2] = m[0];
      } else if (words[1] === "arp") {
        const opts = ["inspection"];
        const m = opts.filter(c => c.startsWith(w2));
        if (m.length === 1) words[2] = m[0];
      }
    }
  }

  // "interfaces" sub: trunk/switchport/status + specific interface name
  if (words[0] === "interfaces" && words.length > 1) {
    const w1 = words[1].toLowerCase();
    const opts = ["trunk", "switchport", "status"];
    const m = opts.filter(c => c.startsWith(w1));
    if (m.length === 1) words[1] = m[0];
  }

  return words.join(" ");
}

export function processShow(parts, state) {
  const rawSub = parts.slice(1).join(" ");

  // ─── IOS-style abbreviation expansion ───
  // In real IOS, "sh r" → "show running-config", "sh ip int br" → "show ip interface brief"
  const expanded = expandShowAbbr(rawSub);
  // Ambiguous check
  if (expanded === null) {
    return { output: `% Ambiguous command:  "show ${rawSub}"`, state };
  }
  const sub = expanded;

  // show running-config (hierarchical)
  if (sub.startsWith("run")) {
    return { output: buildRunningConfig(state), state };
  }
  // show startup-config
  if (sub.startsWith("startup")) {
    if (!state._startupSaved) {
      return { output: "startup-config is not present", state };
    }
    // Build config from saved startup data
    const fakeState = { ...state, ...state._startupConfig };
    return { output: "! Last configuration saved\n" + buildRunningConfig(fakeState), state };
  }

  // ─── show interfaces trunk ───
  if (sub.startsWith("int") && sub.includes("trunk")) {
    const trunkPorts = [];
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (pi.trunk) trunkPorts.push({ iface, ...pi });
    });
    if (trunkPorts.length === 0) return { output: "% No trunk ports configured", state };
    const lines = [
      "Port        Mode         Encapsulation  Status        Native vlan",
      "----------- ------------ -------------- ------------- -----------",
    ];
    trunkPorts.forEach(p => {
      const enc = p.encap === "dot1q" ? "802.1q" : p.encap;
      lines.push(`${p.iface.padEnd(12)}${"on".padEnd(13)}${enc.padEnd(15)}${"trunking".padEnd(14)}${p.nativeVlan}`);
    });
    lines.push("", "Port        Vlans allowed on trunk", "----------- --------------------------------------");
    trunkPorts.forEach(p => lines.push(`${p.iface.padEnd(12)}${p.allowedVlans}`));
    lines.push("", "Port        Vlans allowed and active in management domain", "----------- --------------------------------------");
    trunkPorts.forEach(p => lines.push(`${p.iface.padEnd(12)}${p.allowedVlans}`));
    return { output: lines.join("\n"), state };
  }

  // ─── show interfaces switchport ───
  if (sub.startsWith("int") && sub.includes("switchport")) {
    const lines = [];
    const target = sub.match(/switchport\s+(\S+)/);
    const ifaces = target ? [[normalizeInterface(target[1]), state.interfaceCfg[normalizeInterface(target[1])] || []]] : Object.entries(state.interfaceCfg);
    ifaces.forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      lines.push(`Name: ${iface}`);
      lines.push(`Switchport: Enabled`);
      lines.push(`Administrative Mode: ${pi.mode === "trunk" ? "trunk" : pi.mode === "access" ? "static access" : "dynamic auto"}`);
      lines.push(`Operational Mode: ${pi.trunk ? "trunk" : "static access"}`);
      lines.push(`Administrative Trunking Encapsulation: ${pi.encap === "dot1q" ? "dot1q" : "negotiate"}`);
      lines.push(`Negotiation of Trunking: ${pi.nonegotiate ? "Off" : "On"}`);
      lines.push(`Access Mode VLAN: ${pi.accessVlan} (${state.vlans[pi.accessVlan] || "VLAN" + pi.accessVlan})`);
      lines.push(`Trunking Native Mode VLAN: ${pi.nativeVlan} (${state.vlans[pi.nativeVlan] || "default"})`);
      if (pi.voiceVlan) lines.push(`Voice VLAN: ${pi.voiceVlan} (${state.vlans[pi.voiceVlan] || "VLAN" + pi.voiceVlan})`);
      lines.push(`Trunking VLANs Allowed: ${pi.allowedVlans}`);
      lines.push(`Pruning VLANs Enabled: 2-1001`);
      lines.push(`Protected: false`);
      lines.push("");
    });
    return { output: lines.join("\n") || "% No switchport interfaces configured", state };
  }

  // ─── show interfaces status ───
  if (sub.startsWith("int") && sub.includes("status")) {
    const lines = [
      "Port      Name               Status       Vlan       Duplex  Speed Type",
      "--------- ------------------ ------------ ---------- ------- ----- ----",
    ];
    Object.entries(state.interfaces).forEach(([iface, info]) => {
      const cmds = state.interfaceCfg[iface] || [];
      const pi = getPortInfo(iface, cmds);
      const status = info.status === "up" ? "connected" : "notconnect";
      const vlanCol = pi.trunk ? "trunk" : pi.accessVlan;
      lines.push(`${iface.padEnd(10)}${"".padEnd(19)}${status.padEnd(13)}${vlanCol.padEnd(11)}${"a-full".padEnd(8)}${"auto".padEnd(6)}10/100/1000BaseTX`);
    });
    return { output: lines.join("\n"), state };
  }

  // ─── show interfaces (detail or specific) ───
  if (sub.startsWith("int") && !sub.startsWith("ip")) {
    const lines = [];
    // Check if specific interface requested
    const ifMatch = sub.match(/^interfaces?\s+(\S+\s*\S*)$/i);
    const targetIfaces = ifMatch
      ? [[normalizeInterface(ifMatch[1].trim()), state.interfaces[normalizeInterface(ifMatch[1].trim())]]]
      : Object.entries(state.interfaces);
    targetIfaces.forEach(([name, info]) => {
      if (!info) { lines.push(`% Invalid input detected at '^' marker.`); return; }
      lines.push(`${name} is ${info.status}, line protocol is ${info.status === "up" ? "up" : "down"}`);
      if (info.ip) lines.push(`  Internet address is ${info.ip}`);
      if (info.ipv6) lines.push(`  IPv6 address is ${info.ipv6}`);
      lines.push(`  MTU 1500 bytes, BW 10000 Kbit/sec, DLY 1000 usec`);
      lines.push(`     reliability 255/255, txload 1/255, rxload 1/255`);
      lines.push(`  Encapsulation ARPA, loopback not set`);
      const cmds = state.interfaceCfg[name] || [];
      const pi = getPortInfo(name, cmds);
      if (pi.trunk) lines.push(`  Switchport mode: trunk, Encapsulation: ${pi.encap}`);
      lines.push(`  Last input 00:00:01, output 00:00:01, output hang never`);
      lines.push(`     0 packets input, 0 bytes, 0 no buffer`);
      lines.push(`     0 input errors, 0 CRC, 0 frame, 0 overrun, 0 ignored`);
      lines.push(`     0 packets output, 0 bytes, 0 underruns`);
      lines.push(`     0 output errors, 0 collisions, 0 interface resets`);
    });
    return { output: lines.join("\n"), state };
  }

  // show ip interface brief
  if (sub.startsWith("ip int") || sub.startsWith("ip interface")) {
    const lines = [
      "Interface                  IP-Address      OK? Method Status                Protocol",
    ];
    Object.entries(state.interfaces).forEach(([name, info]) => {
      const ip = info.ip && info.ip !== "dhcp" ? info.ip.split("/")[0] : (info.ip === "dhcp" ? "DHCP" : "unassigned");
      lines.push(`${name.padEnd(27)}${ip.padEnd(16)}YES manual ${info.status.padEnd(22)}${info.status === "up" ? "up" : "down"}`);
    });
    return { output: lines.join("\n"), state };
  }

  // ─── show vlan brief (with port assignment) ───
  if (sub.startsWith("vlan")) {
    const lines = [
      "VLAN Name                             Status    Ports",
      "---- -------------------------------- --------- -------------------------------",
    ];
    // Build vlan→port mapping
    const vlanPorts = {};
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (!pi.trunk) {
        const vid = pi.accessVlan || "1";
        if (!vlanPorts[vid]) vlanPorts[vid] = [];
        vlanPorts[vid].push(iface);
      }
    });
    // Also add interfaces not in interfaceCfg (default VLAN 1)
    Object.keys(state.interfaces).forEach(iface => {
      if (!state.interfaceCfg[iface] || state.interfaceCfg[iface].length === 0) {
        if (!vlanPorts["1"]) vlanPorts["1"] = [];
        if (!vlanPorts["1"].includes(iface)) vlanPorts["1"].push(iface);
      }
    });
    Object.entries(state.vlans).forEach(([id, name]) => {
      const vname = name || ("VLAN" + id);
      const ports = (vlanPorts[id] || []).join(", ");
      lines.push(`${id.toString().padEnd(5)}${vname.padEnd(33)}active    ${ports}`);
    });
    return { output: lines.join("\n"), state };
  }

  // show ip route
  if (sub.startsWith("ip route") || sub.startsWith("ip ro")) {
    const lines = [
      "Codes: L - local, C - connected, S - static, R - RIP, O - OSPF,",
      "       B - BGP, * - candidate default, E - EIGRP",
      "",
      "Gateway of last resort is not set",
      "",
    ];
    // Connected routes
    Object.entries(state.interfaces).forEach(([name, info]) => {
      if (info.ip && info.ip !== "dhcp" && info.status === "up") {
        const ip = info.ip.split("/")[0];
        const cidr = info.ip.split("/")[1] || "24";
        lines.push(`C    ${ip}/${cidr} is directly connected, ${name}`);
        lines.push(`L    ${ip}/32 is directly connected, ${name}`);
      }
    });
    // Default route check
    const hasDefault = state.staticRoutes.some(r => r.includes("0.0.0.0 0.0.0.0"));
    if (hasDefault) lines[3] = "Gateway of last resort is set";
    // Static routes
    state.staticRoutes.forEach(r => {
      const p = r.replace(/^ip route\s+/, "");
      const isDefault = p.startsWith("0.0.0.0 0.0.0.0");
      lines.push(`S${isDefault ? "*" : " "}   ${p}`);
    });
    if (state.staticRoutes.length === 0 && Object.keys(state.interfaces).every(k => !state.interfaces[k].ip)) {
      lines.push("% No routes found");
    }
    return { output: lines.join("\n"), state };
  }

  // show ipv6 route
  if (sub.startsWith("ipv6 route") || sub.startsWith("ipv6 ro")) {
    const lines = ["IPv6 Routing Table - 0 entries", "Codes: C - Connected, L - Local, S - Static, O - OSPF", ""];
    (state.staticRoutesV6 || []).forEach(r => {
      lines.push(`S    ${r.replace(/^ipv6 route\s+/, "")}`);
    });
    lines[0] = `IPv6 Routing Table - ${(state.staticRoutesV6 || []).length} entries`;
    return { output: lines.join("\n"), state };
  }

  // show ip ospf neighbor
  if (sub.startsWith("ip ospf") && sub.includes("neigh")) {
    const ospfProc = Object.keys(state.routerCfg).find(k => k.startsWith("ospf"));
    if (!ospfProc) return { output: "% OSPF is not configured", state };
    const procCfg = state.routerCfg[ospfProc] || [];
    const rid = procCfg.find(c => c.startsWith("router-id"));
    const lines = [
      "",
      "Neighbor ID     Pri   State           Dead Time   Address         Interface",
    ];
    // Simulated neighbors from configured OSPF interfaces
    const ospfIfs = [];
    // Collect ip ospf commands from interface config
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      if (cmds.some(c => c.startsWith("ip ospf"))) {
        const ifInfo = state.interfaces[iface];
        if (ifInfo?.ip && ifInfo.ip !== "dhcp") {
          ospfIfs.push({ iface, ip: ifInfo.ip.split("/")[0] });
        }
      }
    });
    // Also check network statements
    const networks = procCfg.filter(c => c.startsWith("network"));
    if (ospfIfs.length === 0 && networks.length > 0) {
      Object.entries(state.interfaces).forEach(([iface, ifInfo]) => {
        if (ifInfo?.ip && ifInfo.ip !== "dhcp" && ifInfo.status === "up") {
          ospfIfs.push({ iface, ip: ifInfo.ip.split("/")[0] });
        }
      });
    }
    ospfIfs.forEach((oi, idx) => {
      const octets = oi.ip.split(".");
      const neighborId = `${octets[0]}.${octets[1]}.${octets[2]}.${parseInt(octets[3]) === 1 ? "2" : "1"}`;
      const pri = "1";
      const drState = idx === 0 ? "FULL/DR" : "FULL/BDR";
      lines.push(`${neighborId.padEnd(16)}${pri.padEnd(6)}${drState.padEnd(16)}00:00:35    ${neighborId.padEnd(16)}${oi.iface}`);
    });
    if (ospfIfs.length === 0) lines.push("% No OSPF neighbors");
    return { output: lines.join("\n"), state };
  }

  // show ip ospf interface [<name>]
  if (sub.startsWith("ip ospf") && sub.includes("int")) {
    const ospfProc = Object.keys(state.routerCfg).find(k => k.startsWith("ospf"));
    if (!ospfProc) return { output: "% OSPF is not configured", state };
    const procCfg = state.routerCfg[ospfProc] || [];
    const rid = procCfg.find(c => c.startsWith("router-id"))?.replace("router-id ", "") || "0.0.0.0";
    const pid = ospfProc.replace("ospf ", "");
    // Check for specific interface filter
    const ifFilter = sub.match(/interface\s+(\S+\s*\S*)/i);
    const targetIf = ifFilter ? normalizeInterface(ifFilter[1].trim()) : null;
    const lines = [];
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      if (targetIf && iface !== targetIf) return;
      const hasOspf = cmds.some(c => c.startsWith("ip ospf"));
      if (!hasOspf) return;
      const ifInfo = state.interfaces[iface];
      if (!ifInfo?.ip || ifInfo.ip === "dhcp") return;
      const ip = ifInfo.ip.split("/")[0];
      const cidr = ifInfo.ip.split("/")[1] || "24";
      const priorityCmd = cmds.find(c => c.startsWith("ip ospf priority"));
      const priority = priorityCmd ? priorityCmd.split(" ").pop() : "1";
      const costCmd = cmds.find(c => c.startsWith("ip ospf cost"));
      const cost = costCmd ? costCmd.split(" ").pop() : "10";
      const networkType = cmds.includes("ip ospf network point-to-point") ? "POINT_TO_POINT" : "BROADCAST";
      const passive = cmds.includes("passive-interface") ? " passive" : "";
      lines.push(`${iface} is up, line protocol is up${passive}`);
      lines.push(`  Internet Address ${ip}/${cidr}, Area 0, Attached via Interface`);
      lines.push(`  Process ID ${pid}, Router ID ${rid}, Network Type ${networkType}, Cost: ${cost}`);
      lines.push(`  Transmit Delay is 1 sec, State DR, Priority ${priority}`);
      lines.push(`  Designated Router (ID) ${rid}, Interface address ${ip}`);
      lines.push(`  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5`);
      lines.push(`    Hello due in 00:00:05`);
      lines.push(`  Neighbor Count is 1, Adjacent neighbor count is 1`);
      lines.push("");
    });
    if (lines.length === 0) lines.push("% No OSPF interfaces configured");
    return { output: lines.join("\n"), state };
  }

  // show ip ospf (general)
  if (sub.startsWith("ip ospf")) {
    const ospfProc = Object.keys(state.routerCfg).find(k => k.startsWith("ospf"));
    if (!ospfProc) return { output: "% OSPF is not configured", state };
    const procCfg = state.routerCfg[ospfProc] || [];
    const rid = procCfg.find(c => c.startsWith("router-id"))?.replace("router-id ", "") || "0.0.0.0";
    const pid = ospfProc.replace("ospf ", "");
    const nets = procCfg.filter(c => c.startsWith("network"));
    const lines = [
      `Routing Process "ospf ${pid}" with ID ${rid}`,
      ` Start time: 00:00:01.000, Time elapsed: 00:10:00.000`,
      ` Supports only single TOS(TOS0) routes`,
      ` Supports opaque LSA`,
      ` Number of areas in this router is 1. 1 normal 0 stub 0 nssa`,
      ` Number of areas transit capable is 0`,
      ` Reference bandwidth unit is 100 mbps`,
      ` Number of interfaces in this area: ${nets.length}`,
    ];
    return { output: lines.join("\n"), state };
  }

  // show ip ssh
  if (sub === "ip ssh" || sub.startsWith("ip ssh")) {
    if (!state.sshConfigured) {
      return { output: "SSH Disabled - version 1.99\n%Please create RSA keys (of at least 768 bits size) to enable SSH v2.", state };
    }
    return {
      output: `SSH Enabled - version 2.0\nAuthentication methods:publickey,keyboard-interactive,password\nAuthentication timeout: 120 secs; Authentication retries: 3\nMinimum expected Diffie Hellman key size : 1024 bits\nIOS Keys in SECSH format(ssh-rsa, base64 encoded): ${state.hostname}.lab.local`,
      state
    };
  }

  // show ip nat translations
  if (sub.startsWith("ip nat")) {
    if (state.natRules.length === 0) return { output: "% No NAT translations active", state };
    const lines = ["Pro  Inside global       Inside local        Outside local       Outside global", "---  ------------------- ------------------- ------------------- -------------------"];
    lines.push("---  ---                 ---                 ---                 ---");
    return { output: lines.join("\n"), state };
  }

  // ─── show cdp neighbors ───
  if (sub.startsWith("cdp") && sub.includes("neigh")) {
    if (!state.cdpGlobal) return { output: "% CDP is not enabled", state };
    const lines = [
      "Capability Codes: R - Router, T - Trans Bridge, B - Source Route Bridge",
      "                  S - Switch, H - Host, I - IGMP, r - Repeater, P - Phone",
      "",
      "Device ID        Local Intrfce     Holdtme    Capability  Platform  Port ID",
    ];
    // Simulated neighbors based on lab topology
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (pi.cdp !== false && (pi.trunk || pi.mode === "access")) {
        lines.push(`Neighbor         ${iface.padEnd(18)}160        R S I       Cisco     Eth0/0`);
      }
    });
    if (lines.length === 4) lines.push("% No CDP neighbors found");
    lines.push("", `Total cdp entries displayed : ${Math.max(0, lines.length - 5)}`);
    return { output: lines.join("\n"), state };
  }

  // ─── show cdp (global) ───
  if (sub.startsWith("cdp")) {
    return {
      output: `Global CDP information:\n  Sending CDP packets every 60 seconds\n  Sending a holdtime value of 180 seconds\n  Sending CDPv2 advertisements is enabled\n  CDP is ${state.cdpGlobal ? "enabled" : "disabled"}`,
      state
    };
  }

  // ─── show lldp neighbors ───
  if (sub.startsWith("lldp") && sub.includes("neigh")) {
    if (!state.lldpGlobal) return { output: "% LLDP is not enabled", state };
    const lines = [
      "Capability codes:",
      "    (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device",
      "    (W) WLAN Access Point, (P) Repeater, (S) Station, (O) Other",
      "",
      "Device ID          Local Intf     Hold-time  Capability      Port ID",
    ];
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (pi.lldpTx !== false && (pi.trunk || pi.mode === "access")) {
        lines.push(`Neighbor           ${iface.padEnd(15)}120        B,R             Eth0/0`);
      }
    });
    if (lines.length === 5) lines.push("% No LLDP neighbors found");
    lines.push("", `Total entries displayed: ${Math.max(0, lines.length - 6)}`);
    return { output: lines.join("\n"), state };
  }

  // ─── show lldp (global) ───
  if (sub.startsWith("lldp")) {
    return {
      output: `Global LLDP Information:\n  Status: ${state.lldpGlobal ? "ACTIVE" : "DISABLED"}\n  LLDP advertisements are sent every 30 seconds\n  LLDP hold time advertised is 120 seconds\n  LLDP reinitializing delay is 2 seconds`,
      state
    };
  }

  // ─── show etherchannel summary ───
  if (sub.includes("etherchannel") || sub.includes("port-channel")) {
    const channels = {};
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (pi.channelGroup) {
        if (!channels[pi.channelGroup]) channels[pi.channelGroup] = { mode: pi.channelMode, members: [] };
        channels[pi.channelGroup].members.push(iface);
      }
    });
    const lines = [
      "Flags:  D - down        P - bundled in port-channel",
      "        I - stand-alone  s - suspended",
      "        H - Hot-standby (LACP only)",
      "        R - Layer3       S - Layer2",
      "        U - in use       f - failed to allocate aggregator",
      "",
      "Number of channel-groups in use: " + Object.keys(channels).length,
      "Number of aggregators:           " + Object.keys(channels).length,
      "",
      "Group  Port-channel  Protocol    Ports",
      "------+-------------+-----------+-----------------------------------------------",
    ];
    Object.entries(channels).forEach(([grp, info]) => {
      const proto = (info.mode === "active" || info.mode === "passive") ? "LACP" : (info.mode === "on" ? "  -" : "PAgP");
      const memberStr = info.members.map(m => `${m}(P)`).join("    ");
      lines.push(`${grp.padEnd(7)}Po${grp.padEnd(12)}${proto.padEnd(12)}${memberStr}`);
    });
    if (Object.keys(channels).length === 0) lines.push("% No EtherChannel configured");
    return { output: lines.join("\n"), state };
  }

  // show port-security
  if (sub.includes("port-security")) {
    // show port-security interface <name>
    const ifMatch = sub.match(/port-security\s+interface\s+(\S+\s*\S*)/i);
    if (ifMatch) {
      const iface = normalizeInterface(ifMatch[1].trim());
      const cfg = state.portSecurity[iface];
      if (!cfg || !cfg.enabled) return { output: `% Port security not enabled on interface ${iface}`, state };
      const max = cfg.max || "1";
      const violation = cfg.violation || "shutdown";
      const sticky = cfg.sticky ? "Enabled" : "Disabled";
      const hash = iface.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      const mac = `0050.${(hash & 0xffff).toString(16).padStart(4,"0")}.${((hash*7) & 0xffff).toString(16).padStart(4,"0")}`;
      const lines = [
        `Port Security              : Enabled`,
        `Port Status                : Secure-up`,
        `Violation Mode             : ${violation.charAt(0).toUpperCase() + violation.slice(1)}`,
        `Aging Time                 : 0 mins`,
        `Aging Type                 : Absolute`,
        `SecureStatic Address Aging : Disabled`,
        `Maximum MAC Addresses      : ${max}`,
        `Total MAC Addresses        : 1`,
        `Configured MAC Addresses   : 0`,
        `Sticky MAC Addresses       : ${sticky === "Enabled" ? "1" : "0"}`,
        `Last Source Address:Vlan   : ${mac}:1`,
        `Security Violation Count   : 0`,
      ];
      return { output: lines.join("\n"), state };
    }
    // show port-security (summary)
    const lines = [
      "Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action",
      "----------   -------------  -----------  -----------------  ---------------",
    ];
    Object.entries(state.portSecurity).forEach(([iface, cfg]) => {
      if (cfg.enabled) {
        const maxStr = (cfg.max || "1").toString();
        const violStr = cfg.violation ? cfg.violation.charAt(0).toUpperCase() + cfg.violation.slice(1) : "Shutdown";
        lines.push(`${iface.padEnd(13)}${maxStr.padEnd(15)}0${" ".repeat(12)}0${" ".repeat(18)}${violStr}`);
      }
    });
    if (lines.length === 2) lines.push("% Port security not configured on any interface");
    return { output: lines.join("\n"), state };
  }

  // show arp
  if (sub === "arp" || sub.startsWith("arp")) {
    const lines = [
      "Protocol  Address          Age (min)  Hardware Addr   Type   Interface",
    ];
    Object.entries(state.interfaces).forEach(([ifName, ifInfo]) => {
      if (ifInfo.ip && ifInfo.ip !== "dhcp" && ifInfo.status === "up") {
        const ip = ifInfo.ip.split("/")[0];
        lines.push(`Internet  ${ip.padEnd(17)}0          aabb.cc00.0100  ARPA   ${ifName}`);
      }
    });
    // Simulated neighbor entries
    Object.entries(state.interfaces).forEach(([ifName, ifInfo]) => {
      if (ifInfo.ip && ifInfo.ip !== "dhcp" && ifInfo.status === "up") {
        const ip = ifInfo.ip.split("/")[0];
        const octets = ip.split(".");
        const neighborIp = `${octets[0]}.${octets[1]}.${octets[2]}.${parseInt(octets[3]) === 1 ? "2" : "1"}`;
        const hash = ifName.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const mac = `0050.${(hash & 0xffff).toString(16).padStart(4,"0")}.${((hash*7) & 0xffff).toString(16).padStart(4,"0")}`;
        lines.push(`Internet  ${neighborIp.padEnd(17)}2          ${mac}  ARPA   ${ifName}`);
      }
    });
    if (lines.length === 1) lines.push("% No ARP entries");
    return { output: lines.join("\n"), state };
  }

  // show ip protocols
  if (sub.startsWith("ip proto") || sub.startsWith("ip prot")) {
    if (Object.keys(state.routerCfg).length === 0 && state.staticRoutes.length === 0) {
      return { output: "% No routing protocols active", state };
    }
    const lines = [];
    const ospfProc = Object.keys(state.routerCfg);
    if (ospfProc.length > 0) {
      ospfProc.forEach(proc => {
        const procCfg = state.routerCfg[proc] || [];
        const routerId = procCfg.find(c => c.startsWith("router-id"));
        const networks = procCfg.filter(c => c.startsWith("network"));
        const passive = procCfg.filter(c => c.startsWith("passive-interface"));
        lines.push(`Routing Protocol is "ospf ${proc.replace("ospf ", "")}"`);
        lines.push(`  Outgoing update filter list for all interfaces is not set`);
        lines.push(`  Incoming update filter list for all interfaces is not set`);
        if (routerId) lines.push(`  Router ID ${routerId.replace("router-id ", "")}`);
        lines.push(`  Number of areas in this router is 1. 1 normal 0 stub 0 nssa`);
        lines.push(`  Maximum path: 4`);
        lines.push(`  Routing for Networks:`);
        if (networks.length === 0) lines.push(`    (none)`);
        networks.forEach(n => lines.push(`    ${n}`));
        if (passive.length > 0) {
          lines.push(`  Passive Interface(s):`);
          passive.forEach(p => lines.push(`    ${p.replace("passive-interface ", "")}`));
        }
        lines.push(`  Routing Information Sources:`);
        lines.push(`    Gateway         Distance      Last Update`);
        lines.push("");
      });
    }
    if (state.staticRoutes.length > 0) {
      lines.push(`Routing Protocol is "static"`);
      lines.push(`  ${state.staticRoutes.length} static route(s)`);
    }
    return { output: lines.join("\n"), state };
  }

  // show history
  if (sub === "history" || sub.startsWith("hist")) {
    if (!state.commandHistory || state.commandHistory.length === 0) {
      return { output: "% No commands in history", state };
    }
    const recent = state.commandHistory.slice(-20);
    const lines = recent.map((cmd, i) => `  ${(i + 1).toString().padStart(3)}  ${cmd}`);
    return { output: lines.join("\n"), state };
  }

  // show ip dhcp snooping
  if (sub.includes("dhcp snooping") || sub.includes("dhcp snoop")) {
    const lines = [
      `Switch DHCP snooping is ${state.dhcpSnooping.enabled ? "enabled" : "disabled"}`,
      `Switch DHCP gleaning is disabled`,
      `DHCP snooping is configured on following VLANs:`,
      `${state.dhcpSnooping.vlans.length ? state.dhcpSnooping.vlans.join(",") : "none"}`,
      `DHCP snooping is operational on following VLANs:`,
      `${state.dhcpSnooping.vlans.length ? state.dhcpSnooping.vlans.join(",") : "none"}`,
      `Insertion of option 82 is ${state.dhcpSnooping.options?.["information option"] === false ? "disabled" : "enabled"}`,
    ];
    const trusted = state.dhcpSnooping.trusted || [];
    if (trusted.length) {
      lines.push("", "Interface                  Trusted    Rate limit (pps)");
      lines.push("-----------------------    -------    ----------------");
      trusted.forEach(t => lines.push(`${t.padEnd(27)}yes        unlimited`));
    }
    return { output: lines.join("\n"), state };
  }

  // show ip arp inspection
  if (sub.includes("arp inspection")) {
    const lines = [
      `Source Mac Validation      : ${state.daiConfig.validate.includes("src-mac") ? "Enabled" : "Disabled"}`,
      `Destination Mac Validation : ${state.daiConfig.validate.includes("dst-mac") ? "Enabled" : "Disabled"}`,
      `IP Address Validation      : ${state.daiConfig.validate.includes("ip") ? "Enabled" : "Disabled"}`,
      ``,
      ` Vlan     Configuration    Operation   ACL Match          Static ACL`,
      ` ----     -------------    ---------   ---------          ----------`,
    ];
    state.daiConfig.vlans.forEach(v => {
      lines.push(` ${v.padEnd(9)}Enabled          Active      N/A                N/A`);
    });
    if (state.daiConfig.vlans.length === 0) lines.push(" No VLANs configured for DAI");
    return { output: lines.join("\n"), state };
  }

  // ─── show mac address-table ───
  if (sub.startsWith("mac") || sub.includes("mac-address") || sub.includes("mac address")) {
    const lines = [
      "          Mac Address Table",
      "-------------------------------------------",
      "",
      "Vlan    Mac Address       Type        Ports",
      "----    -----------       --------    -----",
    ];
    // Generate simulated MAC entries from configured access ports
    let count = 0;
    Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
      const pi = getPortInfo(iface, cmds);
      if (!pi.trunk && state.interfaces[iface]?.status === "up") {
        const hash = iface.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        const mac = `0050.${(hash & 0xffff).toString(16).padStart(4,"0")}.${((hash*7) & 0xffff).toString(16).padStart(4,"0")}`;
        lines.push(`${pi.accessVlan.padEnd(8)}${mac.padEnd(18)}DYNAMIC     ${iface}`);
        count++;
      }
    });
    lines.push(`Total Mac Addresses for this criterion: ${count}`);
    return { output: lines.join("\n"), state };
  }

  // ─── show spanning-tree ───
  if (sub.startsWith("span")) {
    const lines = [];
    const activeVlans = Object.keys(state.vlans);
    activeVlans.forEach(vid => {
      lines.push(`VLAN${vid.toString().padStart(4, "0")}`);
      lines.push(`  Spanning tree enabled protocol rstp`);
      lines.push(`  Root ID    Priority    32768`);
      lines.push(`             Address     aabb.cc00.0100`);
      lines.push(`             This bridge is the root`);
      lines.push(`             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec`);
      lines.push(``);
      lines.push(`  Bridge ID  Priority    32768  (priority 32768 sys-id-ext ${vid})`);
      lines.push(`             Address     aabb.cc00.0100`);
      lines.push(`             Hello Time   2 sec  Max Age 20 sec  Forward Delay 15 sec`);
      lines.push(`             Aging Time  300 sec`);
      lines.push(``);
      lines.push(`Interface           Role Sts Cost      Prio.Nbr Type`);
      lines.push(`------------------- ---- --- --------- -------- --------------------------------`);
      Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
        const pi = getPortInfo(iface, cmds);
        const pf = pi.portfast ? "Edge " : "";
        lines.push(`${iface.padEnd(20)}Desg FWD 100       128.1    ${pf}P2p`);
      });
      lines.push("");
    });
    if (lines.length === 0) lines.push("No spanning tree instances exist.");
    return { output: lines.join("\n"), state };
  }

  // show ntp
  if (sub.startsWith("ntp")) {
    const entries = Object.keys(state.ntpConfig);
    if (entries.length === 0) return { output: "% NTP is not configured", state };
    const lines = [];
    if (state.ntpConfig.master) lines.push("NTP master stratum 8");
    entries.forEach(e => { if (e !== "master") lines.push(`ntp ${e}`); });
    return { output: lines.join("\n"), state };
  }

  // show ip access-lists
  if (sub.includes("access-list") || sub.includes("access-lists")) {
    const lines = [];
    Object.entries(state.aclCfg).forEach(([name, entries]) => {
      const aclDef = state.globalCmds.find(c => c.includes("access-list") && c.includes(name));
      const type = aclDef && aclDef.includes("extended") ? "Extended" : "Standard";
      lines.push(`${type} IP access list ${name}`);
      entries.forEach((e, i) => lines.push(`    ${(i+1)*10} ${e}`));
    });
    if (lines.length === 0) lines.push("% No access lists configured");
    return { output: lines.join("\n"), state };
  }

  // show ip dhcp pool
  if (sub.includes("dhcp pool") || sub.includes("dhcp bind")) {
    const lines = [];
    Object.entries(state.dhcpCfg).forEach(([name, entries]) => {
      lines.push(`Pool ${name} :`);
      lines.push(` Utilization mark (high/low)    : 100 / 0`);
      entries.forEach(e => lines.push(` ${e}`));
      lines.push("");
    });
    if (lines.length === 0) lines.push("% No DHCP pools configured");
    return { output: lines.join("\n"), state };
  }

  // show version
  if (sub.startsWith("ver")) {
    return {
      output: `Cisco IOS Software, Version 15.9(3)M7\nCopyright (c) by Cisco Systems, Inc.\n\nROM: System Bootstrap, Version 15.1(4)M4\n\n${state.hostname} uptime is 0 minutes\nSystem image file is "flash:c2900-universalk9-mz.SPA.159-3.M7.bin"\n\nCisco ${state.type === "switch" ? "WS-C2960-24TT-L" : "CISCO2901/K9"} (revision 1.0)\n${state.type === "switch" ? "2" : "2"} ${state.type === "switch" ? "FastEthernet/IEEE 802.3" : "Gigabit Ethernet"} interfaces\n256K bytes of non-volatile configuration memory.\n255744K bytes of ATA System CompactFlash 0 (Read/Write)`,
      state
    };
  }

  // show clock
  if (sub.startsWith("clock") || sub.startsWith("cl")) {
    return { output: `*12:00:00.000 UTC Sun Feb 23 2026`, state };
  }

  // show flash
  if (sub.startsWith("flash")) {
    const model = state.type === "switch" ? "c2960-lanbasek9-mz.150-2.SE11.bin" : "c2900-universalk9-mz.SPA.159-3.M7.bin";
    return {
      output: `-#- --length-- -----date/time------ path\n  1    73476688 Feb 23 2026 00:00:00 +00:00 ${model}\n\n255744000 bytes total (182267312 bytes free)`,
      state
    };
  }

  // show logging
  if (sub.startsWith("log")) {
    return {
      output: `Syslog logging: enabled (0 messages dropped, 0 messages rate-limited,\n                0 flushes, 0 overruns, xml disabled, filtering disabled)\n\nNo Active Message Discriminator.\n\nConsole logging: level debugging, 0 messages logged, xml disabled,\n                 filtering disabled\nMonitor logging: level debugging, 0 messages logged, xml disabled,\n                 filtering disabled\nBuffer logging:  level debugging, 0 messages logged, xml disabled,\n                 filtering disabled\n\nLog Buffer (8192 bytes):\n`,
      state
    };
  }

  // show users
  if (sub === "users" || sub.startsWith("users")) {
    return {
      output: `    Line       User       Host(s)              Idle       Location\n*  0 con 0                idle                 00:00:00\n\n  Interface    User               Mode         Idle     Peer Address`,
      state
    };
  }

  // show inventory
  if (sub.startsWith("inv")) {
    const model = state.type === "switch" ? "WS-C2960-24TT-L" : "CISCO2901/K9";
    const sn = "FTX1524" + state.hostname.split("").reduce((a, c) => a + c.charCodeAt(0), 0).toString(16).toUpperCase().slice(0, 4);
    return {
      output: `NAME: "1", DESCR: "Cisco ${model}"\nPID: ${model}       , VID: V04  , SN: ${sn}`,
      state
    };
  }

  // ─── show ? (help for show subcommands) ───
  if (sub === "" || sub === "?") {
    const showHelp = [
      ["access-lists", "List access lists"],
      ["arp", "ARP table"],
      ["cdp", "CDP information"],
      ["clock", "Display the system clock"],
      ["dhcp", "DHCP snooping information"],
      ["etherchannel", "EtherChannel information"],
      ["flash:", "Display information about flash: file system"],
      ["history", "Display the session command history"],
      ["interfaces", "Interface status and configuration"],
      ["inventory", "Show the physical inventory"],
      ["ip", "IP information"],
      ["lldp", "LLDP information"],
      ["logging", "Show the logging buffers"],
      ["mac", "MAC forwarding table"],
      ["ntp", "NTP information"],
      ["port-security", "Show port security status"],
      ["running-config", "Current operating configuration"],
      ["spanning-tree", "Spanning tree topology"],
      ["startup-config", "Saved configuration"],
      ["users", "Display information about terminal lines"],
      ["version", "System hardware and software status"],
      ["vlan", "VTP VLAN status"],
    ];
    return { output: showHelp.map(([c, d]) => `  ${c.padEnd(20)} ${d}`).join("\n"), state };
  }

  return { output: `% Invalid input detected at '^' marker.\n\n  show ${sub}\n       ^`, state };
}


