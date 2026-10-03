// iosValidate.js — IOS command syntax validation
// Returns { ok: true } or { ok: false, error: "message" }

// ─── Primitives ──────────────────────────────────────────────────────────────

function isValidOctet(s) {
  const n = parseInt(s, 10);
  return /^\d{1,3}$/.test(s) && n >= 0 && n <= 255;
}

function isValidIp(s) {
  if (!s) return false;
  const parts = s.split(".");
  return parts.length === 4 && parts.every(isValidOctet);
}

// Valid subnet masks (only proper contiguous masks)
const VALID_MASKS = new Set([
  "0.0.0.0","128.0.0.0","192.0.0.0","224.0.0.0","240.0.0.0",
  "248.0.0.0","252.0.0.0","254.0.0.0","255.0.0.0",
  "255.128.0.0","255.192.0.0","255.224.0.0","255.240.0.0",
  "255.248.0.0","255.252.0.0","255.254.0.0","255.255.0.0",
  "255.255.128.0","255.255.192.0","255.255.224.0","255.255.240.0",
  "255.255.248.0","255.255.252.0","255.255.254.0","255.255.255.0",
  "255.255.255.128","255.255.255.192","255.255.255.224","255.255.255.240",
  "255.255.255.248","255.255.255.252","255.255.255.254","255.255.255.255",
]);

function isValidMask(s) {
  return VALID_MASKS.has(s);
}

// Wildcard mask: each octet 0-255, must be 255-mask style (inverse of valid mask)
function isValidWildcard(s) {
  if (!s) return false;
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  if (!parts.every(isValidOctet)) return false;
  // Reconstruct as potential mask and check
  const asMask = parts.map(o => (255 - parseInt(o)).toString()).join(".");
  return VALID_MASKS.has(asMask);
}

function isValidVlan(s) {
  const n = parseInt(s, 10);
  return /^\d+$/.test(s) && n >= 1 && n <= 4094;
}

function isValidAd(s) {
  const n = parseInt(s, 10);
  return /^\d+$/.test(s) && n >= 1 && n <= 255;
}

function isValidPort(s) {
  const n = parseInt(s, 10);
  return /^\d+$/.test(s) && n >= 0 && n <= 65535;
}

function isValidPrefix(s) {
  // e.g. 2001:db8::/32 or /64
  if (!s) return false;
  const slash = s.indexOf("/");
  if (slash === -1) return false;
  const bits = parseInt(s.slice(slash + 1), 10);
  return bits >= 0 && bits <= 128;
}

function isValidCgNum(s) {
  const n = parseInt(s, 10);
  return /^\d+$/.test(s) && n >= 1 && n <= 64;
}

// ─── Error helpers ───────────────────────────────────────────────────────────

function err(msg) { return { ok: false, error: msg }; }
function ok() { return { ok: true }; }
function incomplete() { return { ok: false, error: "% Incomplete command." }; }
function invalid(rawCmd, marker) {
  if (marker) {
    const spaces = " ".repeat(marker);
    return { ok: false, error: `% Invalid input detected at '^' marker.\n\n${rawCmd}\n${spaces}^` };
  }
  return { ok: false, error: `% Invalid input detected at '^' marker.\n\n${rawCmd}\n^` };
}

// ─── Per-command validators ──────────────────────────────────────────────────

// ip route <network> <mask> {<next-hop> | <interface>} [<ad>] [permanent] [name <tag>]
export function validateIpRoute(rawCmd, parts) {
  // parts[0]="ip" parts[1]="route" parts[2]=net parts[3]=mask parts[4]=nh [parts[5]=ad]
  const net = parts[2];
  const mask = parts[3];
  const nh = parts[4];

  if (!net) return incomplete();
  if (!isValidIp(net)) return invalid(rawCmd, rawCmd.indexOf(net));

  if (!mask) return incomplete();
  if (!isValidMask(mask)) {
    return invalid(rawCmd, rawCmd.indexOf(mask));
  }

  if (!nh) return incomplete();
  // next-hop can be IP or interface name (starts with letter)
  if (!/^[a-zA-Z]/.test(nh) && !isValidIp(nh)) {
    return invalid(rawCmd, rawCmd.lastIndexOf(nh));
  }

  // optional AD
  const ad = parts[5];
  if (ad && !isValidAd(ad)) {
    return err(`% Bad administrative distance: "${ad}". Valid range: 1-255`);
  }

  return ok();
}

