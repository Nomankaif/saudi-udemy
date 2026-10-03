// iosCommands.js — Main command processor

import { normalizeInterface, parseInterfaceRange, cfgAdd, cfgRemove } from "./iosHelpers.js";
import { processShow } from "./iosShow.js";
import { getHelp } from "./iosHelp.js";
import { doPing, doTraceroute } from "./iosNetwork.js";
import { validateCommand } from "./iosValidate.js";

export function processCommand(input, state) {
  const rawCmd = input.trim();
  if (!rawCmd) return { output: "", state };

  state = { ...state };
  state.commandHistory = [...state.commandHistory, rawCmd];

  // ─── Pending crypto modulus input — intercept before anything else ────────
  if (state._pendingCrypto) {
    const bits = rawCmd.trim();
    if (/^\d{3,4}$/.test(bits)) {
      const validBits = bits;
      state._pendingCrypto = null;
      state.sshConfigured = true;
      state.rsaBits = validBits;
      if (state.mode === "config") {
        state.globalCmds = cfgAdd(state.globalCmds, `crypto key generate rsa ${validBits}`);
      }
      return {
        output: `% Generating ${validBits} bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was 1 seconds)`,
        state
      };
    } else {
      state._pendingCrypto = null;
      return { output: "% Bad input detected.\n% RSA key generation cancelled.", state };
    }
  }

  const cmd = rawCmd;
  const lc = cmd.toLowerCase();
  const parts = lc.split(/\s+/);
  let first = parts[0];

  // ─── IOS abbreviation expansion for exec commands ───
  const execCmds = {
    user: ["enable", "exit", "logout", "ping", "quit", "show", "traceroute"],
    privileged: ["clear", "clock", "configure", "copy", "crypto", "debug", "disable",
      "erase", "exit", "logout", "ping", "quit", "reload", "show", "ssh",
      "terminal", "traceroute", "undebug", "write"],
  };
  if (state.mode === "user" || state.mode === "privileged") {
    const cmds = execCmds[state.mode] || [];
    const exact = cmds.find(c => c === first);
    if (exact) {
      // exact match, no expansion needed
    } else {
      const matches = cmds.filter(c => c.startsWith(first));
      if (matches.length === 1) {
        first = matches[0];
        parts[0] = first;
      } else if (matches.length > 1 && first.length > 0 && first !== "?") {
        return { output: `% Ambiguous command:  "${rawCmd}"`, state };
      }
    }
  }

  // Universal: ?
  if (rawCmd === "?") return { output: getHelp(state), state };

  // do command (from config modes, run privileged commands)
  if (first === "do" && state.mode.startsWith("config")) {
    const subCmd = rawCmd.substring(3).trim();
    const savedMode = state.mode;
    const savedCtx = { currentInterface: state.currentInterface, currentLine: state.currentLine, currentRouter: state.currentRouter, currentVlan: state.currentVlan, currentAcl: state.currentAcl, currentDhcpPool: state.currentDhcpPool };
    state.mode = "privileged";
    const result = processCommand(subCmd, state);
    result.state.mode = savedMode;
    Object.assign(result.state, savedCtx);
    return result;
  }

  // exit / end
  if (first === "exit" || first === "end") {
    if (first === "end") {
      return { output: "", state: { ...state, mode: state.mode === "user" ? "user" : "privileged", currentInterface: null, currentLine: null, currentRouter: null, currentVlan: null, currentAcl: null, currentDhcpPool: null } };
    }
    const modeUp = {
      "config-if": "config", "config-subif": "config", "config-line": "config",
      "config-router": "config", "config-vlan": "config", "config-acl": "config",
      "config-ext-acl": "config", "config-dhcp": "config",
      "config": "privileged", "privileged": "user",
    };
    const newMode = modeUp[state.mode] || state.mode;
    return { output: "", state: { ...state, mode: newMode, currentInterface: null, currentLine: null, currentRouter: null, currentVlan: null, currentAcl: null, currentDhcpPool: null } };
  }

  // ─── USER EXEC ────
  if (state.mode === "user") {
    if (first === "enable" || first === "en") return { output: "", state: { ...state, mode: "privileged" } };
    if (first === "ping") return doPing(parts, state);
    if (first === "traceroute" || first === "trace") return doTraceroute(parts, state);
    if (first === "show" || first === "sh") return processShow(parts, state);
    if (first === "logout" || first === "quit" || first === "exit") {
      return { output: `${state.hostname} con0 is now available\n\nPress RETURN to get started.`, state: { ...state, mode: "user" } };
    }
    return { output: `% Unknown command or computer name, or unable to find computer address`, state };
  }

  // ─── PRIVILEGED EXEC ────
  if (state.mode === "privileged") {
    if (first === "disable" || first === "dis") {
      return { output: "", state: { ...state, mode: "user" } };
    }
    if (first === "configure" || first === "conf") {
      return { output: "Enter configuration commands, one per line. End with CNTL/Z.", state: { ...state, mode: "config" } };
    }
    if (first === "show" || first === "sh") return processShow(parts, state);
    if (first === "ping") return doPing(parts, state);
    if (first === "traceroute" || first === "trace") return doTraceroute(parts, state);
    if (first === "ssh") {
      const target = parts.slice(1).join(" ");
      return { output: `Password: \n\n[Connection to ${target} opened]\n${state.hostname}>`, state };
    }
    if (first === "copy") {
      const args = lc.replace("copy ", "").trim();
      if (args.includes("running") && args.includes("start")) {
        state._startupSaved = true;
        state._startupConfig = JSON.parse(JSON.stringify({
          globalCmds: state.globalCmds, interfaceCfg: state.interfaceCfg, lineCfg: state.lineCfg,
          routerCfg: state.routerCfg, vlanCfg: state.vlanCfg, aclCfg: state.aclCfg, dhcpCfg: state.dhcpCfg,
        }));
        return { output: "Destination filename [startup-config]?\nBuilding configuration...\n[OK]", state };
      }
      return { output: `[OK]\n${parts.slice(1).join(" ")} copied`, state };
    }
    if (first === "write" || first === "wr") {
      state._startupSaved = true;
      state._startupConfig = JSON.parse(JSON.stringify({
        globalCmds: state.globalCmds, interfaceCfg: state.interfaceCfg, lineCfg: state.lineCfg,
        routerCfg: state.routerCfg, vlanCfg: state.vlanCfg, aclCfg: state.aclCfg, dhcpCfg: state.dhcpCfg,
      }));
      return { output: "Building configuration...\n[OK]", state };
    }
    if (first === "erase") {
      if (lc.includes("startup")) {
        state._startupSaved = false;
        state._startupConfig = null;
        return { output: "Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]\n[OK]\nErase of nvram: complete", state };
      }
      return { output: `% Incomplete command.`, state };
    }
    if (first === "clear") {
      if (lc.includes("arp") || lc.includes("ip arp")) return { output: "", state };
      if (lc.includes("mac") || lc.includes("mac-address")) return { output: "", state };
      if (lc.includes("counters")) return { output: "Clear \"show interface\" counters on all interfaces [confirm]", state };
      return { output: "", state };
    }
    if (first === "terminal") return { output: "", state };
    if (first === "clock" && parts[1] === "set") {
      return { output: "", state };
    }
    if (first === "crypto") {
      if (parts[1] !== "key") return { output: "% Incomplete command.", state };
      if (parts[2] !== "generate") return { output: "% Incomplete command.", state };
      if (parts[3] !== "rsa") return { output: "% Incomplete command.", state };
      const bits = parts[4] && /^\d{3,4}$/.test(parts[4]) ? parts[4] : null;
      if (bits) {
        state.sshConfigured = true;
        state.rsaBits = bits;
        return {
          output: `The name for the keys will be: ${state.hostname}.lab.local\n% Generating ${bits} bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was 1 seconds)`,
          state
        };
      } else {
        state._pendingCrypto = "privileged";
        return {
          output: `The name for the keys will be: ${state.hostname}.lab.local\nChoose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n\nHow many bits in the modulus [512]: `,
          state
        };
      }
    }
    if (first === "undebug" || first === "debug") return { output: first === "debug" ? "Debugging enabled" : "All possible debugging has been turned off", state };
    if (first === "reload") return { output: "Proceed with reload? [confirm]\n\nSystem Bootstrap, Version 15.1(4)M4\n...\nSystem restarted", state };
    if (first === "logout" || first === "quit") {
      return { output: `${state.hostname} con0 is now available\n\nPress RETURN to get started.`, state: { ...state, mode: "user" } };
    }
    return { output: `% Unknown command '${first}'. Type '?' for help.`, state };
  }

  // ─── GLOBAL CONFIG ────
  if (state.mode === "config") {
    const isNo = first === "no";
    const positiveParts = isNo ? parts.slice(1) : parts;
    const positiveCmd = isNo ? lc.replace(/^no\s+/, "") : lc;
    const pFirst = positiveParts[0];

    // ─── Incomplete command detection ───
    if (!isNo) {
      const incompletes = ["ip route", "ip address", "ip nat", "ip dhcp", "ipv6 route", "switchport", "channel-group"];
      for (const ic of incompletes) {
        if (lc === ic) return { output: "% Incomplete command.", state };
      }
    }

    // ─── Crypto key generate rsa ─────────────────────────────────────────────
    if (pFirst === "crypto" && !isNo) {
      if (positiveParts[1] === "key" && positiveParts[2] === "generate" && positiveParts[3] === "rsa") {
        const bits = positiveParts[4] || parts.find(p => /^\d{3,4}$/.test(p));
        if (bits) {
          state.sshConfigured = true;
          state.rsaBits = bits;
          state.globalCmds = cfgAdd(state.globalCmds, `crypto key generate rsa ${bits}`);
          return {
            output: `The name for the keys will be: ${state.hostname}.lab.local\n% Generating ${bits} bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was 1 seconds)`,
            state
          };
        } else {
          state._pendingCrypto = true;
          return {
            output: `The name for the keys will be: ${state.hostname}.lab.local\nChoose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n\nHow many bits in the modulus [512]: `,
            state
          };
        }
      }
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }

    // ─── Syntax validation (before any branch processes the command) ───
    if (!isNo) {
      const v = validateCommand(rawCmd, state);
      if (!v.ok) return { output: v.error, state };
    }

    // ─── Spanning-tree global commands ───
    if (pFirst === "spanning-tree") {
      if (isNo) { state.globalCmds = cfgRemove(state.globalCmds, lc); }
      else { state.globalCmds = cfgAdd(state.globalCmds, lc); }
      return { output: "", state };
    }

    // Interface
    if ((pFirst === "interface" || pFirst === "int") && !isNo) {
      const rest = rawCmd.replace(/^(interface|int)\s+/i, "");
      if (rest.toLowerCase().startsWith("range ")) {
        const rangeStr = rest.replace(/^range\s+/i, "");
        const interfaces = parseInterfaceRange(rangeStr);
        const ifName = interfaces[0];
        if (!state.interfaceCfg[ifName]) state.interfaceCfg[ifName] = [];
        return { output: "", state: { ...state, mode: "config-if", currentInterface: ifName, _rangeInterfaces: interfaces } };
      }
      const ifName = normalizeInterface(rest);
      if (!state.interfaceCfg[ifName]) state.interfaceCfg[ifName] = [];
      // Subinterface detection (e.g., Ethernet0/0.10)
      const isSubIf = ifName.includes(".");
      return { output: "", state: { ...state, mode: isSubIf ? "config-subif" : "config-if", currentInterface: ifName } };
    }
    // no interface → remove interface config
    if (isNo && (pFirst === "interface" || pFirst === "int")) {
      const rest = positiveCmd.replace(/^(interface|int)\s+/i, "");
      const ifName = normalizeInterface(rest);
      const newCfg = { ...state.interfaceCfg };
      delete newCfg[ifName];
      return { output: "", state: { ...state, interfaceCfg: newCfg } };
    }
    // Line
    if (pFirst === "line" && !isNo) {
      const lineName = positiveParts.slice(1).join(" ");
      if (!state.lineCfg[lineName]) state.lineCfg[lineName] = [];
      return { output: "", state: { ...state, mode: "config-line", currentLine: lineName } };
    }
    // Router
    if (pFirst === "router" && !isNo) {
      const routerName = positiveParts.slice(1).join(" ");
      if (!state.routerCfg[routerName]) state.routerCfg[routerName] = [];
      return { output: "", state: { ...state, mode: "config-router", currentRouter: routerName } };
    }
    // no router → remove router config
    if (isNo && pFirst === "router") {
      const routerName = positiveParts.slice(1).join(" ");
      const newCfg = { ...state.routerCfg };
      delete newCfg[routerName];
      return { output: "", state: { ...state, routerCfg: newCfg } };
    }
    // VLAN
    if (pFirst === "vlan" && !isNo) {
      const vid = positiveParts[1];
      return { output: "", state: { ...state, mode: "config-vlan", currentVlan: vid, vlans: { ...state.vlans, [vid]: state.vlans[vid] || "" } } };
    }
    // no vlan → delete vlan
    if (isNo && pFirst === "vlan") {
      const vid = positiveParts[1];
      const newVlans = { ...state.vlans }; delete newVlans[vid];
      const newVlanCfg = { ...state.vlanCfg }; delete newVlanCfg[vid];
      return { output: "", state: { ...state, vlans: newVlans, vlanCfg: newVlanCfg } };
    }
    // Named ACL
    if (pFirst === "ip" && positiveParts[1] === "access-list" && !isNo) {
      const isExtended = positiveParts[2] === "extended";
      const isStandard = positiveParts[2] === "standard";
      const aclName = (isExtended || isStandard) ? positiveParts.slice(3).join(" ") : positiveParts.slice(2).join(" ");
      if (!state.aclCfg[aclName]) state.aclCfg[aclName] = [];
      state.globalCmds = cfgAdd(state.globalCmds, positiveCmd);
      return { output: "", state: { ...state, mode: isExtended ? "config-ext-acl" : "config-acl", currentAcl: aclName } };
    }
    // no ip access-list → remove ACL
    if (isNo && pFirst === "ip" && positiveParts[1] === "access-list") {
      const isExt = positiveParts[2] === "extended";
      const isStd = positiveParts[2] === "standard";
      const aclName = (isExt || isStd) ? positiveParts.slice(3).join(" ") : positiveParts.slice(2).join(" ");
      const newAcl = { ...state.aclCfg }; delete newAcl[aclName];
      state.globalCmds = cfgRemove(state.globalCmds, lc);
      return { output: "", state: { ...state, aclCfg: newAcl, globalCmds: state.globalCmds } };
    }
    // DHCP pool
    if (pFirst === "ip" && positiveParts[1] === "dhcp" && positiveParts[2] === "pool" && !isNo) {
      const poolName = positiveParts.slice(3).join(" ");
      if (!state.dhcpCfg[poolName]) state.dhcpCfg[poolName] = [];
      return { output: "", state: { ...state, mode: "config-dhcp", currentDhcpPool: poolName } };
    }
    // DHCP excluded
    if (pFirst === "ip" && positiveParts[1] === "dhcp" && positiveParts[2] === "excluded-address") {
      if (isNo) {
        state.dhcpExcluded = state.dhcpExcluded.filter(x => x !== positiveCmd);
        state.globalCmds = cfgRemove(state.globalCmds, lc);
      } else {
        state.dhcpExcluded = cfgAdd(state.dhcpExcluded, lc);
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      }
      return { output: "", state };
    }
    // DHCP snooping
    if (pFirst === "ip" && positiveParts[1] === "dhcp" && positiveParts[2] === "snooping") {
      if (isNo) {
        state.dhcpSnooping = { ...state.dhcpSnooping, options: { ...state.dhcpSnooping.options, [positiveParts.slice(3).join(" ")]: false } };
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      } else if (positiveParts.length === 3) {
        state.dhcpSnooping = { ...state.dhcpSnooping, enabled: true };
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      } else if (positiveParts[3] === "vlan") {
        const vid = positiveParts[4];
        if (!state.dhcpSnooping.vlans.includes(vid)) {
          state.dhcpSnooping = { ...state.dhcpSnooping, vlans: [...state.dhcpSnooping.vlans, vid] };
        }
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      } else {
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      }
      return { output: "", state };
    }
    // DAI
    if (pFirst === "ip" && positiveParts[1] === "arp" && positiveParts[2] === "inspection") {
      if (positiveParts[3] === "vlan") {
        const vid = positiveParts[4];
        if (isNo) {
          state.daiConfig = { ...state.daiConfig, vlans: state.daiConfig.vlans.filter(v => v !== vid) };
        } else if (!state.daiConfig.vlans.includes(vid)) {
          state.daiConfig = { ...state.daiConfig, vlans: [...state.daiConfig.vlans, vid] };
        }
      } else if (positiveParts[3] === "validate") {
        state.daiConfig = { ...state.daiConfig, validate: isNo ? [] : positiveParts.slice(4) };
      }
      state.globalCmds = isNo ? cfgRemove(state.globalCmds, lc) : cfgAdd(state.globalCmds, lc);
      return { output: "", state };
    }
    // Static route IPv4: "ip route" / "no ip route"
    if (pFirst === "ip" && positiveParts[1] === "route") {
      if (isNo) {
        state.staticRoutes = state.staticRoutes.filter(r => r !== positiveCmd);
        state.globalCmds = state.globalCmds.filter(r => r !== positiveCmd);
        return { output: "", state };
      }
      state.staticRoutes = cfgAdd(state.staticRoutes, lc);
      state.globalCmds = cfgAdd(state.globalCmds, lc);
      return { output: "", state };
    }
    // Static route IPv6
    if (pFirst === "ipv6" && positiveParts[1] === "route") {
      if (isNo) {
        state.staticRoutesV6 = state.staticRoutesV6.filter(r => r !== positiveCmd);
        state.globalCmds = state.globalCmds.filter(r => r !== positiveCmd);
        return { output: "", state };
      }
      state.staticRoutesV6 = cfgAdd(state.staticRoutesV6, lc);
      state.globalCmds = cfgAdd(state.globalCmds, lc);
      return { output: "", state };
    }
    // NAT
    if (pFirst === "ip" && positiveParts[1] === "nat") {
      if (isNo) {
        state.natRules = state.natRules.filter(r => r !== positiveCmd);
        state.globalCmds = state.globalCmds.filter(r => r !== positiveCmd);
      } else {
        state.natRules = cfgAdd(state.natRules, lc);
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      }
      return { output: "", state };
    }
    // Username
    if (pFirst === "username") {
      const username = positiveParts[1];
      if (isNo) {
        state.users = state.users.filter(u => u.username !== username);
        state.globalCmds = state.globalCmds.filter(c => !(c.startsWith("username " + username)));
      } else {
        // Replace existing user or add new
        state.users = [...state.users.filter(u => u.username !== username), { cmd: lc, username }];
        state.globalCmds = [...state.globalCmds.filter(c => !(c.startsWith("username " + username))), lc];
      }
      return { output: "", state };
    }
    // Hostname
    if (pFirst === "hostname" && !isNo) {
      const newName = rawCmd.split(/\s+/)[1] || state.hostname;
      state.hostname = newName;
      state.globalCmds = cfgAdd(state.globalCmds, lc);
      return { output: "", state };
    }
    // NTP
    if (pFirst === "ntp") {
      if (isNo) {
        const key = positiveParts.slice(1).join(" ");
        const newNtp = { ...state.ntpConfig }; delete newNtp[key];
        state.ntpConfig = newNtp;
        state.globalCmds = state.globalCmds.filter(c => c !== positiveCmd);
      } else {
        state.ntpConfig = { ...state.ntpConfig, [parts.slice(1).join(" ")]: true };
        state.globalCmds = cfgAdd(state.globalCmds, lc);
      }
      return { output: "", state };
    }
    // CDP global
    if ((pFirst === "cdp" && positiveParts[1] === "run") || (isNo && pFirst === "cdp" && positiveParts[1] === "run")) {
      state.cdpGlobal = !isNo;
      state.globalCmds = isNo ? cfgRemove(state.globalCmds, "cdp run") : cfgAdd(state.globalCmds, "cdp run");
      state.globalCmds = state.globalCmds.filter(c => c !== "no cdp run");
      if (isNo) state.globalCmds = cfgAdd(state.globalCmds, "no cdp run");
      return { output: "", state };
    }
    // LLDP global
    if (pFirst === "lldp" && positiveParts[1] === "run") {
      state.lldpGlobal = !isNo;
      state.globalCmds = isNo ? cfgRemove(state.globalCmds, "lldp run") : cfgAdd(state.globalCmds, "lldp run");
      return { output: "", state };
    }
    // ip domain-name (for SSH)
    if (pFirst === "ip" && positiveParts[1] === "domain-name") {
      if (isNo) {
        state.globalCmds = state.globalCmds.filter(c => !c.startsWith("ip domain-name"));
      } else {
        state.globalCmds = [...state.globalCmds.filter(c => !c.startsWith("ip domain-name")), lc];
      }
      return { output: "", state };
    }
    // ipv6 unicast-routing and others
    if (pFirst === "ipv6") {
      if (isNo) { state.globalCmds = cfgRemove(state.globalCmds, lc); }
      else { state.globalCmds = cfgAdd(state.globalCmds, lc); }
      return { output: "", state };
    }
    // ─── Known global config prefixes (accept + store) ───
    const knownGlobalPrefixes = [
      "service ", "no service ", "boot ", "logging ", "enable ", "banner ",
      "ip domain", "ip name", "ip ssh", "ip default", "ip classless",
      "ip cef", "no ip domain", "ip http", "no ip http",
      "access-list ", "ip access-group",
      "snmp", "aaa ", "tacacs", "radius",
      "errdisable ", "mac address-table ", "ip verify ",
      "spanning-tree mode", "spanning-tree vlan",
    ];
    const matchesKnown = knownGlobalPrefixes.some(p => lc.startsWith(p));
    if (matchesKnown) {
      if (isNo) { state.globalCmds = cfgRemove(state.globalCmds, lc); }
      else { state.globalCmds = cfgAdd(state.globalCmds, lc); }
      return { output: "", state };
    }
    // Generic no command — just remove the positive form, never store "no X" for unknown cmds
    if (isNo) {
      state.globalCmds = cfgRemove(state.globalCmds, lc);
      return { output: "", state };
    }
    // ─── REJECT unknown commands ───
    return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
  }

  // ─── INTERFACE CONFIG ────
  if (state.mode === "config-if" || state.mode === "config-subif") {
    const iface = state.currentInterface;
    const rangeIfs = state._rangeInterfaces || [iface];
    const isNo = first === "no";
    const positiveCmd = isNo ? lc.replace(/^no\s+/, "") : lc;
    const positiveParts = isNo ? parts.slice(1) : parts;
    const pFirst = positiveParts[0];

    // ─── Incomplete command detection ───
    if (!isNo) {
      const incompletes = ["switchport mode", "switchport access", "switchport trunk", "switchport voice",
        "ip address", "ipv6 address", "channel-group", "switchport port-security maximum",
        "switchport port-security violation"];
      for (const ic of incompletes) {
        if (lc === ic) return { output: "% Incomplete command.", state };
      }
    }

    // ─── Crypto key generate rsa ─────────────────────────────────────────────
    if (pFirst === "crypto" && !isNo) {
      if (positiveParts[1] === "key" && positiveParts[2] === "generate" && positiveParts[3] === "rsa") {
        const bits = parts.find(p => /^\d{3,4}$/.test(p));
        if (bits) {
          // One-liner: crypto key generate rsa 1024
          state.sshConfigured = true;
          state.rsaBits = bits;
          state.globalCmds = cfgAdd(state.globalCmds, `crypto key generate rsa ${bits}`);
          return {
            output: `The name for the keys will be: ${state.hostname}.lab.local\n% Generating ${bits} bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was 1 seconds)`,
            state
          };
        } else {
          // Interactive: ask for modulus size
          state._pendingCrypto = true;
          return {
            output: `The name for the keys will be: ${state.hostname}.lab.local\nChoose the size of the key modulus in the range of 360 to 4096 for your\n  General Purpose Keys. Choosing a key modulus greater than 512 may take\n  a few minutes.\n\nHow many bits in the modulus [512]: `,
            state
          };
        }
      }
      return { output: `% Invalid input detected at '^' marker.`, state };
    }

    // ─── Syntax validation ───
    if (!isNo) {
      const v = validateCommand(rawCmd, state);
      if (!v.ok) return { output: v.error, state };
    }

    // Navigate to another interface
    if ((first === "interface" || first === "int") && !isNo) {
      const rest = rawCmd.replace(/^(interface|int)\s+/i, "");
      const newIf = normalizeInterface(rest);
      if (!state.interfaceCfg[newIf]) state.interfaceCfg[newIf] = [];
      return { output: "", state: { ...state, mode: "config-if", currentInterface: newIf, _rangeInterfaces: undefined } };
    }

    // ─── VALIDATE command before storing ───
    const validIfPrefixes = [
      "switchport ", "ip address", "ip nat ", "ip ospf", "ip dhcp", "ip access-group",
      "ip helper-address", "ip proxy-arp", "ip verify ",
      "ipv6 address", "ipv6 ospf", "ipv6 nd", "ipv6 enable",
      "shutdown", "no shutdown", "no switchport", "no ip", "no ipv6", "no spanning",
      "no cdp", "no lldp", "no channel", "no encapsulation",
      "channel-group ", "spanning-tree ", "cdp ", "lldp ", "description ",
      "speed ", "duplex ", "media-type ", "negotiation ",
      "ip arp inspection", "storm-control ", "encapsulation ",
    ];
    const isValid = isNo || validIfPrefixes.some(p => lc.startsWith(p)) || lc === "shutdown";
    if (!isValid) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }

    // ─── Apply validated command to config ───
    const newIfCfg = { ...state.interfaceCfg };

    // Commands that are ON by default on an interface — their no-form must be stored explicitly
    // (e.g. CDP is on by default, so "no cdp enable" must appear in running-config)
    const DEFAULT_ON_IF_CMDS = [
      "cdp enable", "ip proxy-arp", "ip redirects", "ip unreachables",
      "lldp transmit", "lldp receive",
    ];

    for (const ifn of rangeIfs) {
      if (!newIfCfg[ifn]) newIfCfg[ifn] = [];
      if (isNo) {
        const positiveForm = lc.replace(/^no\s+/, "");
        if (DEFAULT_ON_IF_CMDS.some(c => positiveForm === c || positiveForm.startsWith(c + " "))) {
          // Remove positive form (if present) and explicitly store the no-form
          newIfCfg[ifn] = [...newIfCfg[ifn].filter(x => x !== positiveForm && !x.startsWith(positiveForm + " ")), lc];
        } else {
          // Just remove positive form — don't store "no X" in running-config
          newIfCfg[ifn] = cfgRemove(newIfCfg[ifn], lc);
        }
      } else {
        // Adding a positive command also removes any existing "no X" form
        const noForm = "no " + lc;
        newIfCfg[ifn] = cfgAdd(newIfCfg[ifn].filter(x => x !== noForm), lc);
      }
    }

    // Track specific state changes
    if (pFirst === "ip" && positiveParts[1] === "address") {
      const newIfs = { ...state.interfaces };
      if (isNo) {
        for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], ip: undefined }; }
      } else {
        const addr = parts.slice(2).join(" ");
        for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], ip: addr, status: "up" }; }
      }
      return { output: "", state: { ...state, interfaces: newIfs, interfaceCfg: newIfCfg } };
    }
    if (pFirst === "ipv6" && positiveParts[1] === "address") {
      const newIfs = { ...state.interfaces };
      if (isNo) {
        for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], ipv6: undefined }; }
      } else {
        const addr = parts.slice(2).join(" ");
        for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], ipv6: addr, status: "up" }; }
      }
      return { output: "", state: { ...state, interfaces: newIfs, interfaceCfg: newIfCfg } };
    }
    if (lc === "no shutdown") {
      const newIfs = { ...state.interfaces };
      for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], status: "up" }; }
      return { output: "", state: { ...state, interfaces: newIfs, interfaceCfg: newIfCfg } };
    }
    if (lc === "shutdown") {
      const newIfs = { ...state.interfaces };
      for (const ifn of rangeIfs) { newIfs[ifn] = { ...newIfs[ifn], status: "administratively down" }; }
      return { output: "", state: { ...state, interfaces: newIfs, interfaceCfg: newIfCfg } };
    }
    // Port security
    if (positiveCmd.includes("port-security")) {
      const newPS = { ...state.portSecurity };
      for (const ifn of rangeIfs) {
        if (!newPS[ifn]) newPS[ifn] = {};
        if (isNo) {
          if (positiveCmd === "switchport port-security") newPS[ifn].enabled = false;
          if (positiveParts.includes("maximum")) delete newPS[ifn].max;
          if (positiveParts.includes("violation")) delete newPS[ifn].violation;
          if (positiveParts.includes("sticky")) newPS[ifn].sticky = false;
          if (positiveParts.includes("mac-address") && !positiveParts.includes("sticky")) delete newPS[ifn].staticMac;
        } else {
          if (positiveParts.includes("maximum")) newPS[ifn].max = positiveParts[positiveParts.indexOf("maximum") + 1];
          if (positiveParts.includes("violation")) newPS[ifn].violation = positiveParts[positiveParts.indexOf("violation") + 1];
          if (lc === "switchport port-security") newPS[ifn].enabled = true;
          if (positiveParts.includes("sticky")) newPS[ifn].sticky = true;
          if (positiveParts.includes("mac-address") && !positiveParts.includes("sticky")) {
            const macIdx = positiveParts.indexOf("mac-address");
            if (positiveParts[macIdx + 1]) newPS[ifn].staticMac = positiveParts[macIdx + 1];
          }
        }
      }
      return { output: "", state: { ...state, portSecurity: newPS, interfaceCfg: newIfCfg } };
    }
    // DHCP snooping trust on interface
    if (pFirst === "ip" && positiveParts[1] === "dhcp" && positiveParts[2] === "snooping" && positiveParts[3] === "trust") {
      if (isNo) {
        state.dhcpSnooping = { ...state.dhcpSnooping, trusted: (state.dhcpSnooping.trusted || []).filter(x => x !== iface) };
      } else {
        const trusted = state.dhcpSnooping.trusted || [];
        if (!trusted.includes(iface)) {
          state.dhcpSnooping = { ...state.dhcpSnooping, trusted: [...trusted, iface] };
        }
      }
      return { output: "", state: { ...state, interfaceCfg: newIfCfg } };
    }
    // DAI trust on interface
    if (pFirst === "ip" && positiveParts[1] === "arp" && positiveParts[2] === "inspection" && positiveParts[3] === "trust") {
      const daiTrusted = state.daiConfig.trusted || [];
      if (isNo) {
        state.daiConfig = { ...state.daiConfig, trusted: daiTrusted.filter(x => x !== iface) };
      } else {
        if (!daiTrusted.includes(iface)) {
          state.daiConfig = { ...state.daiConfig, trusted: [...daiTrusted, iface] };
        }
      }
      return { output: "", state: { ...state, interfaceCfg: newIfCfg } };
    }
    // Channel-group
    if (pFirst === "channel-group") {
      if (isNo) {
        return { output: "", state: { ...state, interfaceCfg: newIfCfg } };
      }
      return { output: `Creating a port-channel interface Port-channel${positiveParts[1]}`, state: { ...state, interfaceCfg: newIfCfg } };
    }
    // All other validated commands (spanning-tree, cdp, lldp, description, etc.)
    return { output: "", state: { ...state, interfaceCfg: newIfCfg } };
  }

  // ─── LINE CONFIG ────
  if (state.mode === "config-line") {
    const line = state.currentLine;
    const validLinePrefixes = [
      "login", "password ", "transport ", "exec-timeout", "logging ",
      "access-class ", "privilege ", "length ", "no ",
    ];
    const isNo = first === "no";
    if (!isNo && !validLinePrefixes.some(p => lc.startsWith(p))) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }
    if (!isNo) {
      const v = validateCommand(rawCmd, state);
      if (!v.ok) return { output: v.error, state };
    }
    const newLineCfg = { ...state.lineCfg };
    if (!newLineCfg[line]) newLineCfg[line] = [];
    if (isNo) {
      newLineCfg[line] = cfgRemove(newLineCfg[line], lc);
    } else {
      newLineCfg[line] = cfgAdd(newLineCfg[line], lc);
    }
    return { output: "", state: { ...state, lineCfg: newLineCfg } };
  }

  // ─── ROUTER CONFIG ────
  if (state.mode === "config-router") {
    const router = state.currentRouter;
    const validRtrPrefixes = [
      "network ", "router-id ", "passive-interface", "redistribute ",
      "log-adjacency", "auto-cost", "default-information", "distance ",
      "area ", "no ",
    ];
    const isNo = first === "no";
    if (!isNo && !validRtrPrefixes.some(p => lc.startsWith(p))) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }
    // Syntax validation for router-config commands
    if (!isNo) {
      const v = validateCommand(rawCmd, state);
      if (!v.ok) return { output: v.error, state };
    }
    const newRtrCfg = { ...state.routerCfg };
    if (!newRtrCfg[router]) newRtrCfg[router] = [];
    const positiveParts = isNo ? parts.slice(1) : parts;
    const pFirst = positiveParts[0];

    if (isNo) {
      newRtrCfg[router] = cfgRemove(newRtrCfg[router], lc);
      if (pFirst === "network") {
        const nets = (state.ospfConfig.networks || []).filter(n => n !== lc.replace(/^no\s+/, ""));
        state.ospfConfig = { ...state.ospfConfig, networks: nets };
      }
    } else {
      newRtrCfg[router] = cfgAdd(newRtrCfg[router], lc);
      if (pFirst === "router-id") {
        newRtrCfg[router] = newRtrCfg[router].filter(c => !c.startsWith("router-id") || c === lc);
        state.ospfConfig = { ...state.ospfConfig, routerId: parts[1] };
      }
      if (pFirst === "network") {
        const nets = state.ospfConfig.networks || [];
        if (!nets.includes(lc)) {
          state.ospfConfig = { ...state.ospfConfig, networks: [...nets, lc] };
        }
      }
    }
    return { output: "", state: { ...state, routerCfg: newRtrCfg } };
  }

  // ─── VLAN CONFIG ────
  if (state.mode === "config-vlan") {
    if (first === "name") {
      const name = rawCmd.replace(/^name\s+/i, "");
      return { output: "", state: { ...state, vlans: { ...state.vlans, [state.currentVlan]: name }, vlanCfg: { ...state.vlanCfg, [state.currentVlan]: name } } };
    }
    if (first === "no") return { output: "", state };
    return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
  }

  // ─── ACL CONFIG ────
  if (state.mode === "config-acl" || state.mode === "config-ext-acl") {
    const acl = state.currentAcl;
    const validAclPrefixes = ["permit ", "deny ", "remark ", "no "];
    if (!validAclPrefixes.some(p => lc.startsWith(p))) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }
    // Validate permit/deny syntax
    if (first === "permit" || first === "deny") {
      const v = validateCommand(rawCmd, state);
      if (!v.ok) return { output: v.error, state };
    }
    const newAclCfg = { ...state.aclCfg };
    if (!newAclCfg[acl]) newAclCfg[acl] = [];
    if (first === "no") {
      newAclCfg[acl] = cfgRemove(newAclCfg[acl], lc);
    } else {
      newAclCfg[acl] = cfgAdd(newAclCfg[acl], lc);
    }
    return { output: "", state: { ...state, aclCfg: newAclCfg } };
  }

  // ─── DHCP POOL CONFIG ────
  if (state.mode === "config-dhcp") {
    const pool = state.currentDhcpPool;
    const validDhcpPrefixes = [
      "network ", "default-router ", "dns-server ", "domain-name ",
      "lease ", "option ", "no ",
    ];
    if (!validDhcpPrefixes.some(p => lc.startsWith(p))) {
      return { output: `% Invalid input detected at '^' marker.\n\n  ${rawCmd}\n  ^`, state };
    }
    const newDhcpCfg = { ...state.dhcpCfg };
    if (!newDhcpCfg[pool]) newDhcpCfg[pool] = [];
    if (first === "no") {
      newDhcpCfg[pool] = cfgRemove(newDhcpCfg[pool], lc);
    } else {
      newDhcpCfg[pool] = cfgAdd(newDhcpCfg[pool], lc);
    }
    return { output: "", state: { ...state, dhcpCfg: newDhcpCfg } };
  }

  return { output: "", state };
}


