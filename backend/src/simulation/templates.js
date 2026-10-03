const iface = (ip = "") => ({ status: "up", ...(ip ? { ip } : {}) });
const ruleTask = (device, text, rules, hint, points = 10) => ({ device, text, rules, hint, points });
const base = { engine: "netsim-v1", category: "Cisco", access: "FREE", durationMinutes: 30, topology: "Physical connections are shown in the diagram. Do not change the preconfigured PC addresses." };
export const NETSIM_TEMPLATES = [
  {
    ...base, templateId: -101, title: "CCNA · VLANs and switch trunks",
    instructions: "Configure VLAN 10 (SALES) on both switches. Connect the PCs through VLAN 10 and an inter-switch trunk. Save both switch configurations. Use PC1 to verify connectivity to PC2. Each task is graded from the final configuration; equivalent command sequences are accepted.",
    devices: [
      { name: "SW1", type: "switch", interfaces: { "FastEthernet0/1": iface(), "FastEthernet0/2": iface() } },
      { name: "SW2", type: "switch", interfaces: { "FastEthernet0/1": iface(), "FastEthernet0/2": iface() } },
      { name: "PC1", type: "host", interfaces: { eth0: iface("192.168.10.10/24") } },
      { name: "PC2", type: "host", interfaces: { eth0: iface("192.168.10.20/24") }, console: false },
    ],
    links: [
      { fromDevice: "PC1", fromInterface: "eth0", toDevice: "SW1", toInterface: "FastEthernet0/1" },
      { fromDevice: "SW1", fromInterface: "FastEthernet0/2", toDevice: "SW2", toInterface: "FastEthernet0/2" },
      { fromDevice: "SW2", fromInterface: "FastEthernet0/1", toDevice: "PC2", toInterface: "eth0" },
    ],
    tasks: [
      ...["SW1", "SW2"].flatMap(device => [
        ruleTask(device, `Create VLAN 10 on ${device} and assign FastEthernet0/1 as an access port in VLAN 10.`, [{ type: "vlan", value: "10" }, { type: "access_vlan", interface: "FastEthernet0/1", value: "10" }], "enable\nconfigure terminal\nvlan 10\nname SALES\nexit\ninterface FastEthernet0/1\nswitchport mode access\nswitchport access vlan 10\nend", 20),
        ruleTask(device, `Configure FastEthernet0/2 on ${device} as a trunk.`, [{ type: "trunk", interface: "FastEthernet0/2" }], "enable\nconfigure terminal\ninterface FastEthernet0/2\nswitchport mode trunk\nend", 20),
        ruleTask(device, `Save the final configuration on ${device}.`, [{ type: "saved" }], "end\ncopy running-config startup-config", 5),
      ]),
      ruleTask("PC1", "Verify that PC1 can reach PC2 at 192.168.10.20.", [{ type: "ping", value: "192.168.10.20", expect: "success" }], "ping 192.168.10.20", 10),
    ],
  },
  {
    ...base, templateId: -102, title: "CCNA · Static routing between LANs",
    instructions: "PC1 and PC2 are on different LANs. Configure forward and return static routes on R1 and R2, then save both configurations. Do not change interface addresses. Verify end-to-end connectivity from PC1.",
    devices: [
      { name: "R1", type: "router", interfaces: { "GigabitEthernet0/0": iface("10.0.0.1/30"), "GigabitEthernet0/1": iface("192.168.10.1/24") } },
      { name: "R2", type: "router", interfaces: { "GigabitEthernet0/0": iface("10.0.0.2/30"), "GigabitEthernet0/1": iface("192.168.20.1/24") } },
      { name: "PC1", type: "host", gateway: "192.168.10.1", interfaces: { eth0: iface("192.168.10.10/24") } },
      { name: "PC2", type: "host", gateway: "192.168.20.1", interfaces: { eth0: iface("192.168.20.10/24") }, console: false },
    ],
    links: [
      { fromDevice: "R1", fromInterface: "GigabitEthernet0/0", toDevice: "R2", toInterface: "GigabitEthernet0/0" },
      { fromDevice: "PC1", fromInterface: "eth0", toDevice: "R1", toInterface: "GigabitEthernet0/1" },
      { fromDevice: "PC2", fromInterface: "eth0", toDevice: "R2", toInterface: "GigabitEthernet0/1" },
    ],
    tasks: [
      ruleTask("R1", "Route 192.168.20.0/24 through 10.0.0.2.", [{ type: "static_route", value: "192.168.20.0/24", nextHop: "10.0.0.2" }], "enable\nconfigure terminal\nip route 192.168.20.0 255.255.255.0 10.0.0.2\nend", 35),
      ruleTask("R2", "Route 192.168.10.0/24 through 10.0.0.1.", [{ type: "static_route", value: "192.168.10.0/24", nextHop: "10.0.0.1" }], "enable\nconfigure terminal\nip route 192.168.10.0 255.255.255.0 10.0.0.1\nend", 35),
      ...["R1", "R2"].map(d => ruleTask(d, `Save ${d}'s final configuration.`, [{ type: "saved" }], "end\ncopy running-config startup-config", 5)),
      ruleTask("PC1", "Verify connectivity to PC2 at 192.168.20.10.", [{ type: "ping", value: "192.168.20.10" }], "ping 192.168.20.10", 20),
    ],
  },
];

NETSIM_TEMPLATES.push({
  ...structuredClone(NETSIM_TEMPLATES[1]), templateId: -103, title: "CCNA · Single-area OSPF",
  instructions: "Configure OSPF process 1 in area 0 on both routers. Advertise the inter-router link and each local LAN. Verify learned routes and end-to-end connectivity, then save both configurations. Interface addresses are preconfigured. This exercise models basic single-area OSPF, not protocol timers or convergence.",
  tasks: [
    ruleTask("R1", "Enable OSPF on R1 and learn 192.168.20.0/24 through OSPF.", [{ type: "ospf_route", value: "192.168.20.0/24" }], "enable\nconfigure terminal\nrouter ospf 1\nnetwork 10.0.0.0 0.0.0.3 area 0\nnetwork 192.168.10.0 0.0.0.255 area 0\nend", 35),
    ruleTask("R2", "Enable OSPF on R2 and learn 192.168.10.0/24 through OSPF.", [{ type: "ospf_route", value: "192.168.10.0/24" }], "enable\nconfigure terminal\nrouter ospf 1\nnetwork 10.0.0.0 0.0.0.3 area 0\nnetwork 192.168.20.0 0.0.0.255 area 0\nend", 35),
    ...["R1", "R2"].map(d => ruleTask(d, `Save ${d}'s final configuration.`, [{ type: "saved" }], "end\ncopy running-config startup-config", 5)),
    ruleTask("PC1", "Verify connectivity to PC2 at 192.168.20.10.", [{ type: "ping", value: "192.168.20.10" }], "ping 192.168.20.10", 20),
  ],
});