// ipv6 route <prefix/len> {<next-hop> | <interface>} [<ad>]
export function validateIpv6Route(rawCmd, parts) {
  const prefix = parts[2];
  const nh = parts[3];

  if (!prefix) return incomplete();
  if (!prefix.includes("/")) return invalid(rawCmd, rawCmd.indexOf(prefix));

  if (!nh) return incomplete();

  const ad = parts[4];
  if (ad && !isValidAd(ad)) {
    return err(`% Bad administrative distance: "${ad}". Valid range: 1-255`);
  }

  return ok();
}

// ip address <ip> <mask> [secondary]
export function validateIpAddress(rawCmd, parts) {
  const ip = parts[2];
  const mask = parts[3];

  if (!ip) return incomplete();
  if (ip === "dhcp") return ok();
  if (!isValidIp(ip)) return invalid(rawCmd, rawCmd.indexOf(ip));

  if (!mask) return incomplete();
  if (!isValidMask(mask)) return invalid(rawCmd, rawCmd.lastIndexOf(mask));

  return ok();
}

// ipv6 address <prefix/len> [eui-64 | link-local | anycast]
export function validateIpv6Address(rawCmd, parts) {
  const addr = parts[2];
  if (!addr) return incomplete();
  // Must contain / for prefix or be a full address
  if (!addr.includes(":")) return invalid(rawCmd, rawCmd.indexOf(addr));
  return ok();
}

// switchport access vlan <1-4094>
export function validateSwAccessVlan(rawCmd, parts) {
  const vid = parts[3];
  if (!vid) return incomplete();
  if (!isValidVlan(vid)) return invalid(rawCmd, rawCmd.lastIndexOf(vid));
  return ok();
}

// switchport trunk native vlan <1-4094>
export function validateSwTrunkNative(rawCmd, parts) {
  const vid = parts[4];
  if (!vid) return incomplete();
  if (!isValidVlan(vid)) return invalid(rawCmd, rawCmd.lastIndexOf(vid));
  return ok();
}

// switchport trunk allowed vlan <list|add|remove|except|all|none>
export function validateSwTrunkAllowed(rawCmd, parts) {
  const arg = parts[4];
  if (!arg) return incomplete();
  const keywords = ["all", "none", "add", "remove", "except"];
  if (keywords.includes(arg)) return ok();
  // Validate VLAN list: "10,20,30-50"
  const ids = arg.split(",");
  for (const id of ids) {
    if (id.includes("-")) {
      const [a, b] = id.split("-").map(Number);
      if (!isValidVlan(String(a)) || !isValidVlan(String(b)) || a > b) {
        return invalid(rawCmd, rawCmd.lastIndexOf(arg));
      }
    } else if (!isValidVlan(id)) {
      return invalid(rawCmd, rawCmd.lastIndexOf(id));
    }
  }
  return ok();
}

// switchport voice vlan <1-4094 | dot1p | none | untagged>
export function validateSwVoiceVlan(rawCmd, parts) {
  const arg = parts[3];
  if (!arg) return incomplete();
  if (["dot1p", "none", "untagged"].includes(arg)) return ok();
  if (!isValidVlan(arg)) return invalid(rawCmd, rawCmd.lastIndexOf(arg));
  return ok();
}

// switchport mode <access | trunk | dynamic auto | dynamic desirable>
export function validateSwMode(rawCmd, parts) {
  const mode = parts[2];
  if (!mode) return incomplete();
  const valid = ["access", "trunk"];
  const dynamic = parts[3];
  if (mode === "dynamic") {
    if (!dynamic) return incomplete();
    if (!["auto", "desirable"].includes(dynamic)) return invalid(rawCmd, rawCmd.lastIndexOf(dynamic));
    return ok();
  }
  if (!valid.includes(mode)) return invalid(rawCmd, rawCmd.lastIndexOf(mode));
  return ok();
}

// switchport port-security [maximum <1-3072> | violation <protect|restrict|shutdown> | mac-address <mac>]
export function validatePortSecurity(rawCmd, parts) {
  const sub = parts[2];
  if (!sub) return ok(); // bare "switchport port-security" is valid
  if (sub === "maximum") {
    const n = parseInt(parts[3], 10);
    if (!parts[3]) return incomplete();
    if (isNaN(n) || n < 1 || n > 3072) return err(`% Invalid maximum value. Valid range: 1-3072`);
    return ok();
  }
  if (sub === "violation") {
    const mode = parts[3];
    if (!mode) return incomplete();
    if (!["protect", "restrict", "shutdown"].includes(mode)) return invalid(rawCmd, rawCmd.lastIndexOf(mode));
    return ok();
  }
  if (sub === "mac-address") {
    const mac = parts[3];
    if (!mac && parts[2] !== "sticky") return incomplete();
    return ok();
  }
  return ok();
}

