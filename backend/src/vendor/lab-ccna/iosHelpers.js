// iosHelpers.js — Device state, prompt, interface normalization, config helpers

// ─── CISCO IOS CLI EMULATOR v2 ─────────────────────────────────────────────
export function createDeviceState(device) {
  return {
    hostname: device.hostname,
    type: device.type,
    mode: "user",
    currentInterface: null,
    currentLine: null,
    currentRouter: null,
    currentVlan: null,
    currentAcl: null,
    currentDhcpPool: null,
    // Structured running config
    globalCmds: [],
    interfaceCfg: {},
    lineCfg: {},
    routerCfg: {},
    vlanCfg: {},
    aclCfg: {},
    dhcpCfg: {},
    // State
    interfaces: JSON.parse(JSON.stringify(device.interfaces)),
    vlans: { 1: "default" },
    staticRoutes: [],
    staticRoutesV6: [],
    ospfConfig: {},
    users: [],
    natRules: [],
    dhcpExcluded: [],
    dhcpSnooping: { enabled: false, vlans: [], options: {} },
    daiConfig: { vlans: [], validate: [] },
    portSecurity: {},
    cdpGlobal: true,
    lldpGlobal: false,
    ntpConfig: {},
    sshConfigured: false,
    commandHistory: [],
  };
}

export function getPrompt(state) {
  const h = state.hostname;
  switch (state.mode) {
    case "user": return `${h}>`;
    case "privileged": return `${h}#`;
    case "config": return `${h}(config)#`;
    case "config-if": return `${h}(config-if)#`;
    case "config-subif": return `${h}(config-subif)#`;
    case "config-line": return `${h}(config-line)#`;
    case "config-router": return `${h}(config-router)#`;
    case "config-vlan": return `${h}(config-vlan)#`;
    case "config-acl": return `${h}(config-std-nacl)#`;
    case "config-ext-acl": return `${h}(config-ext-nacl)#`;
    case "config-dhcp": return `${h}(dhcp-config)#`;
    default: return `${h}#`;
  }
}

// Normalize interface name (handle abbreviations)
export function normalizeInterface(input) {
  const map = {
    "e": "Ethernet", "et": "Ethernet", "eth": "Ethernet", "ethernet": "Ethernet",
    "f": "FastEthernet", "fa": "FastEthernet", "fas": "FastEthernet", "fastethernet": "FastEthernet",
    "g": "GigabitEthernet", "gi": "GigabitEthernet", "gig": "GigabitEthernet", "gigabitethernet": "GigabitEthernet",
    "l": "Loopback", "lo": "Loopback", "loop": "Loopback", "loopback": "Loopback",
    "p": "Port-channel", "po": "Port-channel", "port-channel": "Port-channel",
    "s": "Serial", "se": "Serial", "ser": "Serial", "serial": "Serial",
    "v": "Vlan", "vl": "Vlan", "vlan": "Vlan",
  };
  const m = input.match(/^([a-zA-Z-]+)\s*(.*)$/);
  if (!m) return input;
  const prefix = map[m[1].toLowerCase()] || m[1];
  return prefix + m[2].replace(/\s+/g, "");
}

// Parse an interface range like "Ethernet0/2 - 3" → ["Ethernet0/2", "Ethernet0/3"]
export function parseInterfaceRange(input) {
  // Handle comma-separated groups: "e0/0, e0/2-3" or "e0/0 - 1, e0/3"
  const groups = input.split(/\s*,\s*/);
  const result = [];
  for (const group of groups) {
    const dashParts = group.split(/\s*-\s*/);
    if (dashParts.length === 2) {
      const base = normalizeInterface(dashParts[0].trim());
      const endNum = dashParts[1].trim();
      const match = base.match(/^(.+\/)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const startNum = parseInt(match[2]);
        const end = parseInt(endNum);
        for (let i = startNum; i <= end; i++) result.push(`${prefix}${i}`);
      } else {
        result.push(base);
      }
    } else {
      result.push(normalizeInterface(group.trim()));
    }
  }
  return result.length ? result : [normalizeInterface(input)];
}

// ─── CONFIG HELPERS: dedup + no-command support ────────────────────────────
export function cfgAdd(arr, cmd) {
  const c = cmd.trim().toLowerCase();
  if (!c) return arr;
  // Some cmds replace (ip address, switchport mode, switchport access vlan, etc)
  const replaceKeys = [
    "ip address ", "ipv6 address ", "switchport mode ", "switchport access vlan ",
    "switchport voice vlan ", "switchport trunk native vlan ", "switchport trunk allowed vlan ",
    "switchport trunk encapsulation ", "switchport port-security maximum ",
    "switchport port-security violation ", "ip ospf priority ", "channel-group ",
    "ip ospf ", "router-id ",
  ];
  for (const key of replaceKeys) {
    if (c.startsWith(key)) {
      return [...arr.filter(x => !x.startsWith(key)), c];
    }
  }
  if (arr.includes(c)) return arr; // dedup
  return [...arr, c];
}

export function cfgRemove(arr, noCmd) {
  // noCmd is "no switchport mode access" → remove "switchport mode access"
  // Never adds the "no X" form — callers handle that explicitly for default-on cmds
  const positive = noCmd.replace(/^no\s+/, "").trim().toLowerCase();
  if (!positive) return arr;
  return arr.filter(x => x !== positive && !x.startsWith(positive + " "));
}

export function cfgSet(arr, cmd) {
  // For commands where only the no-form is meaningful (like "no cdp enable")
  const c = cmd.trim().toLowerCase();
  if (arr.includes(c)) return arr;
  return [...arr, c];
}


