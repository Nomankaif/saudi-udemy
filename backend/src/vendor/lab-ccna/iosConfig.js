// iosConfig.js — Running config builder

export function buildRunningConfig(state) {
  const lines = [
    "Building configuration...",
    "",
    "Current configuration : " + state.hostname,
    "!",
    "version 15.9",
    "service timestamps debug datetime msec",
    "service timestamps log datetime msec",
    "!",
    `hostname ${state.hostname}`,
    "!",
  ];
  // Users
  state.users.forEach(u => lines.push(u.cmd));
  if (state.users.length) lines.push("!");
  // Global commands (filter out items shown in dedicated sections)
  const skipPrefixes = [
    "username", "cdp", "no cdp", "lldp", "no lldp", "ntp",
    "ip route", "ipv6 route", "ip nat", "ip dhcp",
    "ip access-list", "ip arp inspection", "hostname",
  ];
  const displayGlobal = state.globalCmds.filter(c =>
    !skipPrefixes.some(p => c.startsWith(p))
  );
  displayGlobal.forEach(c => lines.push(c));
  if (displayGlobal.length) lines.push("!");
  // LLDP/CDP
  if (state.lldpGlobal) lines.push("lldp run");
  if (!state.cdpGlobal) lines.push("no cdp run");
  // NTP
  Object.keys(state.ntpConfig).forEach(k => lines.push(`ntp ${k}`));
  // DHCP Snooping global
  if (state.dhcpSnooping.enabled) lines.push("ip dhcp snooping");
  state.dhcpSnooping.vlans.forEach(v => lines.push(`ip dhcp snooping vlan ${v}`));
  if (state.dhcpSnooping.options) {
    Object.entries(state.dhcpSnooping.options).forEach(([k, v]) => {
      if (v === false) lines.push(`no ip dhcp snooping ${k}`);
    });
  }
  // DAI
  state.daiConfig.vlans.forEach(v => lines.push(`ip arp inspection vlan ${v}`));
  if (state.daiConfig.validate.length) lines.push(`ip arp inspection validate ${state.daiConfig.validate.join(" ")}`);
  // DHCP Snooping verify
  const snoopVerify = state.globalCmds.filter(c => c.startsWith("ip dhcp snooping verify"));
  snoopVerify.forEach(c => lines.push(c));
  if (state.dhcpSnooping.enabled || state.daiConfig.vlans.length || snoopVerify.length) lines.push("!");
  // ACLs
  Object.entries(state.aclCfg).forEach(([name, entries]) => {
    // Find the original ACL type from globalCmds
    const aclDef = state.globalCmds.find(c => c.includes("access-list") && c.includes(name));
    lines.push(aclDef || `ip access-list extended ${name}`);
    entries.forEach(e => lines.push(` ${e}`));
    lines.push("!");
  });
  // DHCP excluded + pools
  state.dhcpExcluded.forEach(c => lines.push(c));
  Object.entries(state.dhcpCfg).forEach(([name, entries]) => {
    lines.push(`ip dhcp pool ${name}`);
    entries.forEach(e => lines.push(` ${e}`));
    lines.push("!");
  });
  // Static routes
  state.staticRoutes.forEach(r => lines.push(r));
  (state.staticRoutesV6 || []).forEach(r => lines.push(r));
  // NAT
  state.natRules.forEach(r => lines.push(r));
  if (state.staticRoutes.length || (state.staticRoutesV6 || []).length || state.natRules.length) lines.push("!");
  // VLANs
  Object.entries(state.vlanCfg).forEach(([id, name]) => {
    lines.push(`vlan ${id}`);
    if (name) lines.push(` name ${name}`);
    lines.push("!");
  });
  // Interfaces
  Object.entries(state.interfaceCfg).forEach(([iface, cmds]) => {
    if (cmds.length === 0) return;
    lines.push(`interface ${iface}`);
    cmds.forEach(c => lines.push(` ${c}`));
    lines.push("!");
  });
  // Lines
  Object.entries(state.lineCfg).forEach(([line, cmds]) => {
    if (cmds.length === 0) return;
    lines.push(`line ${line}`);
    cmds.forEach(c => lines.push(` ${c}`));
    lines.push("!");
  });
  // Router
  Object.entries(state.routerCfg).forEach(([router, cmds]) => {
    if (cmds.length === 0) return;
    lines.push(`router ${router}`);
    cmds.forEach(c => lines.push(` ${c}`));
    lines.push("!");
  });
  lines.push("!", "end");
  return lines.join("\n");
}