// channel-group <1-64> mode <active|passive|on|desirable|auto>
export function validateChannelGroup(rawCmd, parts) {
  const num = parts[1];
  if (!num) return incomplete();
  if (!isValidCgNum(num)) return err(`% Invalid channel-group number: ${num}. Valid range: 1-64`);

  const modeKw = parts[2];
  if (!modeKw) return incomplete();
  if (modeKw !== "mode") return invalid(rawCmd, rawCmd.lastIndexOf(modeKw));

  const mode = parts[3];
  if (!mode) return incomplete();
  if (!["active", "passive", "on", "desirable", "auto"].includes(mode)) {
    return invalid(rawCmd, rawCmd.lastIndexOf(mode));
  }
  return ok();
}

// ip ospf <process-id> area <area-id>
export function validateIpOspfIf(rawCmd, parts) {
  const pid = parts[2];
  if (!pid) return incomplete();
  if (!/^\d+$/.test(pid)) return invalid(rawCmd, rawCmd.lastIndexOf(pid));

  const areaKw = parts[3];
  if (!areaKw) return incomplete();
  if (areaKw !== "area") return invalid(rawCmd, rawCmd.lastIndexOf(areaKw));

  const area = parts[4];
  if (!area) return incomplete();
  return ok();
}

// ip ospf priority <0-255>
export function validateOspfPriority(rawCmd, parts) {
  // parts: ip ospf priority <n>
  const n = parseInt(parts[3], 10);
  if (!parts[3]) return incomplete();
  if (isNaN(n) || n < 0 || n > 255) return err(`% Invalid OSPF priority. Valid range: 0-255`);
  return ok();
}

// router ospf <1-65535>
export function validateRouterOspf(rawCmd, parts) {
  const pid = parts[2];
  if (!pid) return incomplete();
  const n = parseInt(pid, 10);
  if (isNaN(n) || n < 1 || n > 65535) return err(`% Invalid process ID. Valid range: 1-65535`);
  return ok();
}

// network <ip> <wildcard> area <area-id>
export function validateOspfNetwork(rawCmd, parts) {
  const ip = parts[1];
  const wc = parts[2];
  const areaKw = parts[3];
  const area = parts[4];

  if (!ip) return incomplete();
  if (!isValidIp(ip)) return invalid(rawCmd, rawCmd.indexOf(ip));
  if (!wc) return incomplete();
  if (!isValidWildcard(wc)) return invalid(rawCmd, rawCmd.lastIndexOf(wc));
  if (!areaKw) return incomplete();
  if (areaKw !== "area") return invalid(rawCmd, rawCmd.lastIndexOf(areaKw));
  if (!area) return incomplete();
  return ok();
}

// ip nat inside source list <acl> interface <if> [overload]
// ip nat inside source static <local-ip> <global-ip>
export function validateNat(rawCmd, parts) {
  if (parts[2] !== "inside" && parts[2] !== "outside") {
    if (!parts[2]) return incomplete();
    return invalid(rawCmd, rawCmd.lastIndexOf(parts[2]));
  }
  return ok(); // complex — accept if it starts correctly
}

// ip dhcp pool <name>
export function validateDhcpPool(rawCmd, parts) {
  if (!parts[3]) return incomplete();
  return ok();
}

// ip dhcp excluded-address <low> [<high>]
export function validateDhcpExcluded(rawCmd, parts) {
  const low = parts[3];
  if (!low) return incomplete();
  if (!isValidIp(low)) return invalid(rawCmd, rawCmd.lastIndexOf(low));
  const high = parts[4];
  if (high && !isValidIp(high)) return invalid(rawCmd, rawCmd.lastIndexOf(high));
  return ok();
}

// username <name> privilege <0-15> {secret|password} <pw>
export function validateUsername(rawCmd, parts) {
  if (!parts[1]) return incomplete();
  // Must have at least a password or secret keyword somewhere
  const hasSecret = parts.includes("secret") || parts.includes("password");
  if (!hasSecret) return incomplete();
  const privIdx = parts.indexOf("privilege");
  if (privIdx !== -1) {
    const level = parseInt(parts[privIdx + 1], 10);
    if (isNaN(level) || level < 0 || level > 15) {
      return err(`% Invalid privilege level. Valid range: 0-15`);
    }
  }
  return ok();
}

