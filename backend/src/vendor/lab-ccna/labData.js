// labData.js — Lab definitions, descriptions, categories

// ─── LAB DATA ────────────────────────────────────────────────────────────────
// Each task now has: hint (solution commands), check (array of keyword arrays to verify)
// check: each inner array = one required command. All inner arrays must match for task to pass.
// A command matches if ALL keywords in the inner array appear in any single command entered on the correct device.

export const LABS = [
  {
    id: 1, title: "Static Routes & OSPF", category: "Routing",
    source: "Q214s",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.10.13.1/24", status: "up" }, "Ethernet0/1": { ip: "10.10.12.1/25", status: "up" }, "Ethernet0/2": { ip: "10.10.12.129/25", status: "up" }, "Loopback0": { ip: "10.10.1.1/32", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.10.31.2/24", status: "up" }, "Ethernet0/1": { ip: "10.10.12.2/25", status: "up" }, "Ethernet0/2": { ip: "10.10.12.130/25", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/0": { ip: "10.10.13.3/24", status: "up" }, "Ethernet0/1": { ip: "10.10.254.3/24", status: "up" } } }
    ],
    topology: `Internet (172.20.20.128/25)\n    |.254\n   R3 (E0/1)\n    |E0/0 .3\n    | 10.10.13.0/24\n    |E0/0 .1\n   R1 ──E0/1(.1)── 10.10.12.0/25 ──E0/1(.2)── R2\n    └──E0/2(.129)── 10.10.12.128/25 ──E0/2(.130)─┘\n                                         E0/0 .2\n                                    10.10.31.0/24\n                                         E0/0 .1\n                                         SW1\n                                    LAN: 192.168.0.0/24`,
    tasks: [
      { id: 1, text: "Configure a static route on R2 to reach the LAN subnet (192.168.0.0/24) via SW1 (10.10.31.1). SW1 is an L3 switch acting as the default gateway for the LAN and is directly connected to R2 via the 10.10.31.0/24 segment.", device: "R2",
        hint: "ip route 192.168.0.0 255.255.255.0 10.10.31.1",
        check: [["ip route","192.168.0.0","255.255.255.0","10.10.31.1"]] },
      { id: 2, text: "Configure default reachability to the Internet subnet in router R1", device: "R1",
        hint: "ip route 0.0.0.0 0.0.0.0 10.10.13.3",
        check: [["ip route","0.0.0.0","0.0.0.0","10.10.13.3"]] },
      { id: 3, text: "Configure a single static route in R2 to reach the Internet subnet (172.20.20.128/25) via both redundant links (ECMP). No default route allowed.", device: "R2",
        hint: "ip route 172.20.20.128 255.255.255.128 10.10.12.1\nip route 172.20.20.128 255.255.255.128 10.10.12.129",
        check: [["ip route","172.20.20.128","255.255.255.128","10.10.12.1"],["ip route","172.20.20.128","255.255.255.128","10.10.12.129"]] },
      { id: 4, text: "Configure static route on R1 toward SW1 LAN. Primary via E0/1 (next-hop 10.10.12.2), backup via E0/2 (floating route, AD 2)", device: "R1",
        hint: "ip route 192.168.0.0 255.255.255.0 10.10.12.2\nip route 192.168.0.0 255.255.255.0 10.10.12.130 2",
        check: [["ip route","192.168.0.0","255.255.255.0","10.10.12.2"],["ip route","192.168.0.0","255.255.255.0","10.10.12.130","2"]] }
    ]
  },
  {
    id: 2, title: "NAT, NTP, DHCP & SSH", category: "IP Services",
    source: "QLab211-Sim1",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.1.1.1/24", status: "up" }, "Ethernet0/2": { ip: "10.1.2.1/24", status: "up" }, "Loopback0": { ip: "192.168.100.1/24", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.1.1.2/24", status: "up" }, "Ethernet0/1": { ip: "10.1.3.1/24", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/1": { ip: "10.1.3.3/24", status: "up" }, "Ethernet0/2": { ip: "dhcp", status: "up" } } }
    ],
    topology: `R1 (Lo0: 192.168.100.1)\n  E0/0 ── 10.1.1.0/24 ── E0/0 R2 E0/1 ── 10.1.3.0/24 ── E0/1 R3\n  E0/2 ── 10.1.2.0/24`,
    tasks: [
      { id: 1, text: "Configure NAT on R2: Translate R3 source to R2 E0/0 IP using standard ACL named PUBNET. No NVI.", device: "R2",
        hint: "ip nat inside source list PUBNET interface Ethernet0/0 overload\nip access-list standard PUBNET\npermit 10.1.3.0 0.0.0.255\ninterface Ethernet0/1\nip nat inside\ninterface Ethernet0/0\nip nat outside",
        check: [["ip nat inside source list","pubnet","interface","ethernet0/0","overload"],["ip access-list standard","pubnet"],["permit","10.1.3.0","0.0.0.255"],["ip nat inside"],["ip nat outside"]] },
      { id: 2, text: "Configure R1 as NTP master server. Set clock to midnight May 1, 2018. Configure R2 as NTP client using R1 E0/2 IP (10.1.2.1).", device: "R1",
        hint: "On R1:\nntp master\nclock set 00:00:00 May 1 2018\n\nOn R2:\nntp server 10.1.2.1",
        check: [["ntp master"]] },
      { id: 3, text: "Configure R1 DHCP server: pool NETPOOL, network 10.1.3.0/24, exclude addresses 1-10.", device: "R1",
        hint: "ip dhcp excluded-address 10.1.3.1 10.1.3.10\nip dhcp pool NETPOOL\nnetwork 10.1.3.0 255.255.255.0",
        check: [["ip dhcp excluded-address","10.1.3.1","10.1.3.10"],["ip dhcp pool","netpool"],["network","10.1.3.0","255.255.255.0"]] },
      { id: 4, text: "Configure SSH on R3: user netadmin/N3t4ccess, privilege 15, RSA 1024 bits, SSH only on 0 4 VTY lines.", device: "R3",
        hint: "username netadmin privilege 15 secret N3t4ccess\nip domain-name lab.local\ncrypto key generate rsa 1024\nline vty 0 4\ntransport input ssh\nlogin local",
        check: [["username","netadmin","privilege","15"],["secret","n3t4ccess"],["crypto key generate rsa"],["transport input ssh"],["login local"]] }
    ]
  },
  {
    id: 3, title: "VLANs & Access Ports", category: "Switching",
    source: "QLab211-Sim2",
    devices: [
      { name: "SW1", type: "switch", hostname: "SW1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW2", type: "switch", hostname: "SW2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `SW1 (E0/0) ──── VLAN 12 ──── (E0/0) SW2\n │E0/1                          │E0/1\n Phone+PC                       PC\n VLAN 12+34                   VLAN "Available"`,
    tasks: [
      { id: 1, text: "Configure VLAN 12 named Compute and VLAN 34 named Telephony on SW1", device: "SW1",
        hint: "vlan 12\nname Compute\nvlan 34\nname Telephony",
        check: [["vlan","12"],["name","compute"],["vlan","34"],["name","telephony"]] },
      { id: 2, text: "Configure E0/1 on SW2 as access port using the existing VLAN named Available", device: "SW2",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan <Available VLAN ID>",
        check: [["switchport mode access"],["switchport access vlan"]] },
      { id: 3, text: "Configure E0/0 on both switches as access ports for VLAN 12", device: "SW1",
        hint: "interface Ethernet0/0\nswitchport mode access\nswitchport access vlan 12\n\n! Also on SW2:\ninterface Ethernet0/0\nswitchport mode access\nswitchport access vlan 12",
        check: [["switchport mode access"],["switchport access vlan","12"]] },
      { id: 4, text: "Configure E0/1 on SW1 with data VLAN 12 and voice VLAN 34", device: "SW1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 12\nswitchport voice vlan 34",
        check: [["switchport access vlan","12"],["switchport voice vlan","34"]] },
      { id: 5, text: "Disable CDP on E0/1 of SW2 (interface only, not globally)", device: "SW2",
        hint: "interface Ethernet0/1\nno cdp enable",
        check: [["no cdp enable"]] }
    ]
  },
  {
    id: 4, title: "User Account, ACL & DHCP Snooping (Variant A)", category: "Security",
    source: "Q213",
    devices: [
      { name: "Gw1", type: "router", hostname: "Gw1", interfaces: { "Ethernet0/0": { ip: "10.10.10.1/24", status: "up" } } },
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `Internet ── Gw1 ── Sw1 ── PCs\n               VLAN 10`,
    tasks: [
      { id: 1, text: "Configure local account on Gw1: username wheel, password lock3path, algorithm scrypt, exec privilege. Telnet only on VTY 0-4.", device: "Gw1",
        hint: "username wheel privilege 15 algorithm-type scrypt secret lock3path\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","wheel","privilege","15","algorithm-type","scrypt"],["secret","lock3path"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Configure NACL CORP_ACL on Gw1: allow BOOTP (UDP 67-68) and HTTPS (TCP 443), deny all other traffic with log-input", device: "Gw1",
        hint: "ip access-list extended CORP_ACL\npermit udp any any range 67 68\npermit tcp any any eq 443\ndeny ip any any log-input",
        check: [["ip access-list extended","corp_acl"],["permit udp","67","68"],["permit tcp","443"],["deny ip any any log-input"]] },
      { id: 3, text: "Configure DHCP Snooping on Sw1: enable for VLAN 10, disable Option-82, enable MAC verification, set trusted interfaces", device: "Sw1",
        hint: "ip dhcp snooping\nip dhcp snooping vlan 10\nno ip dhcp snooping information option\nip dhcp snooping verify mac-address\ninterface Ethernet0/0\nip dhcp snooping trust",
        check: [["ip dhcp snooping vlan","10"],["no ip dhcp snooping information option"],["ip dhcp snooping verify mac-address"],["ip dhcp snooping trust"]] }
    ]
  },
  {
    id: 5, title: "User Account, ACL & DHCP Snooping (Variant B)", category: "Security",
    source: "Q214",
    devices: [
      { name: "Gw1", type: "router", hostname: "Gw1", interfaces: { "Ethernet0/0": { ip: "10.10.10.1/24", status: "up" } } },
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `Internet ── Gw1 ── Sw1 ── PCs\n               VLAN 10`,
    tasks: [
      { id: 1, text: "Configure local account on Gw1: username wheel, password lock3path, algorithm scrypt, exec privilege. Telnet only on VTY 0-4.", device: "Gw1",
        hint: "username wheel privilege 15 algorithm-type scrypt secret lock3path\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","wheel","privilege","15","algorithm-type","scrypt"],["secret","lock3path"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Configure NACL CORP_ACL on Gw1: allow BOOTP and HTTPS, deny rest with log-input", device: "Gw1",
        hint: "ip access-list extended CORP_ACL\npermit udp any any range 67 68\npermit tcp any any eq 443\ndeny ip any any log-input",
        check: [["ip access-list extended","corp_acl"],["permit udp","67","68"],["permit tcp","443"],["deny ip any any log-input"]] },
      { id: 3, text: "Configure DHCP Snooping on Sw1: enable for VLAN 10, disable Option-82, enable MAC verification, set trusted interfaces", device: "Sw1",
        hint: "ip dhcp snooping\nip dhcp snooping vlan 10\nno ip dhcp snooping information option\nip dhcp snooping verify mac-address\ninterface Ethernet0/0\nip dhcp snooping trust",
        check: [["ip dhcp snooping vlan","10"],["no ip dhcp snooping information option"],["ip dhcp snooping verify mac-address"],["ip dhcp snooping trust"]] }
    ]
  },
  {
    id: 6, title: "OSPF Configuration", category: "Routing",
    source: "Q227",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.10.12.1/30", status: "up" }, "Ethernet0/1": { ip: "10.10.13.1/30", status: "up" }, "Loopback1": { ip: "1.1.1.1/32", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.10.12.2/30", status: "up" }, "Ethernet0/1": { ip: "10.10.23.2/30", status: "up" }, "Loopback1": { ip: "2.2.2.2/32", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/0": { ip: "10.10.23.3/30", status: "up" }, "Ethernet0/1": { ip: "10.10.13.3/30", status: "up" }, "Loopback1": { ip: "3.3.3.3/32", status: "up" } } }
    ],
    topology: `R1 (Lo1: 1.1.1.1) ──E0/0── 10.10.12.0/30 ──E0/0── R2 (Lo1: 2.2.2.2)\n │E0/1                                              │E0/1\n 10.10.13.0/30                                   10.10.23.0/30\n │E0/1                                              │E0/0\n R3 (Lo1: 3.3.3.3)`,
    tasks: [
      { id: 1, text: "Configure R1 router-id as 10.10.12.1 and R2 router-id as 10.10.12.2 (shared link IPs)", device: "R1",
        hint: "router ospf 1\nrouter-id 10.10.12.1\n\n! On R2:\nrouter ospf 1\nrouter-id 10.10.12.2",
        check: [["router ospf"],["router-id","10.10.12.1"]] },
      { id: 2, text: "Set R2 OSPF priority to max (255) on E0/0 and E0/1 so R2 becomes DR. R1 and R3 keep defaults.", device: "R2",
        hint: "interface Ethernet0/0\nip ospf priority 255\ninterface Ethernet0/1\nip ospf priority 255",
        check: [["ip ospf priority","255"]] },
      { id: 3, text: "Advertise each router's Loopback1 in OSPF using host wildcard mask (0.0.0.0) on all three routers", device: "R1",
        hint: "router ospf 1\nnetwork 1.1.1.1 0.0.0.0 area 0\n\n! On R2: network 2.2.2.2 0.0.0.0 area 0\n! On R3: network 3.3.3.3 0.0.0.0 area 0",
        check: [["network","0.0.0.0","area"]] },
      { id: 4, text: "Configure passive-interface on R1 E0/1 and R3 E0/1 (the R1-R3 link) to prevent new OSPF neighbors", device: "R1",
        hint: "router ospf 1\npassive-interface Ethernet0/1\n\n! On R3:\nrouter ospf 1\npassive-interface Ethernet0/1",
        check: [["passive-interface"]] }
    ]
  },
  {
    id: 7, title: "Static Routes to ISP & LAN", category: "Routing",
    source: "Q244",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.0.12.1/30", status: "up" }, "Ethernet0/1": { ip: "10.0.13.1/30", status: "up" }, "Ethernet0/2": { ip: "209.165.200.225/27", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.0.12.2/30", status: "up" }, "Ethernet0/1": { ip: "10.0.24.2/30", status: "up" }, "Ethernet0/2": { ip: "209.165.200.226/27", status: "up" } } }
    ],
    topology: `ISP (209.165.200.224/27)\n  │E0/2\n  R1 ──E0/0── 10.0.12.0/30 ──E0/0── R2\n  │E0/1                              │E0/1\n  10.0.13.0/30 ──R3                  10.0.24.0/30 ──R4\n                                     LAN: 10.0.41.0/24`,
    tasks: [
      { id: 1, text: "Configure a default route on R2 to the ISP (via 209.165.200.225)", device: "R2",
        hint: "ip route 0.0.0.0 0.0.0.0 209.165.200.225",
        check: [["ip route","0.0.0.0","0.0.0.0"]] },
      { id: 2, text: "Configure a default route on R1 to the ISP (via 209.165.200.226 or directly connected)", device: "R1",
        hint: "ip route 0.0.0.0 0.0.0.0 209.165.200.226",
        check: [["ip route","0.0.0.0","0.0.0.0"]] },
      { id: 3, text: "Configure R2 with a route to the LAN subnet (10.0.41.0/24) via R4 (10.0.24.4)", device: "R2",
        hint: "ip route 10.0.41.0 255.255.255.0 10.0.24.4",
        check: [["ip route","10.0.41.0","255.255.255.0","10.0.24.4"]] },
      { id: 4, text: "Configure R1 with a route to the LAN (10.0.41.0/24) that prefers R3 as primary path and R2 as floating backup (AD 2)", device: "R1",
        hint: "ip route 10.0.41.0 255.255.255.0 10.0.13.3\nip route 10.0.41.0 255.255.255.0 10.0.12.2 2",
        check: [["ip route","10.0.41.0","255.255.255.0","10.0.13.3"],["ip route","10.0.41.0","255.255.255.0","10.0.12.2","2"]] }
    ]
  },
  {
    id: 8, title: "VLANs, CDP & LLDP", category: "Switching",
    source: "Q252-Sim1",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } }
    ],
    topology: `R1──(E0/0)SW-1(E0/2)──(E0/2)SW-2(E0/0)──R2\n          │E0/1              │E0/1\n          PC1(VLAN15)        PC2(VLAN66)`,
    tasks: [
      { id: 1, text: "Configure VLAN 15 named OPS on SW-1", device: "SW-1",
        hint: "vlan 15\nname OPS",
        check: [["vlan","15"],["name","ops"]] },
      { id: 2, text: "Configure VLAN 66 named ENGINEERING on SW-2", device: "SW-2",
        hint: "vlan 66\nname ENGINEERING",
        check: [["vlan","66"],["name","engineering"]] },
      { id: 3, text: "Configure SW-1 E0/1 as access port for VLAN 15 (PC1)", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 15",
        check: [["switchport mode access"],["switchport access vlan","15"]] },
      { id: 4, text: "Configure SW-2 E0/1 as access port for VLAN 66 (PC2)", device: "SW-2",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 66",
        check: [["switchport mode access"],["switchport access vlan","66"]] },
      { id: 5, text: "Enable LLDP on E0/2 (vendor-neutral) and ensure CDP stays on E0/0 (Cisco proprietary) on both switches", device: "SW-1",
        hint: "interface Ethernet0/2\nlldp transmit\nlldp receive\nno cdp enable\ninterface Ethernet0/0\ncdp enable",
        check: [["lldp transmit"],["lldp receive"]] }
    ]
  },
  {
    id: 9, title: "VLANs, LLDP & Access Ports", category: "Switching",
    source: "Q252-Sim2",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `R1──SW-1(E0/1)──PC1(VLAN35)\n      │E0/0\n      │E0/0\n    SW-2(E0/1)──PC2(VLAN39)`,
    tasks: [
      { id: 1, text: "Configure VLAN 35 named SALES on SW-1", device: "SW-1",
        hint: "vlan 35\nname SALES",
        check: [["vlan","35"],["name","sales"]] },
      { id: 2, text: "Configure VLAN 39 named MARKETING on SW-2", device: "SW-2",
        hint: "vlan 39\nname MARKETING",
        check: [["vlan","39"],["name","marketing"]] },
      { id: 3, text: "Configure SW-1 E0/1 as access port for PC1 (VLAN 35)", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 35",
        check: [["switchport mode access"],["switchport access vlan","35"]] },
      { id: 4, text: "Configure SW-2 E0/1 as access port for PC2 (VLAN 39)", device: "SW-2",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 39",
        check: [["switchport mode access"],["switchport access vlan","39"]] },
      { id: 5, text: "Enable LLDP globally on both switches, disable LLDP on SW-1 E0/1 (PC1 interface)", device: "SW-1",
        hint: "lldp run\ninterface Ethernet0/1\nno lldp transmit\nno lldp receive\n\n! On SW-2:\nlldp run",
        check: [["lldp run"],["no lldp transmit"]] }
    ]
  },
  {
    id: 10, title: "Trunking, Native VLAN & LACP", category: "Switching",
    source: "Q254",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-3", type: "switch", hostname: "SW-3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `SW-1(E0/0,E0/1)══Po══(E0/0,E0/1)SW-2\n │E0/2                          │E0/2\n SW-3(E0/0)              SW-3(E0/1)`,
    tasks: [
      { id: 1, text: "Configure SW-1 and SW-2 E0/0 and E0/1 as 802.1q trunks allowing all VLANs", device: "SW-1",
        hint: "interface Ethernet0/0\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\ninterface Ethernet0/1\nswitchport trunk encapsulation dot1q\nswitchport mode trunk",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"]] },
      { id: 2, text: "Set native VLAN 35 on inter-switch links: SW-1 E0/2, SW-2 E0/2, SW-3 E0/0 and E0/1", device: "SW-1",
        hint: "interface Ethernet0/2\nswitchport trunk native vlan 35",
        check: [["switchport trunk native vlan","35"]] },
      { id: 3, text: "Configure LACP on SW-1 E0/0+E0/1 (active) and SW-2 E0/0+E0/1 (passive)", device: "SW-1",
        hint: "interface Ethernet0/0\nchannel-group 1 mode active\ninterface Ethernet0/1\nchannel-group 1 mode active\n\n! On SW-2:\ninterface Ethernet0/0\nchannel-group 1 mode passive\ninterface Ethernet0/1\nchannel-group 1 mode passive",
        check: [["channel-group","mode active"]] }
    ]
  },
  {
    id: 11, title: "Trunking, LACP & Native VLAN", category: "Switching",
    source: "Q257",
    devices: [
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } },
      { name: "SW-3", type: "switch", hostname: "SW-3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } }
    ],
    topology: `SW-1══(E0/0)SW-2(E0/2,E0/3)══Po══(E0/2,E0/3)SW-3(E0/0)══SW-4\n              VLAN 10,11`,
    tasks: [
      { id: 1, text: "Configure SW-2 and SW-3 E0/0 as 802.1q trunks allowing only VLAN 10", device: "SW-2",
        hint: "interface Ethernet0/0\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 10",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk allowed vlan","10"]] },
      { id: 2, text: "Set native VLAN 11 on SW-2 and SW-3 E0/0 for untagged traffic", device: "SW-2",
        hint: "interface Ethernet0/0\nswitchport trunk native vlan 11",
        check: [["switchport trunk native vlan","11"]] },
      { id: 3, text: "Configure SW-2 and SW-3 E0/2+E0/3 as 802.1q trunks allowing all VLANs", device: "SW-2",
        hint: "interface Ethernet0/2\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\ninterface Ethernet0/3\nswitchport trunk encapsulation dot1q\nswitchport mode trunk",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"]] },
      { id: 4, text: "Configure LACP: SW-2 E0/2+E0/3 passive, SW-3 E0/2+E0/3 active, use designated port-channel number", device: "SW-2",
        hint: "interface Ethernet0/2\nchannel-group 1 mode passive\ninterface Ethernet0/3\nchannel-group 1 mode passive\n\n! On SW-3:\ninterface Ethernet0/2\nchannel-group 1 mode active\ninterface Ethernet0/3\nchannel-group 1 mode active",
        check: [["channel-group","mode passive"]] }
    ]
  },
  {
    id: 12, title: "Trunk Filtering, LACP & Native VLAN", category: "Switching",
    source: "Q262",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-3", type: "switch", hostname: "SW-3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-4", type: "switch", hostname: "SW-4", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `R1──(E0/0)SW-1(E0/1)──(E0/1)SW-2(E0/2)──SW-3/SW-4\n VLANs 5,6,77`,
    tasks: [
      { id: 1, text: "Configure SW-1 E0/0 trunk to permit only VLANs 5 and 6", device: "SW-1",
        hint: "interface Ethernet0/0\nswitchport trunk allowed vlan 5,6",
        check: [["switchport trunk allowed vlan","5","6"]] },
      { id: 2, text: "Configure SW-1 and SW-2 E0/1 with native VLAN 77 for untagged traffic", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport trunk native vlan 77",
        check: [["switchport trunk native vlan","77"]] },
      { id: 3, text: "Configure SW-2 E0/2 trunk to permit only VLAN 6", device: "SW-2",
        hint: "interface Ethernet0/2\nswitchport trunk allowed vlan 6",
        check: [["switchport trunk allowed vlan","6"]] },
      { id: 4, text: "Configure LACP: SW-3 E0/0+E0/1 active, SW-4 E0/0+E0/1 passive", device: "SW-3",
        hint: "interface Ethernet0/0\nchannel-group 1 mode active\ninterface Ethernet0/1\nchannel-group 1 mode active\n\n! On SW-4:\ninterface Ethernet0/0\nchannel-group 1 mode passive\ninterface Ethernet0/1\nchannel-group 1 mode passive",
        check: [["channel-group","mode active"]] }
    ]
  },
  {
    id: 13, title: "User Account, ACL & DHCP Snooping (Variant C)", category: "Security",
    source: "Q267",
    devices: [
      { name: "Sw103", type: "switch", hostname: "Sw103", interfaces: { "Ethernet0/0": { status: "up" } } },
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "172.16.0.1/16", status: "up" } } },
      { name: "Sw101", type: "switch", hostname: "Sw101", interfaces: { "Ethernet0/0": { status: "up" } } }
    ],
    topology: `Internet ── R1 ── Sw101 ── Sw103 ── PCs\n               VLAN 101`,
    tasks: [
      { id: 1, text: "Configure local account on Sw103: username devnet, password access8cli, SHA256, exec privilege. Telnet on VTY 0-4.", device: "Sw103",
        hint: "username devnet privilege 15 algorithm-type sha256 secret access8cli\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","devnet","privilege","15","algorithm-type","sha256"],["secret","access8cli"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Modify NACL INTERNET_ACL on R1: allow HTTPS from 172.16.0.0/16, allow telnet for VLAN 101 only, deny rest with log-input", device: "R1",
        hint: "ip access-list extended INTERNET_ACL\npermit tcp 172.16.0.0 0.0.255.255 any eq 443\npermit tcp <VLAN101-subnet> <wildcard> any eq 23\ndeny ip any any log-input",
        check: [["ip access-list extended","internet_acl"],["permit tcp","172.16","443"],["deny ip any any log-input"]] },
      { id: 3, text: "Configure DHCP Snooping on Sw101: enable for VLAN 101, disable Option-82, enable MAC verification", device: "Sw101",
        hint: "ip dhcp snooping\nip dhcp snooping vlan 101\nno ip dhcp snooping information option\nip dhcp snooping verify mac-address",
        check: [["ip dhcp snooping vlan","101"],["no ip dhcp snooping information option"],["ip dhcp snooping verify mac-address"]] }
    ]
  },
  {
    id: 14, title: "IPv4 & IPv6 Subnetting", category: "IP Services",
    source: "Q268-Sim1",
    devices: [
      { name: "Sw101", type: "switch", hostname: "Sw101", interfaces: { "Ethernet0/0": { status: "up" } } },
      { name: "Sw102", type: "switch", hostname: "Sw102", interfaces: { "Ethernet0/0": { status: "up" } } }
    ],
    topology: `Sw101(E0/0) ──── (E0/0)Sw102\n  64 sites needed\n  IPv4: 10.30.64.0/19\n  IPv6: 2001:db8::/56`,
    tasks: [
      { id: 1, text: "Subnet 10.30.64.0/19 for 64 sites, max hosts. Use 2nd subnet: assign first usable IP to Sw101 E0/0, last usable to Sw102 E0/0", device: "Sw101",
        hint: "! /19 into 64 subnets = /25 (128 hosts each)\n! 1st subnet: 10.30.64.0/25 (unavailable)\n! 2nd subnet: 10.30.64.128/25\n! First usable: 10.30.64.129, Last usable: 10.30.64.254\n\ninterface Ethernet0/0\nip address 10.30.64.129 255.255.255.128\nno shutdown\n\n! On Sw102:\ninterface Ethernet0/0\nip address 10.30.64.254 255.255.255.128\nno shutdown",
        check: [["ip address","10.30.64.129","255.255.255.128"]] },
      { id: 2, text: "Subnet 2001:db8::/56 for 64 sites. Use 2nd subnet. Assign IPv6 GUA with EUI-64 on both switches E0/0", device: "Sw101",
        hint: "! /56 into 64 subnets = /62... but we need /64 for EUI-64\n! 2nd /64 subnet: 2001:db8:0:1::/64\n\ninterface Ethernet0/0\nipv6 address 2001:db8:0:1::/64 eui-64\nno shutdown\n\n! On Sw102:\ninterface Ethernet0/0\nipv6 address 2001:db8:0:1::/64 eui-64\nno shutdown",
        check: [["ipv6 address","2001:db8","eui-64"]] }
    ]
  },
  {
    id: 15, title: "IPv6 Static & Floating Routes", category: "Routing",
    source: "Q268-Sim2",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "2001:db8:12::1/64", status: "up" }, "Ethernet0/1": { ip: "2001:db8:13::1/64", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "2001:db8:12::2/64", status: "up" }, "Ethernet0/1": { ip: "2001:db8:24::2/64", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/0": { ip: "2001:db8:34::3/64", status: "up" }, "Ethernet0/1": { ip: "2001:db8:13::3/64", status: "up" } } }
    ],
    topology: `R1 ──E0/0── R2 ──E0/1── 2001:db8:41::/64\n │E0/1\n R3 ──E0/0── 2001:db8:41::/64 (backup)`,
    tasks: [
      { id: 1, text: "Configure IPv6 route on R1 to 2001:db8:41::/64 via R2 (preferred, default AD)", device: "R1",
        hint: "ipv6 route 2001:db8:41::/64 2001:db8:12::2",
        check: [["ipv6 route","2001:db8:41::/64","2001:db8:12::2"]] },
      { id: 2, text: "Configure floating IPv6 route on R1 to 2001:db8:41::/64 via R3 (higher AD for backup)", device: "R1",
        hint: "ipv6 route 2001:db8:41::/64 2001:db8:13::3 2",
        check: [["ipv6 route","2001:db8:41::/64","2001:db8:13::3","2"]] }
    ]
  },
  {
    id: 16, title: "Voice VLAN, LLDP & CDP", category: "Switching",
    source: "Q269",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `R1──(E0/0)SW-1(E0/2)──(E0/0)SW-2\n          │E0/1              │E0/1\n         Phone+PC            PC2`,
    tasks: [
      { id: 1, text: "Configure SW-1 E0/1 for IP phone + PC (access + voice VLANs)", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 10\nswitchport voice vlan 20",
        check: [["switchport access vlan"],["switchport voice vlan"]] },
      { id: 2, text: "Configure SW-2 E0/1 as access port for PC2", device: "SW-2",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 10",
        check: [["switchport mode access"],["switchport access vlan"]] },
      { id: 3, text: "Configure VLAN 10 named Engineering on SW-1", device: "SW-1",
        hint: "vlan 10\nname Engineering",
        check: [["vlan","10"],["name","engineering"]] },
      { id: 4, text: "Enable LLDP (vendor-neutral) on the link between SW-1 and SW-2 (E0/2 and E0/0)", device: "SW-1",
        hint: "interface Ethernet0/2\nlldp transmit\nlldp receive\n\n! On SW-2 E0/0:\nlldp transmit\nlldp receive",
        check: [["lldp transmit"],["lldp receive"]] },
      { id: 5, text: "Disable CDP on SW-1 E0/0 (link to R1)", device: "SW-1",
        hint: "interface Ethernet0/0\nno cdp enable",
        check: [["no cdp enable"]] }
    ]
  },
  {
    id: 17, title: "Voice & Data VLANs + LLDP", category: "Switching",
    source: "Q270-Sim1",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } }
    ],
    topology: `Sw1(E0/0)──(E0/0)Sw2\n │E0/1,E0/2,E0/3      │E0/1,E0/2,E0/3\n Phone+PCs             Phone+PCs\n Data VLAN 10 (DATA)   Voice VLAN 20 (VOICE)`,
    tasks: [
      { id: 1, text: "Configure VLAN 10 named DATA and VLAN 20 named VOICE on both Sw1 and Sw2", device: "Sw1",
        hint: "vlan 10\nname DATA\nvlan 20\nname VOICE",
        check: [["vlan","10"],["name","data"],["vlan","20"],["name","voice"]] },
      { id: 2, text: "Configure E0/1, E0/2, E0/3 on both switches for data + voice (IP phones and PCs)", device: "Sw1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 10\nswitchport voice vlan 20\ninterface Ethernet0/2\nswitchport mode access\nswitchport access vlan 10\nswitchport voice vlan 20\ninterface Ethernet0/3\nswitchport mode access\nswitchport access vlan 10\nswitchport voice vlan 20",
        check: [["switchport mode access"],["switchport access vlan","10"],["switchport voice vlan","20"]] },
      { id: 3, text: "Enable LLDP (vendor-neutral) on E0/0 of both Sw1 and Sw2", device: "Sw1",
        hint: "interface Ethernet0/0\nlldp transmit\nlldp receive\n\n! or globally: lldp run",
        check: [["lldp"]] }
    ]
  },
  {
    id: 18, title: "Trunking & LACP with Allowed VLANs", category: "Switching",
    source: "Q270-Sim2",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `SW-3──(E0/2)SW-1(E0/0,E0/1)══Po══(E0/0,E0/1)SW-2──SW-4\n       VLANs 1,12,22`,
    tasks: [
      { id: 1, text: "Configure SW-1 and SW-2 E0/0+E0/1 as 802.1q trunks, permit only VLANs 1, 12, and 22", device: "SW-1",
        hint: "interface Ethernet0/0\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 1,12,22\ninterface Ethernet0/1\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 1,12,22",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk allowed vlan","1","12","22"]] },
      { id: 2, text: "Configure SW-1 E0/2 as 802.1q trunk with only VLANs 12 and 22", device: "SW-1",
        hint: "interface Ethernet0/2\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 12,22",
        check: [["switchport trunk allowed vlan","12","22"]] },
      { id: 3, text: "Configure LACP on SW-1 and SW-2 E0/0+E0/1: both sides active (immediately negotiate)", device: "SW-1",
        hint: "interface Ethernet0/0\nchannel-group 1 mode active\ninterface Ethernet0/1\nchannel-group 1 mode active\n\n! On SW-2 same: channel-group 1 mode active",
        check: [["channel-group","mode active"]] }
    ]
  },
  {
    id: 19, title: "NAT Pool, DHCP, NTP & SSH", category: "IP Services",
    source: "Q272-Sim1",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.1.1.1/24", status: "up" }, "Ethernet0/2": { ip: "10.1.2.1/24", status: "up" }, "Loopback0": { ip: "192.168.100.1/24", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.1.1.2/24", status: "up" }, "Ethernet0/1": { ip: "10.1.3.1/24", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/1": { ip: "10.1.3.3/24", status: "up" }, "Ethernet0/2": { ip: "dhcp", status: "up" } } }
    ],
    topology: `R1(Lo0:192.168.100.1) ── R2 ── R3\n  10.1.1.0/24      10.1.3.0/24`,
    tasks: [
      { id: 1, text: "Configure dynamic 1-to-1 NAT on R2: ACL XLATE permits R3 subnet, pool test_pool uses 10.10.10.0/24. Mark inside/outside interfaces.", device: "R2",
        hint: "ip nat pool test_pool 10.10.10.1 10.10.10.254 netmask 255.255.255.0\nip nat inside source list XLATE pool test_pool\nip access-list standard XLATE\npermit 10.1.3.0 0.0.0.255\ninterface Ethernet0/1\nip nat inside\ninterface Ethernet0/0\nip nat outside",
        check: [["ip nat pool","test_pool","10.10.10"],["ip nat inside source list","xlate","pool","test_pool"],["ip access-list standard","xlate"],["permit","10.1.3.0","0.0.0.255"],["ip nat inside"],["ip nat outside"]] },
      { id: 2, text: "Configure R3 E0/2 to receive IP via DHCP", device: "R3",
        hint: "interface Ethernet0/2\nip address dhcp\nno shutdown",
        check: [["ip address dhcp"]] },
      { id: 3, text: "Configure R1 as NTP master, R2 as NTP client using R1 IP 10.1.2.1", device: "R1",
        hint: "ntp master\n\n! On R2:\nntp server 10.1.2.1",
        check: [["ntp master"]] },
      { id: 4, text: "Configure SSH on R3: user root/s3cret, privilege 15, RSA keys, SSH only on VTY lines", device: "R3",
        hint: "username root privilege 15 secret s3cret\nip domain-name lab.local\ncrypto key generate rsa 1024\nline vty 0 4\ntransport input ssh\nlogin local",
        check: [["username","root","privilege","15"],["secret","s3cret"],["crypto key generate rsa"],["transport input ssh"],["login local"]] }
    ]
  },
  {
    id: 20, title: "VLAN, Access Ports & CDP", category: "Switching",
    source: "Q272-Sim2",
    devices: [
      { name: "SW-1", type: "switch", hostname: "SW-1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-2", type: "switch", hostname: "SW-2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "SW-3", type: "switch", hostname: "SW-3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `SW-1(E0/1)──PC1  SW-2(E0/1)──PC2  SW-3(E0/1)──PC3\n VLAN 99 FINANCIAL on all switches`,
    tasks: [
      { id: 1, text: "Configure VLAN 99 named FINANCIAL on all three switches", device: "SW-1",
        hint: "vlan 99\nname FINANCIAL\n\n! Same on SW-2 and SW-3",
        check: [["vlan","99"],["name","financial"]] },
      { id: 2, text: "Configure E0/1 as access port for VLAN 99 on all switches (PC ports)", device: "SW-1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan 99",
        check: [["switchport mode access"],["switchport access vlan","99"]] },
      { id: 3, text: "Re-enable CDP globally on SW-1 (it was disabled)", device: "SW-1",
        hint: "cdp run",
        check: [["cdp run"]] },
      { id: 4, text: "Disable CDP on SW-1 E0/1 so PC1 cannot discover SW-1", device: "SW-1",
        hint: "interface Ethernet0/1\nno cdp enable",
        check: [["no cdp enable"]] }
    ]
  },
  {
    id: 21, title: "User Account, ACL & DAI", category: "Security",
    source: "Q274",
    devices: [
      { name: "Sw3", type: "switch", hostname: "Sw3", interfaces: { "Ethernet0/0": { status: "up" } } },
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.0.0.1/24", status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" } } }
    ],
    topology: `ISP ── R1 ── Sw2 ── Sw3 ── PCs\n               VLAN 5`,
    tasks: [
      { id: 1, text: "Configure local account on Sw3: username tech12, password load1key, MD5, exec privilege. Telnet on VTY 0-4.", device: "Sw3",
        hint: "username tech12 privilege 15 algorithm-type md5 secret load1key\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","tech12","privilege","15","algorithm-type","md5"],["secret","load1key"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Configure NACL ISP_ACL on R1: deny RFC1918 class A (10.0.0.0/8) and class B (172.16.0.0/12), permit all other. Apply inbound on E0/0.", device: "R1",
        hint: "ip access-list extended ISP_ACL\ndeny ip 10.0.0.0 0.255.255.255 any\ndeny ip 172.16.0.0 0.15.255.255 any\npermit ip any any\ninterface Ethernet0/0\nip access-group ISP_ACL in",
        check: [["ip access-list extended","isp_acl"],["deny ip","10.0.0.0","0.255.255.255"],["deny ip","172.16.0.0","0.15.255.255"],["permit ip any any"],["ip access-group","isp_acl","in"]] },
      { id: 3, text: "Configure DAI on Sw2: VLAN 5, validate dst-mac, src-mac, and IP", device: "Sw2",
        hint: "ip arp inspection vlan 5\nip arp inspection validate dst-mac src-mac ip",
        check: [["ip arp inspection vlan","5"],["ip arp inspection validate"]] }
    ]
  },
  {
    id: 22, title: "Trunk + LACP with Native VLAN", category: "Switching",
    source: "Q275",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `Sw1(E0/0,E0/1)══Po20══(E0/0,E0/1)Sw2\n PC1(VLAN110)                  PC2(VLAN110)\n Native VLAN 99`,
    tasks: [
      { id: 1, text: "Configure 802.1q trunks on E0/0+E0/1 (both switches), native VLAN 99, allow only VLAN 110 and 99", device: "Sw1",
        hint: "interface Ethernet0/0\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk native vlan 99\nswitchport trunk allowed vlan 99,110\ninterface Ethernet0/1\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk native vlan 99\nswitchport trunk allowed vlan 99,110",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk native vlan","99"],["switchport trunk allowed vlan","99","110"]] },
      { id: 2, text: "Configure LACP port-channel 20 on E0/0+E0/1, both sides active (IEEE 802.3ad)", device: "Sw1",
        hint: "interface Ethernet0/0\nchannel-group 20 mode active\ninterface Ethernet0/1\nchannel-group 20 mode active\n\n! Same on Sw2",
        check: [["channel-group","20","mode active"]] }
    ]
  },
  {
    id: 23, title: "VLANs, Access Ports & LLDP", category: "Switching",
    source: "Q276-Sim1",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } }
    ],
    topology: `Sw1(E0/0)──(E0/0)Sw2\n │E0/1,E0/2,E0/3      │E0/1,E0/2,E0/3\n PCs per VLAN          PCs per VLAN`,
    tasks: [
      { id: 1, text: "Configure VLANs with the naming as indicated in the topology on both Sw1 and Sw2", device: "Sw1",
        hint: "vlan <id>\nname <name>\n! Repeat for each required VLAN",
        check: [["vlan"],["name"]] },
      { id: 2, text: "Assign VLANs to interfaces as access ports (non-trunking, single VLAN per port)", device: "Sw1",
        hint: "interface Ethernet0/1\nswitchport mode access\nswitchport access vlan <id>\n! Repeat for E0/2, E0/3",
        check: [["switchport mode access"],["switchport access vlan"]] },
      { id: 3, text: "Enable LLDP (vendor-neutral L2 discovery) on E0/0 of both switches, including native VLAN advertisement", device: "Sw1",
        hint: "lldp run\ninterface Ethernet0/0\nlldp transmit\nlldp receive",
        check: [["lldp"]] }
    ]
  },
  {
    id: 24, title: "OSPF Without Network Statements", category: "Routing",
    source: "Q276-Sim2",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/0": { ip: "10.10.12.1/30", status: "up" }, "Ethernet0/1": { ip: "10.10.13.1/30", status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/0": { ip: "10.10.12.2/30", status: "up" } } },
      { name: "R3", type: "router", hostname: "R3", interfaces: { "Ethernet0/0": { ip: "10.10.13.3/30", status: "up" } } }
    ],
    topology: `R1 ──E0/0── R2\n │E0/1\n R3\n Area 0, no network statements on R1`,
    tasks: [
      { id: 1, text: "Configure OSPF on R1: process ID 33, router-id from E0/1 IP (10.10.13.1)", device: "R1",
        hint: "router ospf 33\nrouter-id 10.10.13.1",
        check: [["router ospf","33"],["router-id","10.10.13.1"]] },
      { id: 2, text: "Enable OSPF on R1 interfaces using 'ip ospf <pid> area 0' (no network statements). Set priority 255 for DR.", device: "R1",
        hint: "interface Ethernet0/0\nip ospf 33 area 0\nip ospf priority 255\ninterface Ethernet0/1\nip ospf 33 area 0\nip ospf priority 255",
        check: [["ip ospf 33 area 0"],["ip ospf priority","255"]] }
    ]
  },
  {
    id: 25, title: "IPv4/IPv6 Addressing", category: "IP Services",
    source: "QLab212-Sim1",
    devices: [
      { name: "R1", type: "router", hostname: "R1", interfaces: { "Ethernet0/1": { status: "up" } } },
      { name: "R2", type: "router", hostname: "R2", interfaces: { "Ethernet0/1": { status: "up" } } }
    ],
    topology: `R1(E0/1) ──── (E0/1)R2\n IPv4: 192.168.180.16/28 (2nd /28)\n IPv6: 2001:db8:acca::/64 (1st /64)`,
    tasks: [
      { id: 1, text: "Configure R1 E0/1 with first usable IP from 2nd /28 subnet (192.168.180.16/28 → 192.168.180.17)", device: "R1",
        hint: "interface Ethernet0/1\nip address 192.168.180.17 255.255.255.240\nno shutdown",
        check: [["ip address","192.168.180.17","255.255.255.240"]] },
      { id: 2, text: "Configure R2 E0/1 with last usable IP from 2nd /28 subnet (192.168.180.30)", device: "R2",
        hint: "interface Ethernet0/1\nip address 192.168.180.30 255.255.255.240\nno shutdown",
        check: [["ip address","192.168.180.30","255.255.255.240"]] },
      { id: 3, text: "Configure IPv6 on R1 and R2 E0/1 using 2001:db8:acca::/64 with addresses from topology", device: "R1",
        hint: "interface Ethernet0/1\nipv6 address 2001:db8:acca::1/64\nno shutdown\n\n! On R2:\nipv6 address 2001:db8:acca::2/64",
        check: [["ipv6 address","2001:db8:acca"]] }
    ]
  },
  {
    id: 26, title: "VLANs, Trunks & VTP", category: "Switching",
    source: "QLab212-Sim2",
    devices: [
      { name: "Sw1", type: "switch", hostname: "Sw1", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" } } },
      { name: "Sw2", type: "switch", hostname: "Sw2", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/2": { status: "up" }, "Ethernet0/3": { status: "up" } } },
      { name: "Sw3", type: "switch", hostname: "Sw3", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" }, "Ethernet0/3": { status: "up" } } }
    ],
    topology: `PC1(VLAN202)──Sw1(E0/2)──(E0/2)Sw2(E0/3)──(E0/3)Sw3──PC3(VLAN303)\n                  │E0/0                │E0/1\n                 PC2(VLAN202)         PC4(VLAN303)`,
    tasks: [
      { id: 1, text: "Configure VLAN 202 (MARKETING) and VLAN 303 (FINANCE) on designated switches. Assign access ports to PC interfaces.", device: "Sw1",
        hint: "! On Sw1:\nvlan 202\nname MARKETING\ninterface Ethernet0/0\nswitchport mode access\nswitchport access vlan 202\ninterface Ethernet0/1\nswitchport mode access\nswitchport access vlan 202\n\n! On Sw3:\nvlan 303\nname FINANCE\ninterface Ethernet0/0\nswitchport mode access\nswitchport access vlan 303\ninterface Ethernet0/1\nswitchport mode access\nswitchport access vlan 303",
        check: [["vlan","202"],["name","marketing"],["switchport mode access"],["switchport access vlan","202"]] },
      { id: 2, text: "Configure E0/2 on Sw1 and Sw2 as 802.1q trunks allowing only VLANs 202 and 303", device: "Sw1",
        hint: "interface Ethernet0/2\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 202,303",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk allowed vlan","202","303"]] },
      { id: 3, text: "Configure E0/3 on Sw2 and Sw3 as 802.1q trunks allowing only VLANs 202 and 303", device: "Sw2",
        hint: "interface Ethernet0/3\nswitchport trunk encapsulation dot1q\nswitchport mode trunk\nswitchport trunk allowed vlan 202,303",
        check: [["switchport trunk encapsulation dot1q"],["switchport mode trunk"],["switchport trunk allowed vlan","202","303"]] }
    ]
  },
  {
    id: 27, title: "User Account, ACL & Port Security", category: "Security",
    source: "QLab212-Sim3",
    devices: [
      { name: "Sw101", type: "switch", hostname: "Sw101", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } },
      { name: "Sw102", type: "switch", hostname: "Sw102", interfaces: { "Ethernet0/0": { status: "up" }, "Ethernet0/1": { status: "up" } } }
    ],
    topology: `PC1 ── Sw101 ── Sw102(E0/0) ── PC2\n       VLAN 100/200`,
    tasks: [
      { id: 1, text: "Configure local account on Sw101: username support, password max2learn, exec privilege. Telnet on VTY 0-4.", device: "Sw101",
        hint: "username support privilege 15 secret max2learn\nline vty 0 4\nlogin local\ntransport input telnet",
        check: [["username","support","privilege","15"],["secret","max2learn"],["login local"],["transport input telnet"]] },
      { id: 2, text: "Configure NACL ENT_ACL on Sw101: deny PC2 ping to PC1, allow PC2 telnet to Sw101, deny other telnet from VLAN200, permit rest", device: "Sw101",
        hint: "ip access-list extended ENT_ACL\ndeny icmp host <PC2-IP> host <PC1-IP>\npermit tcp host <PC2-IP> host <Sw101-IP> eq 23\ndeny tcp any any eq 23\npermit ip any any",
        check: [["ip access-list extended","ent_acl"],["deny icmp"],["permit tcp","eq 23"],["deny tcp","eq 23"],["permit ip any any"]] },
      { id: 3, text: "Configure port security on Sw102 E0/0: max 4 MACs, restrict mode (drop unknown, no shutdown), dynamic learning", device: "Sw102",
        hint: "interface Ethernet0/0\nswitchport port-security\nswitchport port-security maximum 4\nswitchport port-security violation restrict",
        check: [["switchport port-security"],["switchport port-security maximum","4"],["switchport port-security violation restrict"]] }
    ]
  }
];

export const LAB_DESCRIPTIONS = {
  1: `IP connectivity and OSPF are preconfigured on all devices where necessary. Do not make any changes to the IP addressing or OSPF. The company policy uses connected interfaces and next hops when configuring static routes except for load balancing or redundancy without floating static. Connectivity must be established between subnet 172.20.20.128/25 on the Internet and the LAN at 192.168.0.0/24 connected to SW1:

1. Configure a static route on R2 to reach the LAN subnet (192.168.0.0/24) via SW1 (10.10.31.1). SW1 is an L3 switch acting as the default gateway for the LAN, directly connected to R2 via 10.10.31.0/24.

2. Configure default reachability to the Internet subnet in router R1.

3. Configure a single static route in router R2 to reach to the Internet subnet considering both redundant links between routers R1 and R2. A default route is NOT allowed in router R2.

4. Configure a static route in router R1 toward the switch SW1 LAN subnet where the primary link must be through Ethernet0/1, and the backup link must be through Ethernet0/2 using a floating route. Use the minimal administrative distance value when required.`,

  2: `Connectivity between three routers has been established, and IP services must be configured in the order presented to complete the implementation. Tasks assigned include configuration of NAT, NTP, DHCP, and SSH services.

1. All traffic sent from R3 to the R1 Loopback address must be configured for NAT on R2. All source addresses must be translated from R3 to the IP address of Ethernet0/0 on R2, while using only a standard access list named PUBNET. Do not use NVI NAT configuration.

2. Configure R1 as an NTP server and R2 as a client, not as a peer, using the IP address of the R1 Ethernet0/2 interface. Set the clock on the NTP server for midnight on May 1, 2018.

3. Configure R1 as a DHCP server for the network 10.1.3.0/24 in a pool named NETPOOL. Using a single command, exclude addresses 1 - 10 from the range. Interface Ethernet0/2 on R3 must be issued the IP address of 10.1.3.11 via DHCP.

4. Configure SSH connectivity from R1 to R3, while excluding access via other remote connection protocols. Access for user netadmin and password N3t4ccess must be set on router R3 using RSA and 1024 bits, configure domain lab.local. Verify connectivity using an SSH session from router R1 using a destination address of 10.1.3.11. Do NOT modify console.`,

  3: `All physical cabling between the two switches is installed. Configure the network connectivity between the switches using the designated VLANs and interfaces.

1. Configure VLAN 12 named Compute and VLAN 34 named Telephony where required for each task.

2. Configure Ethernet0/1 on SW2 to use the existing VLAN named Available.

3. Configure the connection between the switches using access ports.

4. Configure Ethernet0/1 on SW1 using data and voice VLANs.

5. Configure Ethernet0/1 on SW2 so that the Cisco proprietary neighbor discovery protocol is turned off for the designated interface only.`,

  4: `Refer to the topology. All physical cabling is in place. Configure local users accounts, modify the Named ACL (NACL), and configure DHCP Snooping. The current contents of the NACL must remain intact.

Task 1: Configure a local account on Gw1 with telnet access only on virtual ports 0-4. Use the following information: • Username: wheel • Password: lock3path • Algorithm type: Scrypt • Privilege level: Exec mode

Task 2: Configure and apply a NACL on Gw1 to control network traffic from VLAN 10: • Name: CORP_ACL • Allow BOOTP and HTTPS • Restrict all other traffic and log the ingress interface, source MAC address, the packet’s source and destination IP addresses, and ports

Task 3: Configure Sw1: • Enable DNCP Snooping for VLAN 10 • Disable DHCP Option-82 data insertion • Enable DHCP Snooping MAC address verification • Enable trusted interfaces`,

  5: `Refer to the topology. All physical cabling is in place. Configure local users accounts, modify the Named ACL (NACL), and configure DHCP Snooping. The current contents of the NACL must remain intact.

Task 1: Configure a local account on Gw1 with telnet access only on virtual ports 0-4. Use the following information: • Username: wheel • Password: lock3path • Algorithm type: Scrypt • Privilege level: Exec mode

Task 2: Configure and apply a NACL on Gw1 to control network traffic from VLAN 10: • Name: CORP_ACL • Allow BOOTP and HTTPS • Restrict all other traffic and log the ingress interface, source MAC address, the packet’s source and destination IP addresses, and ports

Task 3: Configure Sw1: • Enable DNCP Snooping for VLAN 10 • Disable DHCP Option-82 data insertion • Enable DHCP Snooping MAC address verification • Enable trusted interfaces`,

  6: `IP connectivity between the three routers is configured. OSPF adjacencies must be established.

1. Configure R1 and R2 Router IDs using the interface IP addresses from the link that is shared between them.

2. Configure the R2 links with a max value facing R1 and R3. R2 must become the DR. R1 and R3 links facing R2 must remain with the default OSPF configuration for DR election. Verify the configuration after clearing the OSPF process.

3. Using a host wildcard mask, configure all three routers to advertise their respective Loopback1 networks.

4. Configure the link between R1 and R3 to disable their ability to add other OSPF routers.`,

  7: `Refer to the topology. All physical cabling is in place. Routers R3 and R4 are fully configured and inaccessible. Configure static routes for various connectivity to the ISP and the LAN, which resides on R4.

1. Configure a default route on R2 to the ISP

2. Configure a default route on R1 to the ISP

3. Configure R2 with a route to the Server at 10.0.41.10

4. Configure R1 with a route to the LAN that prefers R3 as the primary path to the LAN`,

  8: `R1 and R2 are pre-configured with all the necessary commands. All physical cabling is in place and verified. Connectivity for PC1 and PC2 must be established to the switches; each port must only allow one VLAN and be operational.

1. Configure SW-1 with VLAN 15 and label it exactly as OPS

2. Configure SW-2 with VLAN 66 and label it exactly as ENGINEERING

3. Configure the switch port connecting to PC1

4. Configure the switch port connecting to PC2

5. Configure the E0/2 connections on SW-1 and SW-2 for neighbor discovery using the vendor-neutral standard protocol and ensure that E0/0 on both switches uses the Cisco proprietary protocol`,

  9: `R1 has been pre-configured with all the necessary commands. All physical cabling is in place and verified. Connectivity for PC1 and PC2 must be established to the switches, and each port must only allow one VLAN.

1. Configure SW-1 with VLAN 35 and label it exactly as SALES

2. Configure SW-2 with VLAN 39 and label it exactly as MARKETING

3. Configure the switch port connecting to PC1

4. Configure the switch port connecting to PC2

5. Configure SW-1 and SW-2 for universal neighbor discovery using the industry standard protocol and disable it on the interface connecting to PC1`,

  10: `VLANS 35 and 45 have been configured in all three switches. All physical connectivity has been installed and verified All inter-switch links must be operational.

1. Configure SW-1 and SW-2 switch ports e0/0 and e0/1 for 802.1q trunking allowing all VLANS

2. Configure the inter-switch links on SW-1 e0/2, SW-2 e0/2, and SW-3 e0/0 and e0/1 to use native VLAN 35

3. Configure SW-1 and SW-2 switch ports e0/0 and e0/1 for link aggregation SW-1 should immediately negotiate LACP and SW-2 must only respond to LACP requests`,

  11: `All physical cabling is in place and verified. Switch SW-1 is pre-configured and inaccessible. SW-2 and SW-3 ports must be configured and operational to complete the configuration.

1. Configure SW-2 and SW-3 ports E0/0 to use the industry standard encapsulation method for trunking and only tag VLAN 10

2. Configure SW-2 and SW-3 ports E0/0 to send and receive untagged traffic over VLAN 11

3. Configure SW-2 and SW-3 ports E0/2 and E0/3 to use the industry standard encapsulation method for trunking and tag all VLANS

4. Configure SW-2 and SW-3 ports E0/2 and E0/3 for link aggregation using the industry standard protocol with the following requirements: o SW-2 ports must not initiate the negotiation for the aggregation protocol o SW-3 ports must immediately negotiate the aggregation protocol o Use the designated number assignment`,

  12: `All physical cabling is in place and verified. Router R1 is configured and passing traffic for VLANs 5 and 6. All relevant ports are pre-configured as 802.1q trunks.

1. Configure SW-1 port E0/0 to permit only VLANS 5 and 6

2. Configure both SW-1 and SW-2's E0/1 ports to send and receive untagged traffic over VLAN 77

3. Configure SW-2 E0/2 port to permit only VLAN 6

4. Configure both SW-3 and SW-4 ports e0/0 and e0/1 for link aggregation using the industry standard protocol with the following requirements: o SW-3 ports must immediately negotiate the aggregation protocol o SW-4 ports must not initiate the negotiation for the aggregation protocol o Use the designated number assignment`,

  13: `Refer to the topology. All physical cabling is in place. Configure local users accounts, modify the Named ACL (NACL), and configure DHCP Snooping. The current contents of the NACL must remain intact.

1. Configure a local account on Sw103 with telnet access only on virtual ports 0-4. Use the following information: • Username: devnet • Password: access8cli • Algorithm type: SHA256 • Privilege level: Exec mode

2. Using the minimum number of ACEs, modify the existing NACL "INTERNET_ACL" to control network traffic destined for the Internet, and apply the ACL on R1: • Allow HTTPS from 172.16.0.0/16 • Allow Telnet only for VLAN 101 • Restrict all other traffic and log the ingress interface, source MAC address, the packet's source and destination IP addresses, and ports

3. Configure Sw101: • Enable DHCP Snooping for VLAN 101 • Disable DHCP Option-82 data insertion • Enable DHCP Snooping MAC address verification`,

  14: `All physical cabling is in place. A company plans to deploy 64 new sites. The sites will utilize both IPv4 and IPv6 networks.

1. Subnet 10.30.64.0/19 to meet the subnet requirements and maximize the number of hosts • Using the second subnet - Assign the first usable IP address to e0/0 on Sw101 - Assign the last usable IP address to e0/0 on Sw102

2. Subnet 2001:db8::/56 to meet the subnet requirements and maximize the number of hosts • Using the second subnet - Assign an IPv6 GUA using a unique 64-Bit interface identifier on e0/0 on Sw101 - Assign an IPv6 GUA using a unique 64-Bit interface identifier on e0/0 on Sw102`,

  15: `All physical cabling is in place. Configurations should ensure that connectivity is established end-to-end.

1. Configure a route on R1 to ensure that R1 prefers R2 to reach the 2001:db8:41::/64 network

2. Configure a floating route on R1, and ensure that R1 uses R3 to reach the 2001 :db8:41::/64 network if the connection between R1 and R2 is down

3. Ping and traceroute should be working`,

  16: `R1 has been pre-configured with all the necessary commands. All physical cabling is in place and verified. Connectivity to the end devices must be configured.

1. Configure SW-1 switch port 0/1 to carry traffic for the Cisco IP phone and PC

2. Configure SW-2 E0/1 to carry traffic for PC2

3. Configure VLAN 10 with the name “Engineering” on SW-1

4. Configure the link between SW-1 and SW-2 to use the vendor neutral neighbor discovery protocol

5. Configure the link on SW-1 to R1 so that it does not allow the Cisco neighbor discovery protocol to pass`,

  17: `All physical cabling is in place and verified. Connectivity for the Switches on ports E0/1, E0/2, and E0/3 must be configured and available for voice and data capabilities.

1. Configure Sw1 and Sw2 with both VLANS, naming them according to the VLAN Name provided in the topology.

2. Configure the E0/1, E0/2, and E0/3 ports on both switches for both VLANS and ensure that Cisco IP phones and PCs pass traffic.

3. Configure Sw1 and Sw2 to allow neighbor discovery via the vendor-neutral protocol on e0/0.`,

  18: `SW-3 and SW-4 are preconfigured with all necessary commands. All physical cabling is in place and verified. All connectivity must be operational.

1. Configure both SW-1 and SW-2 switch ports e0/0 and e0/1 for 802.1q trunking with only VLANS 1, 12, and 22 permitted.

2. Configure SW-1 port e0/2 for 802.1q trunking and include only VLANS 12 and 22.

3. Configure both SW-1 and SW-2 switch ports e0/0 and e0/1 for link aggregation using the industry standard protocol. All ports must be configured so that they immediately negotiate the link.`,

  19: `IP connectivity between the three routers is established. IP Services must be configured in the order presented to complete the implementation.

1. Configure dynamic one-to-one address mapping on R2 using a standard list named XLATE, which allows all traffic to translate the source address of R3 to a pool named test_pool using the 10.10.10.0/24 network for traffic sent from R3 to R1. Avoid using an NVI configuration. Verify reachability by sending a ping to 192.168.100.1 from R3.

2. Configure R3 to dynamically receive an IP address on Ethernet0/2 from the DHCP server.

3. Configure R1 as an NTP server and R2 as a client, not as a peer, using the IP address 10.1.2.1.

4. Configure SSH access from R1 to R3, while excluding access via other remote connection protocols using the user root and password s3cret on router R3 using RSA. Verify connectivity from router R1 to R3 using a destination address assigned to interface E0/2 on R3.`,

  20: `All physical cabling is in place and verified. Connectivity for PC1, PC2 and PC3 must be established to the switches. Each port connecting to the PCs must be configured as an end-user port and only allow the designated VLAN.

1. Configure VLAN 99 on all three switches and label it exactly as FINANCIAL

2. Configure the switch ports connecting to PC1, PC2 and PC3

3. Cisco's neighbor discovery protocol has been disabled on SW-1 and must be re-enabled

4. PC1 must not be able to discover SW-1`,

  21: `Refer to the topology. All physical cabling is in place. Configure local user account, configure a Named ACL (NACL), and Dynamic Arp Inspection.

1. Configure a local account on Sw3 with telnet access only on virtual ports 0-4. Use the following information: o Username: tech12 o Password: load1key o Algorithm type: md5 o Privilege level: Exec mode

2. Configure and apply a NACL on R1 to control network traffic towards ISP: o Name: ISP_ACL o Restrict RFC 1918 class A and B addresses o Allow all other addresses

3. A DHCP IP Pool is preconfigured on R1 for VLAN 5, and DHCP Snooping is configured on Sw2. Configure on Sw2: o Dynamic Arp Inspection for VLAN 5 o Enable validation of the ARP packet destination MAC address o Enable validation of the ARP packet source MAC address o Enable validation of the ARP Packet IP address`,

  22: `Task 1: Configure trunks between Sw1 and Sw2 on ports E0/0 and E0/1 using the IEEE standard frame tagging method. • Add VLAN 99 as untagged on the trunk ports. • Only extend VLAN 110 and the untagged VLAN across the trunk. • Verify that PC1 is capable of pinging PC2.

Task 2: On Sw1 and Sw2, use IEEE 802.3ad link aggregation. • Combine E0/0 and E0/1 into a single logical link while leaving the trunk configurations intact. • Assign number 20 to the link. • Both links must negotiate aggregation.`,

  23: `All physical cabling is in place and verified. Connectivity for the Switches on ports E0/1, E0/2, and E0/3 must be configured and available for voice and data capabilities.

1. Configure Sw1 and Sw2 with the VLAN naming as indicated.

2. Assign the VLANs to the appropriate interfaces and set a non-trunking, non-tagged, single-VLAN for each interface according to the topology.

3. Configure both switches to use the L2 vendor-neutral discovery protocol to broadcast device information, including the native VLAN across the e0/0 interfaces.`,

  24: `Refer to the topology. All physical cabling is in place. Routers 2 and 3 are inaccessible. Configure OSPF routing for the network and ensure R1 has joined Area 0 without using network statements.

Task 1: • Configure OSPF on R1 with a process ID and router- ID only as follows: o use process ID 33 o use EO/1 IP as the router ID

Task 2: • Configure R1 to establish neighbor adjacencies with R2 and R3. The network statement under the OSPF process must not be used. • Configure R1 to always become the DR for Area 0`,

  25: `Configure IPv4 and IPv6 connectivity between two routers. For IPv4, use a /28 network from the 192.168.180.0/24 private range. For IPv6, use the first /64 subnet from the 2001:0db8:acca::/48 subnet.

1. Using Ethernet0/1 on routers R1 and R2, configure the next usable /28 from the 192.168.180.0/24 range. The network 192.168.180.0/28 is unavailable.

2. For the IPv4 /28 subnet, router R1 must be configured with the first usable host address.

3. For the IPv4 /28 subnet, router R2 must be configured with the last usable host address.

4. For the IPv6 /64 subnet, configure the routers with the IP addressing provided from the topology.

5. A ping must work between the routers on the IPv4 and IPv6 address ranges.`,

  26: `Three switches must be configured for Layer 2 connectivity. The company requires only the designated VLANs to be configured on their respective switches and permitted across any links between switches for security purposes. Do not modify or delete VTP configurations. The network needs two user-defined VLANs configured: VLAN 202: MARKETING, VLAN 303: FINANCE.

1. Configure the VLANs on the designated switches and assign them as access ports to the interfaces connected to the PCs.

2. Configure the e0/2 interfaces on Sw1 and Sw2 as 802.1q trunks with only the required VLANs permitted.

3. Configure the e0/3 interfaces on Sw2 and Sw3 as 802.1q trunks with only the required VLANs permitted.`,

  27: `Refer to the topology. All physical cabling is in place. Configure a local user account, a Named ACL (NACL), and security.

Task 1: Configure a local account on Sw101 with telnet access only on virtual ports 0-4. Use the following information: • Username: support • Password: max2learn • Privilege level: Exec mode

Task 2: Configure and apply a single NACL on Sw101 using the following: • Name: ENT_ACL • Restrict only PC2 on VLAN 200 from pinging PC1 • Allow only PC2 on VLAN 200 to telnet to Sw101 • Prevent all other devices from telnetting from VLAN 200 • Allow all other network traffic from VLAN 200

Task 3: Configure security on interface Ethernet 0/0 of Sw102: • Set the maximum number of secure MAC addresses to four. • Drop packets with unknown source addresses until the number of secure MAC addresses drops below the configured maximum value. No notification action is required. • Allow secure MAC addresses to be learned dynamically.`,
};


export const CATEGORIES = [...new Set(LABS.map(l => l.category))];

