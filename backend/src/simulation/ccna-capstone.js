// Original practice content for the platform's supported simulation features.
const port = (ip = "", status = "up") => ({ status, ...(ip ? { ip } : {}) });
const commands = (...lines) => lines.join("\n");
const task = (device, text, rules, hint, points = 5) => ({ device, text, rules, hint, points });
const configure = (...lines) => commands("enable", "configure terminal", ...lines, "end");
const link = (fromDevice, fromInterface, toDevice, toInterface) => ({ fromDevice, fromInterface, toDevice, toInterface });
const interfaceTask = (device, iface, ip) => task(device,
  `Configure ${iface} with ${ip} and enable the interface. Both the address and operational state are checked.`,
  [{ type: "interface_ip", interface: iface, value: ip }, { type: "interface_up", interface: iface }],
  configure(`interface ${iface}`, `ip address ${ip.split("/")[0]} ${ip.endsWith("/30") ? "255.255.255.252" : "255.255.255.0"}`, "no shutdown"), 5);

export const CCNA_CAPSTONE = {
  engine: "netsim-v1", title: "CCNA · Campus and Branch Network Capstone",
  category: "Cisco", subcategory: "CCNA", access: "FREE", durationMinutes: 90,
  instructions: `Build connectivity between a small campus and a branch office. This original practice lab covers all 11 grading-rule types currently available in this platform. It is not an official Cisco exam item or a complete implementation of Cisco IOS.

Work through Tasks in order. Configure R1, R2, SW1, SW2, PC1, PC2 and PC4. PC3 is a locked, preconfigured endpoint used to test VLAN isolation. Do not change device names, cables, PC3, or R2's Loopback0 address.

Campus: VLAN 10 (STAFF), 192.168.10.0/24, gateway 192.168.10.1. PC1 = .10 and PC2 = .20.
Isolation test: PC3 = 192.168.10.30/24 on VLAN 20 (ISOLATED). It intentionally shares the IP subnet with the staff PCs but must remain Layer-2 isolated; do not configure routing for VLAN 20.
Branch: 192.168.20.0/24, gateway 192.168.20.1. PC4 = 192.168.20.10.
WAN: R1 = 10.0.12.1/30; R2 = 10.0.12.2/30.
Service endpoint: R2 Loopback0 = 203.0.113.1/32 (already configured).

Use OSPF process 1, area 0, to exchange the campus and branch LAN routes. Add a separate static host route on R1 to R2's service loopback; do not advertise that loopback into OSPF. Save all four network-device configurations after completing your changes.

Enter one command at a time. Use ? for supported commands, Tab for completion, and Up/Down for command history. Click an editable device or its console tab to switch consoles. On PCs use ip ADDRESS/PREFIX GATEWAY, ipconfig, ping and traceroute.

Practice mode provides Check tasks, View solutions, Reset and saved progress. Timed assessment uses the 90-minute limit and reveals grading and solutions after submission. Each task requires all its checks; points are weighted and the final score is a percentage. Ping checks test current connectivity, not whether a particular command was typed. Router/switch settings are graded from final state, including whether startup configuration matches it.

Simulation scope: IPv4 wired networking, VLANs/trunks and basic single-area OSPF. This lab does not claim to model real hardware, OSPF convergence/timers, wireless devices, firewalls or every CCNA technology.`,
  topology: `CAMPUS
PC1 eth0 -- SW1 FastEthernet0/1 (access VLAN 10)
SW1 GigabitEthernet0/1 -- R1 GigabitEthernet0/1 (access VLAN 10, gateway 192.168.10.1)
SW1 GigabitEthernet0/2 -- SW2 GigabitEthernet0/2 (trunk)
SW2 FastEthernet0/1 -- PC2 eth0 (access VLAN 10)
SW2 FastEthernet0/3 -- PC3 eth0 (access VLAN 20; locked isolation endpoint)

WAN AND BRANCH
R1 GigabitEthernet0/0 -- R2 GigabitEthernet0/0 (10.0.12.0/30)
R2 GigabitEthernet0/1 -- PC4 eth0 (branch 192.168.20.0/24)
R2 Loopback0: 203.0.113.1/32, preconfigured service endpoint (no physical cable).

Expected final behaviour: PC1 <-> PC2 and PC1 <-> PC4 reachable; PC1 -> 203.0.113.1 reachable; PC1 -> PC3 blocked by VLAN separation. No inter-VLAN routing is required.`,
  devices: [
    { name: "R1", type: "router", interfaces: { "GigabitEthernet0/0": port("", "administratively down"), "GigabitEthernet0/1": port("", "administratively down") } },
    { name: "R2", type: "router", interfaces: { "GigabitEthernet0/0": port("", "administratively down"), "GigabitEthernet0/1": port("", "administratively down"), Loopback0: port("203.0.113.1/32") } },
    { name: "SW1", type: "switch", interfaces: { "FastEthernet0/1": port(), "GigabitEthernet0/1": port(), "GigabitEthernet0/2": port() } },
    { name: "SW2", type: "switch", interfaces: { "FastEthernet0/1": port(), "FastEthernet0/3": port(), "GigabitEthernet0/2": port() } },
    { name: "PC1", type: "host", interfaces: { eth0: port() } },
    { name: "PC2", type: "host", interfaces: { eth0: port() } },
    { name: "PC3", type: "host", console: false, interfaces: { eth0: port("192.168.10.30/24") } },
    { name: "PC4", type: "host", interfaces: { eth0: port() } },
  ],
  links: [
    link("PC1", "eth0", "SW1", "FastEthernet0/1"),
    link("SW1", "GigabitEthernet0/1", "R1", "GigabitEthernet0/1"),
    link("SW1", "GigabitEthernet0/2", "SW2", "GigabitEthernet0/2"),
    link("SW2", "FastEthernet0/1", "PC2", "eth0"),
    link("SW2", "FastEthernet0/3", "PC3", "eth0"),
    link("R1", "GigabitEthernet0/0", "R2", "GigabitEthernet0/0"),
    link("R2", "GigabitEthernet0/1", "PC4", "eth0"),
  ],
  tasks: [
    interfaceTask("R1", "GigabitEthernet0/0", "10.0.12.1/30"),
    interfaceTask("R1", "GigabitEthernet0/1", "192.168.10.1/24"),
    interfaceTask("R2", "GigabitEthernet0/0", "10.0.12.2/30"),
    interfaceTask("R2", "GigabitEthernet0/1", "192.168.20.1/24"),
    task("SW1", "Create VLAN 10 named STAFF. Make FastEthernet0/1 (PC1) and GigabitEthernet0/1 (R1) access ports in VLAN 10.",
      [{ type: "vlan", value: "10" }, ...["FastEthernet0/1", "GigabitEthernet0/1"].map(iface => ({ type: "access_vlan", interface: iface, value: "10" }))],
      configure("vlan 10", "name STAFF", "exit", "interface FastEthernet0/1", "switchport mode access", "switchport access vlan 10", "exit", "interface GigabitEthernet0/1", "switchport mode access", "switchport access vlan 10")),
    task("SW2", "Create VLAN 10 named STAFF and make FastEthernet0/1 (PC2) an access port in VLAN 10.",
      [{ type: "vlan", value: "10" }, { type: "access_vlan", interface: "FastEthernet0/1", value: "10" }],
      configure("vlan 10", "name STAFF", "exit", "interface FastEthernet0/1", "switchport mode access", "switchport access vlan 10")),
    task("SW2", "Create VLAN 20 named ISOLATED and put FastEthernet0/3 (PC3) in access VLAN 20. Do not route this VLAN.",
      [{ type: "vlan", value: "20" }, { type: "access_vlan", interface: "FastEthernet0/3", value: "20" }],
      configure("vlan 20", "name ISOLATED", "exit", "interface FastEthernet0/3", "switchport mode access", "switchport access vlan 20")),
    ...["SW1", "SW2"].map(device => task(device, "Configure GigabitEthernet0/2 as an enabled trunk to the other switch.",
      [{ type: "trunk", interface: "GigabitEthernet0/2" }, { type: "interface_up", interface: "GigabitEthernet0/2" }],
      configure("interface GigabitEthernet0/2", "switchport mode trunk", "no shutdown"))),
    ...[["PC1", "192.168.10.10", "192.168.10.1"], ["PC2", "192.168.10.20", "192.168.10.1"], ["PC4", "192.168.20.10", "192.168.20.1"]].map(([device, address, gateway]) => task(device,
      `Set eth0 to ${address}/24 and gateway ${gateway}. Inspect the result with ipconfig. Connectivity tasks also verify the gateway.`,
      [{ type: "interface_ip", interface: "eth0", value: `${address}/24` }, { type: "interface_up", interface: "eth0" }], commands(`ip ${address}/24 ${gateway}`, "ipconfig"))),
    ...[["R1", "192.168.10.0", "192.168.20.0"], ["R2", "192.168.20.0", "192.168.10.0"]].map(([device, local, remote]) => task(device,
      `Use OSPF process 1, area 0. Advertise 10.0.12.0/30 and ${local}/24, and learn ${remote}/24 through OSPF. Do not advertise Loopback0.`,
      [{ type: "ospf_route", value: `${remote}/24` }, { type: "config", value: "router ospf 1" }],
      configure("router ospf 1", "network 10.0.12.0 0.0.0.3 area 0", `network ${local} 0.0.0.255 area 0`), 10)),
    task("R1", "Add a static host route to 203.0.113.1/32 via 10.0.12.2 and ensure a route to that prefix is available.",
      [{ type: "static_route", value: "203.0.113.1/32", nextHop: "10.0.12.2" }, { type: "route", value: "203.0.113.1/32" }],
      configure("ip route 203.0.113.1 255.255.255.255 10.0.12.2")),
    task("PC1", "Verify PC2 (192.168.10.20) is reachable across the switch trunk, while PC3 (192.168.10.30) remains unreachable in VLAN 20. Both conditions must hold.",
      [{ type: "ping", value: "192.168.10.20", expect: "success" }, { type: "ping", value: "192.168.10.30", expect: "fail" }], commands("ping 192.168.10.20", "ping 192.168.10.30"), 10),
    task("PC1", "Verify the branch PC4 at 192.168.20.10 is reachable. Use traceroute to inspect the route (the reachability result is graded).",
      [{ type: "ping", value: "192.168.20.10" }], commands("ping 192.168.20.10", "traceroute 192.168.20.10"), 10),
    task("PC4", "Verify return connectivity from PC4 to PC1 at 192.168.10.10.", [{ type: "ping", value: "192.168.10.10" }], "ping 192.168.10.10"),
    task("PC2", "Verify PC2 can reach PC4 at 192.168.20.10 through its gateway and the switch trunk.", [{ type: "ping", value: "192.168.20.10" }], "ping 192.168.20.10"),
    task("PC1", "Verify the service endpoint at 203.0.113.1 is reachable through R1's static route.", [{ type: "ping", value: "203.0.113.1" }], "ping 203.0.113.1"),
    ...["R1", "R2", "SW1", "SW2"].map(device => task(device, `Save the final running configuration on ${device} to startup configuration. Save again if you make later changes.`,
      [{ type: "saved" }], commands("enable", "copy running-config startup-config"))),
  ],
};