// vlan <1-4094>
export function validateVlan(rawCmd, parts) {
  const vid = parts[1];
  if (!vid) return incomplete();
  // Allow comma-separated or range
  const ids = vid.split(",");
  for (const id of ids) {
    if (id.includes("-")) {
      const [a, b] = id.split("-").map(Number);
      if (!isValidVlan(String(a)) || !isValidVlan(String(b))) return invalid(rawCmd, rawCmd.lastIndexOf(vid));
    } else if (!isValidVlan(id)) {
      return invalid(rawCmd, rawCmd.lastIndexOf(vid));
    }
  }
  return ok();
}

// transport input <ssh|telnet|all|none>
export function validateTransportInput(rawCmd, parts) {
  const proto = parts[2];
  if (!proto) return incomplete();
  const valid = ["ssh", "telnet", "all", "none"];
  if (!valid.includes(proto)) return invalid(rawCmd, rawCmd.lastIndexOf(proto));
  return ok();
}

// ntp master [<stratum>] | ntp server <ip> [prefer]
export function validateNtp(rawCmd, parts) {
  const sub = parts[1];
  if (!sub) return incomplete();
  if (sub === "server") {
    const ip = parts[2];
    if (!ip) return incomplete();
    if (!isValidIp(ip)) return invalid(rawCmd, rawCmd.lastIndexOf(ip));
  }
  return ok();
}

// ip dhcp snooping vlan <1-4094>
export function validateDhcpSnooping(rawCmd, parts) {
  if (parts[3] === "vlan") {
    const vid = parts[4];
    if (!vid) return incomplete();
    if (!isValidVlan(vid)) return invalid(rawCmd, rawCmd.lastIndexOf(vid));
  }
  return ok();
}

// ip arp inspection vlan <1-4094>
// ip arp inspection validate <dst-mac|src-mac|ip> [...]
export function validateDai(rawCmd, parts) {
  if (parts[3] === "vlan") {
    const vid = parts[4];
    if (!vid) return incomplete();
    if (!isValidVlan(vid)) return invalid(rawCmd, rawCmd.lastIndexOf(vid));
  }
  if (parts[3] === "validate") {
    const valid = ["dst-mac", "src-mac", "ip"];
    const args = parts.slice(4);
    if (args.length === 0) return incomplete();
    for (const a of args) {
      if (!valid.includes(a)) return invalid(rawCmd, rawCmd.lastIndexOf(a));
    }
  }
  return ok();
}

// permit / deny in ACL context
export function validateAclEntry(rawCmd, parts, isExtended) {
  const action = parts[0]; // permit or deny
  if (!parts[1]) return incomplete();

  if (!isExtended) {
    // Standard ACL: permit/deny {<ip>|host <ip>|any} [<wildcard>]
    const src = parts[1];
    if (src === "host") {
      if (!parts[2]) return incomplete();
      if (!isValidIp(parts[2])) return invalid(rawCmd, rawCmd.lastIndexOf(parts[2]));
    } else if (src !== "any") {
      if (!isValidIp(src)) return invalid(rawCmd, rawCmd.lastIndexOf(src));
      if (parts[2] && !isValidWildcard(parts[2])) return invalid(rawCmd, rawCmd.lastIndexOf(parts[2]));
    }
    return ok();
  }

  // Extended ACL: permit/deny <proto> <src> [<src-wc>] <dst> [<dst-wc>] [eq <port>] ...
  const proto = parts[1];
  const validProtos = ["ip", "tcp", "udp", "icmp", "ospf", "eigrp", "gre", "esp", "ah"];
  if (!validProtos.includes(proto)) return invalid(rawCmd, rawCmd.lastIndexOf(proto));
  if (!parts[2]) return incomplete();
  return ok();
}

// encapsulation dot1q <vlan-id>
export function validateEncapDot1q(rawCmd, parts) {
  const vid = parts[2];
  if (!vid) return incomplete();
  if (!isValidVlan(vid)) return invalid(rawCmd, rawCmd.lastIndexOf(vid));
  return ok();
}

// spanning-tree portfast / bpduguard / vlan / mode etc.
export function validateSpanningTree(rawCmd, parts, inInterface) {
  const sub = inInterface ? parts[1] : parts[1];
  if (!sub) return incomplete();
  return ok();
}

// ─── Master dispatcher ───────────────────────────────────────────────────────
// Call this from iosCommands before accepting a command into config

export function validateCommand(rawCmd, state) {
  const lc = rawCmd.trim().toLowerCase();
  const parts = lc.split(/\s+/);
  const isNo = parts[0] === "no";
  const p = isNo ? parts.slice(1) : parts; // positive parts
  const pRaw = isNo ? rawCmd.replace(/^no\s+/i, "") : rawCmd; // positive raw

  // no-commands: only validate that what follows is structurally valid
  // e.g. "no ip route" without args is fine — it's incomplete but IOS handles it differently
  // For simplicity: skip deep validation on no-forms (just check first keywords)
  if (isNo) return ok();

  const cmd = p.join(" ");

  // ip route
  if (p[0] === "ip" && p[1] === "route") return validateIpRoute(rawCmd, p);
  // ipv6 route
  if (p[0] === "ipv6" && p[1] === "route") return validateIpv6Route(rawCmd, p);
  // ip address
  if (p[0] === "ip" && p[1] === "address") return validateIpAddress(rawCmd, p);
  // ipv6 address
  if (p[0] === "ipv6" && p[1] === "address") return validateIpv6Address(rawCmd, p);

  // switchport
  if (p[0] === "switchport") {
    if (!p[1]) return incomplete();
    if (p[1] === "mode") return validateSwMode(rawCmd, p);
    if (p[1] === "access" && p[2] === "vlan") return validateSwAccessVlan(rawCmd, p);
    if (p[1] === "trunk" && p[2] === "native" && p[3] === "vlan") return validateSwTrunkNative(rawCmd, p);
    if (p[1] === "trunk" && p[2] === "allowed" && p[3] === "vlan") return validateSwTrunkAllowed(rawCmd, p);
    if (p[1] === "trunk" && p[2] === "encapsulation") {
      if (!p[3]) return incomplete();
      if (p[3] !== "dot1q" && p[3] !== "isl" && p[3] !== "negotiate") return invalid(rawCmd, rawCmd.lastIndexOf(p[3]));
      return ok();
    }
    if (p[1] === "voice" && p[2] === "vlan") return validateSwVoiceVlan(rawCmd, p);
    if (p[1] === "port-security") return validatePortSecurity(rawCmd, p);
    if (p[1] === "nonegotiate") return ok();
    if (p[1] === "access" && !p[2]) return incomplete();
    if (p[1] === "trunk" && !p[2]) return incomplete();
    return ok();
  }

  // channel-group
  if (p[0] === "channel-group") return validateChannelGroup(rawCmd, p);

  // ip ospf (interface level)
  if (p[0] === "ip" && p[1] === "ospf") {
    if (!p[2]) return incomplete();
    if (p[2] === "priority") return validateOspfPriority(rawCmd, p);
    if (p[3] === "area") return validateIpOspfIf(rawCmd, p);
    return ok();
  }

  // router ospf (global config)
  if (p[0] === "router" && p[1] === "ospf") return validateRouterOspf(rawCmd, p);

  // network (router config)
  if (p[0] === "network" && state?.mode === "config-router") return validateOspfNetwork(rawCmd, p);

  // ip nat
  if (p[0] === "ip" && p[1] === "nat") return validateNat(rawCmd, p);

  // ip dhcp pool
  if (p[0] === "ip" && p[1] === "dhcp" && p[2] === "pool") return validateDhcpPool(rawCmd, p);
  // ip dhcp excluded-address
  if (p[0] === "ip" && p[1] === "dhcp" && p[2] === "excluded-address") return validateDhcpExcluded(rawCmd, p);
  // ip dhcp snooping
  if (p[0] === "ip" && p[1] === "dhcp" && p[2] === "snooping") return validateDhcpSnooping(rawCmd, p);

  // ip arp inspection
  if (p[0] === "ip" && p[1] === "arp" && p[2] === "inspection") return validateDai(rawCmd, p);

  // username
  if (p[0] === "username") return validateUsername(rawCmd, p);

  // vlan
  if (p[0] === "vlan" && state?.mode === "config") return validateVlan(rawCmd, p);

  // transport input
  if (p[0] === "transport" && p[1] === "input") return validateTransportInput(rawCmd, p);

  // ntp
  if (p[0] === "ntp") return validateNtp(rawCmd, p);

  // encapsulation dot1q
  if (p[0] === "encapsulation" && p[1] === "dot1q") return validateEncapDot1q(rawCmd, p);

  // permit / deny (ACL context)
  if (p[0] === "permit" || p[0] === "deny") {
    const isExt = state?.mode === "config-ext-acl";
    return validateAclEntry(rawCmd, p, isExt);
  }

  // spanning-tree
  if (p[0] === "spanning-tree") return validateSpanningTree(rawCmd, p, state?.mode === "config-if");

  return ok();
}

