"""Built-in template labs.

Each template is a self-contained, original lab: a topology (devices + links),
per-device CLI configuration, a stated objective, and auto-graded success
checks. They cover the standard topics taught at CCNA -> CCIE level (VLAN/STP,
routing protocols, FHRP, NAT/ACL, redistribution, dual-stack, security). The
content is authored from scratch from public protocol behaviour - it does not
reproduce any book, courseware, or vendor lab material.

A template's `spec` is the same shape accepted by POST /api/lab/apply, so a
template can be applied to a workspace in one request and graded with its own
`checks`. Every template ships as a working reference: applying it and grading
it yields 100%.
"""
from __future__ import annotations

from typing import List


def _cfg(*lines: str) -> List[str]:
    """Wrap config body lines in enable / configure terminal ... end."""
    return ["enable", "configure terminal", *lines, "end"]


def _host(ip: str, gw: str | None = None) -> List[str]:
    body = ["interface eth0", f"ip address {ip} 255.255.255.0", "no shutdown", "exit"]
    if gw:
        body.append(f"ip default-gateway {gw}")
    return _cfg(*body)


# --------------------------------------------------------------------------- #
# CCNA
# --------------------------------------------------------------------------- #

_VLAN_TRUNK = {
    "id": "ccna-vlan-trunk-stp",
    "name": "VLAN segmentation + 802.1Q trunk + STP",
    "category": "CCNA",
    "level": "Switching",
    "objective": (
        "Two access switches carry VLAN 10 and VLAN 20 over a redundant 802.1Q "
        "trunk pair. Same-VLAN hosts on different switches reach each other; "
        "different-VLAN hosts are isolated; spanning-tree blocks the redundant "
        "trunk so the L2 loop cannot form."
    ),
    "spec": {
        "devices": [
            {"kind": "switch", "name": "SW1", "ports": 8, "x": 240, "y": 120},
            {"kind": "switch", "name": "SW2", "ports": 8, "x": 560, "y": 120},
            {"kind": "host", "name": "PC1", "x": 80, "y": 40},
            {"kind": "host", "name": "PC2", "x": 80, "y": 220},
            {"kind": "host", "name": "PC3", "x": 720, "y": 40},
            {"kind": "host", "name": "PC4", "x": 720, "y": 220},
        ],
        "links": [
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/1"},
            {"dev_a": "PC2", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/2"},
            {"dev_a": "PC3", "if_a": "eth0", "dev_b": "SW2", "if_b": "FastEthernet0/1"},
            {"dev_a": "PC4", "if_a": "eth0", "dev_b": "SW2", "if_b": "FastEthernet0/2"},
            {"dev_a": "SW1", "if_a": "FastEthernet0/0", "dev_b": "SW2", "if_b": "FastEthernet0/0"},
            {"dev_a": "SW1", "if_a": "FastEthernet0/3", "dev_b": "SW2", "if_b": "FastEthernet0/3"},
        ],
        "config": {
            "SW1": _cfg(
                "vlan 10", "vlan 20",
                "interface FastEthernet0/1", "switchport mode access", "switchport access vlan 10", "exit",
                "interface FastEthernet0/2", "switchport mode access", "switchport access vlan 20", "exit",
                "interface FastEthernet0/0", "switchport mode trunk", "exit",
                "interface FastEthernet0/3", "switchport mode trunk", "exit",
            ),
            "SW2": _cfg(
                "vlan 10", "vlan 20",
                "interface FastEthernet0/1", "switchport mode access", "switchport access vlan 10", "exit",
                "interface FastEthernet0/2", "switchport mode access", "switchport access vlan 20", "exit",
                "interface FastEthernet0/0", "switchport mode trunk", "exit",
                "interface FastEthernet0/3", "switchport mode trunk", "exit",
            ),
            "PC1": _host("10.10.10.11"),
            "PC2": _host("10.20.20.12"),
            "PC3": _host("10.10.10.13"),
            "PC4": _host("10.20.20.14"),
        },
        "checks": [
            {"type": "ping", "name": "VLAN10 PC1->PC3 across trunk", "src": "PC1", "dst": "10.10.10.13", "expect": "success"},
            {"type": "ping", "name": "VLAN20 PC2->PC4 across trunk", "src": "PC2", "dst": "10.20.20.14", "expect": "success"},
            {"type": "ping", "name": "Cross-VLAN PC1->PC4 isolated", "src": "PC1", "dst": "10.20.20.14", "expect": "fail"},
            {"type": "stp_blocking", "name": "STP blocks the redundant trunk"},
        ],
    },
}

_STATIC = {
    "id": "ccna-static-routing",
    "name": "Static + default routing (two routers)",
    "category": "CCNA",
    "level": "Routing",
    "objective": (
        "Two routers connect two LANs over a /30 WAN link. Each router has a "
        "static route to the far LAN. Hosts reach across using their default "
        "gateway."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 280, "y": 140},
            {"kind": "router", "name": "R2", "ports": 2, "x": 560, "y": 140},
            {"kind": "host", "name": "PC1", "x": 80, "y": 140},
            {"kind": "host", "name": "PC2", "x": 760, "y": 140},
        ],
        "links": [
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "R2", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/1", "dev_b": "PC2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/1", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "exit",
                "ip route 192.168.2.0 255.255.255.0 10.0.0.2",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/1", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ip address 10.0.0.2 255.255.255.252", "no shutdown", "exit",
                "ip route 192.168.1.0 255.255.255.0 10.0.0.1",
            ),
            "PC1": _host("192.168.1.10", "192.168.1.1"),
            "PC2": _host("192.168.2.10", "192.168.2.1"),
        },
        "checks": [
            {"type": "route", "name": "R1 has static route to 192.168.2.0/24", "device": "R1", "network": "192.168.2.0/24"},
            {"type": "ping", "name": "PC1 reaches PC2 across the WAN", "src": "PC1", "dst": "192.168.2.10", "expect": "success"},
        ],
    },
}

_OSPF1 = {
    "id": "ccna-ospf-single-area",
    "name": "OSPF single-area (area 0)",
    "category": "CCNA",
    "level": "Routing",
    "objective": (
        "Three routers run OSPF in a single backbone area. Adjacencies form, "
        "LANs are advertised, and hosts at the edges reach each other over "
        "OSPF-learned routes."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 220, "y": 200},
            {"kind": "router", "name": "R2", "ports": 3, "x": 430, "y": 120},
            {"kind": "router", "name": "R3", "ports": 2, "x": 640, "y": 200},
            {"kind": "host", "name": "H1", "x": 60, "y": 200},
            {"kind": "host", "name": "H2", "x": 800, "y": 200},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "R2", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/1", "dev_b": "R3", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R3", "if_a": "GigabitEthernet0/1", "dev_b": "H2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/1", "ip address 172.16.1.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ip address 10.0.12.1 255.255.255.0", "no shutdown", "exit",
                "router ospf 1", "network 172.16.1.0 0.0.0.255 area 0", "network 10.0.12.0 0.0.0.255 area 0", "exit",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.12.2 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 10.0.23.1 255.255.255.0", "no shutdown", "exit",
                "router ospf 1", "network 10.0.12.0 0.0.0.255 area 0", "network 10.0.23.0 0.0.0.255 area 0", "exit",
            ),
            "R3": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.23.2 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 172.16.2.1 255.255.255.0", "no shutdown", "exit",
                "router ospf 1", "network 10.0.23.0 0.0.0.255 area 0", "network 172.16.2.0 0.0.0.255 area 0", "exit",
            ),
            "H1": _host("172.16.1.10", "172.16.1.1"),
            "H2": _host("172.16.2.10", "172.16.2.1"),
        },
        "checks": [
            {"type": "route", "name": "R1 learns 172.16.2.0/24 via OSPF", "device": "R1", "network": "172.16.2.0/24"},
            {"type": "ping", "name": "H1 reaches H2 end-to-end", "src": "H1", "dst": "172.16.2.10", "expect": "success"},
        ],
    },
}

_DHCP = {
    "id": "ccna-dhcp",
    "name": "DHCP server + client lease",
    "category": "CCNA",
    "level": "Services",
    "objective": (
        "A router hosts a DHCP pool for the LAN. A client requests an address "
        "with 'ip address dhcp', receives a lease + gateway, and reaches its "
        "default gateway."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 360, "y": 140},
            {"kind": "host", "name": "PC1", "x": 120, "y": 140},
        ],
        "links": [
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 192.168.50.1 255.255.255.0", "no shutdown", "exit",
                "ip dhcp excluded-address 192.168.50.1",
                "ip dhcp pool LAN", "network 192.168.50.0 255.255.255.0", "default-router 192.168.50.1", "exit",
            ),
            "PC1": _cfg("interface eth0", "ip address dhcp", "exit"),
        },
        "checks": [
            {"type": "ping", "name": "DHCP client reaches its gateway", "src": "PC1", "dst": "192.168.50.1", "expect": "success"},
        ],
    },
}

_ACL = {
    "id": "ccna-extended-acl",
    "name": "Extended ACL filtering",
    "category": "CCNA",
    "level": "Security",
    "objective": (
        "An extended ACL on the router blocks ICMP from one specific host to a "
        "server while permitting all other traffic. A second host on the same "
        "LAN is unaffected and still reaches the server."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 3, "x": 380, "y": 160},
            {"kind": "switch", "name": "SW1", "ports": 4, "x": 200, "y": 160},
            {"kind": "host", "name": "PC1", "x": 60, "y": 60},
            {"kind": "host", "name": "PC2", "x": 60, "y": 260},
            {"kind": "host", "name": "SRV", "x": 620, "y": 160},
        ],
        "links": [
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/1"},
            {"dev_a": "PC2", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/2"},
            {"dev_a": "SW1", "if_a": "FastEthernet0/0", "dev_b": "R1", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/1", "dev_b": "SRV", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "exit",
                "access-list 100 deny icmp host 192.168.1.10 host 192.168.2.10",
                "access-list 100 permit ip any any",
                "interface GigabitEthernet0/0", "ip access-group 100 in", "exit",
            ),
            "PC1": _host("192.168.1.10", "192.168.1.1"),
            "PC2": _host("192.168.1.11", "192.168.1.1"),
            "SRV": _host("192.168.2.10", "192.168.2.1"),
        },
        "checks": [
            {"type": "ping", "name": "PC1 blocked to SRV by ACL", "src": "PC1", "dst": "192.168.2.10", "expect": "fail"},
            {"type": "ping", "name": "PC2 permitted to SRV", "src": "PC2", "dst": "192.168.2.10", "expect": "success"},
        ],
    },
}

_NAT = {
    "id": "ccna-nat-pat",
    "name": "NAT/PAT overload (port address translation)",
    "category": "CCNA",
    "level": "Services",
    "objective": (
        "An edge router translates an inside private LAN to a single outside "
        "address using PAT overload. An inside host reaches an outside server "
        "and a translation entry is created."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 360, "y": 150},
            {"kind": "host", "name": "PC1", "x": 120, "y": 150},
            {"kind": "host", "name": "ISP", "x": 620, "y": 150},
        ],
        "links": [
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/1", "dev_b": "ISP", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.1.1.1 255.255.255.0", "ip nat inside", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 203.0.113.1 255.255.255.0", "ip nat outside", "no shutdown", "exit",
                "access-list 1 permit 10.1.1.0 0.0.0.255",
                "ip nat inside source list 1 interface GigabitEthernet0/1 overload",
            ),
            "PC1": _host("10.1.1.10", "10.1.1.1"),
            "ISP": _host("203.0.113.2", "203.0.113.1"),
        },
        "checks": [
            {"type": "ping", "name": "Inside host reaches outside server", "src": "PC1", "dst": "203.0.113.2", "expect": "success"},
            {"type": "nat_translation", "name": "PAT entry for 10.1.1.10 exists", "device": "R1",
             "src": "PC1", "dst": "203.0.113.2", "inside_local": "10.1.1.10"},
        ],
    },
}

# --------------------------------------------------------------------------- #
# CCNP
# --------------------------------------------------------------------------- #

_OSPF_MULTI = {
    "id": "ccnp-ospf-multiarea",
    "name": "Multi-area OSPF with an ABR",
    "category": "CCNP",
    "level": "Routing",
    "objective": (
        "An Area Border Router joins area 1 to backbone area 0. An internal "
        "router/host in area 1 reaches a host behind a backbone router in area "
        "0 via inter-area (O IA) routes."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 200, "y": 200},
            {"kind": "router", "name": "ABR", "ports": 2, "x": 420, "y": 120},
            {"kind": "router", "name": "R2", "ports": 2, "x": 640, "y": 200},
            {"kind": "host", "name": "H1", "x": 60, "y": 200},
            {"kind": "host", "name": "H2", "x": 800, "y": 200},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "ABR", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "ABR", "if_a": "GigabitEthernet0/1", "dev_b": "R2", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/1", "dev_b": "H2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/1", "ip address 172.16.1.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ip address 10.0.1.1 255.255.255.0", "no shutdown", "exit",
                "router ospf 1", "network 172.16.1.0 0.0.0.255 area 1", "network 10.0.1.0 0.0.0.255 area 1", "exit",
            ),
            "ABR": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.1.2 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 10.0.0.1 255.255.255.0", "no shutdown", "exit",
                "router ospf 1", "network 10.0.1.0 0.0.0.255 area 1", "network 10.0.0.0 0.0.0.255 area 0", "exit",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.0.2 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 172.16.2.1 255.255.255.0", "no shutdown", "exit",
                "router ospf 1", "network 10.0.0.0 0.0.0.255 area 0", "network 172.16.2.0 0.0.0.255 area 0", "exit",
            ),
            "H1": _host("172.16.1.10", "172.16.1.1"),
            "H2": _host("172.16.2.10", "172.16.2.1"),
        },
        "checks": [
            {"type": "route", "name": "ABR has inter-area route to 172.16.2.0/24", "device": "ABR", "network": "172.16.2.0/24"},
            {"type": "ping", "name": "H1 (area 1) reaches H2 (area 0)", "src": "H1", "dst": "172.16.2.10", "expect": "success"},
        ],
    },
}

_EBGP = {
    "id": "ccnp-ebgp-two-as",
    "name": "eBGP peering between two autonomous systems",
    "category": "CCNP",
    "level": "Routing",
    "objective": (
        "Two routers in AS 65001 and AS 65002 form an eBGP session, each "
        "advertising its LAN. Routes carry an AS-path and hosts reach across "
        "the inter-AS boundary."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 280, "y": 150},
            {"kind": "router", "name": "R2", "ports": 2, "x": 560, "y": 150},
            {"kind": "host", "name": "H1", "x": 80, "y": 150},
            {"kind": "host", "name": "H2", "x": 760, "y": 150},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "R2", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/1", "dev_b": "H2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/1", "ip address 192.168.1.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ip address 10.0.0.1 255.255.255.252", "no shutdown", "exit",
                "router bgp 65001", "neighbor 10.0.0.2 remote-as 65002",
                "network 192.168.1.0 mask 255.255.255.0", "exit",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/1", "ip address 192.168.2.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ip address 10.0.0.2 255.255.255.252", "no shutdown", "exit",
                "router bgp 65002", "neighbor 10.0.0.1 remote-as 65001",
                "network 192.168.2.0 mask 255.255.255.0", "exit",
            ),
            "H1": _host("192.168.1.10", "192.168.1.1"),
            "H2": _host("192.168.2.10", "192.168.2.1"),
        },
        "checks": [
            {"type": "route", "name": "R1 learns 192.168.2.0/24 via eBGP", "device": "R1", "network": "192.168.2.0/24"},
            {"type": "ping", "name": "H1 reaches H2 across the AS boundary", "src": "H1", "dst": "192.168.2.10", "expect": "success"},
        ],
    },
}

_EIGRP = {
    "id": "ccnp-eigrp-redistribute",
    "name": "EIGRP with connected redistribution",
    "category": "CCNP",
    "level": "Routing",
    "objective": (
        "Two routers run EIGRP AS 100. One router redistributes a connected LAN "
        "that is not in any network statement; the peer still learns it and the "
        "hosts reach each other."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 280, "y": 150},
            {"kind": "router", "name": "R2", "ports": 2, "x": 560, "y": 150},
            {"kind": "host", "name": "H1", "x": 80, "y": 150},
            {"kind": "host", "name": "H2", "x": 760, "y": 150},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "R2", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/1", "dev_b": "H2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/1", "ip address 172.16.1.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ip address 10.0.0.1 255.255.255.0", "no shutdown", "exit",
                "router eigrp 100", "network 172.16.1.0 0.0.0.255", "network 10.0.0.0 0.0.0.255", "exit",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.0.2 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 172.16.2.1 255.255.255.0", "no shutdown", "exit",
                "router eigrp 100", "network 10.0.0.0 0.0.0.255", "redistribute connected", "exit",
            ),
            "H1": _host("172.16.1.10", "172.16.1.1"),
            "H2": _host("172.16.2.10", "172.16.2.1"),
        },
        "checks": [
            {"type": "route", "name": "R1 learns redistributed 172.16.2.0/24", "device": "R1", "network": "172.16.2.0/24"},
            {"type": "ping", "name": "H1 reaches H2 via EIGRP", "src": "H1", "dst": "172.16.2.10", "expect": "success"},
        ],
    },
}

_HSRP = {
    "id": "ccnp-hsrp-redundancy",
    "name": "HSRP first-hop gateway redundancy",
    "category": "CCNP",
    "level": "High Availability",
    "objective": (
        "Two routers share a virtual gateway IP via HSRP group 1. The higher "
        "priority router with preempt becomes Active and answers for the "
        "virtual IP that the host uses as its default gateway."
    ),
    "spec": {
        "devices": [
            {"kind": "switch", "name": "SW1", "ports": 4, "x": 360, "y": 220},
            {"kind": "router", "name": "R1", "ports": 1, "x": 220, "y": 80},
            {"kind": "router", "name": "R2", "ports": 1, "x": 500, "y": 80},
            {"kind": "host", "name": "PC1", "x": 360, "y": 360},
        ],
        "links": [
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "SW1", "if_b": "FastEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/0", "dev_b": "SW1", "if_b": "FastEthernet0/1"},
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/2"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 192.168.1.2 255.255.255.0",
                "standby 1 ip 192.168.1.1", "standby 1 priority 110", "standby 1 preempt", "no shutdown", "exit",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/0", "ip address 192.168.1.3 255.255.255.0",
                "standby 1 ip 192.168.1.1", "standby 1 priority 100", "no shutdown", "exit",
            ),
            "PC1": _host("192.168.1.10", "192.168.1.1"),
        },
        "checks": [
            {"type": "hsrp_active", "name": "R1 is HSRP Active for group 1", "device": "R1", "group": 1, "expect_state": "Active"},
            {"type": "hsrp_active", "name": "R2 is HSRP Standby for group 1", "device": "R2", "group": 1, "expect_state": "Standby"},
            {"type": "ping", "name": "Host reaches the virtual gateway", "src": "PC1", "dst": "192.168.1.1", "expect": "success"},
        ],
    },
}

_ETHERCHANNEL = {
    "id": "ccnp-etherchannel-lacp",
    "name": "LACP EtherChannel link aggregation",
    "category": "CCNP",
    "level": "Switching",
    "objective": (
        "Two switches bundle two physical links into a single LACP "
        "EtherChannel (channel-group 1, mode active). The bundle forwards as "
        "one logical link instead of one being STP-blocked."
    ),
    "spec": {
        "devices": [
            {"kind": "switch", "name": "SW1", "ports": 4, "x": 280, "y": 150},
            {"kind": "switch", "name": "SW2", "ports": 4, "x": 560, "y": 150},
            {"kind": "host", "name": "H1", "x": 80, "y": 150},
            {"kind": "host", "name": "H2", "x": 760, "y": 150},
        ],
        "links": [
            {"dev_a": "SW1", "if_a": "FastEthernet0/0", "dev_b": "SW2", "if_b": "FastEthernet0/0"},
            {"dev_a": "SW1", "if_a": "FastEthernet0/1", "dev_b": "SW2", "if_b": "FastEthernet0/1"},
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/2"},
            {"dev_a": "H2", "if_a": "eth0", "dev_b": "SW2", "if_b": "FastEthernet0/2"},
        ],
        "config": {
            "SW1": _cfg(
                "interface FastEthernet0/0", "channel-group 1 mode active", "exit",
                "interface FastEthernet0/1", "channel-group 1 mode active", "exit",
            ),
            "SW2": _cfg(
                "interface FastEthernet0/0", "channel-group 1 mode active", "exit",
                "interface FastEthernet0/1", "channel-group 1 mode active", "exit",
            ),
            "H1": _host("192.168.1.10"),
            "H2": _host("192.168.1.20"),
        },
        "checks": [
            {"type": "etherchannel", "name": "SW1 channel-group 1 is up with 2 members", "device": "SW1", "group": 1, "min_members": 2},
            {"type": "ping", "name": "H1 reaches H2 over the bundle", "src": "H1", "dst": "192.168.1.20", "expect": "success"},
        ],
    },
}

# --------------------------------------------------------------------------- #
# CCIE / Expert
# --------------------------------------------------------------------------- #

_MUTUAL_REDIST = {
    "id": "ccie-mutual-redistribution",
    "name": "Mutual redistribution: RIP <-> EIGRP",
    "category": "CCIE",
    "level": "Routing",
    "objective": (
        "A border router runs both RIP and EIGRP and mutually redistributes "
        "between them. A host in the RIP domain reaches a host in the EIGRP "
        "domain end-to-end through the redistribution point."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 200, "y": 160},
            {"kind": "router", "name": "RBR", "ports": 2, "x": 420, "y": 90},
            {"kind": "router", "name": "R3", "ports": 2, "x": 640, "y": 160},
            {"kind": "host", "name": "H1", "x": 60, "y": 160},
            {"kind": "host", "name": "H3", "x": 800, "y": 160},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "RBR", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "RBR", "if_a": "GigabitEthernet0/1", "dev_b": "R3", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R3", "if_a": "GigabitEthernet0/1", "dev_b": "H3", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/1", "ip address 172.16.1.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ip address 10.0.12.1 255.255.255.0", "no shutdown", "exit",
                "router rip", "version 2", "network 172.16.1.0", "network 10.0.12.0", "exit",
            ),
            "RBR": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.12.2 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 10.0.23.1 255.255.255.0", "no shutdown", "exit",
                "router rip", "version 2", "network 10.0.12.0", "redistribute eigrp", "exit",
                "router eigrp 100", "network 10.0.23.0 0.0.0.255", "redistribute rip", "exit",
            ),
            "R3": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.23.2 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 172.16.3.1 255.255.255.0", "no shutdown", "exit",
                "router eigrp 100", "network 10.0.23.0 0.0.0.255", "network 172.16.3.0 0.0.0.255", "exit",
            ),
            "H1": _host("172.16.1.10", "172.16.1.1"),
            "H3": _host("172.16.3.10", "172.16.3.1"),
        },
        "checks": [
            {"type": "route", "name": "R1 (RIP) learns the EIGRP domain 172.16.3.0/24", "device": "R1", "network": "172.16.3.0/24"},
            {"type": "route", "name": "R3 (EIGRP) learns the RIP domain 172.16.1.0/24", "device": "R3", "network": "172.16.1.0/24"},
            {"type": "ping", "name": "H1 (RIP) reaches H3 (EIGRP)", "src": "H1", "dst": "172.16.3.10", "expect": "success"},
        ],
    },
}

_DUALSTACK = {
    "id": "ccie-dual-stack",
    "name": "IPv4 + IPv6 dual-stack routing",
    "category": "CCIE",
    "level": "IPv6",
    "objective": (
        "Two routers carry both IPv4 and IPv6. Static routes exist for each "
        "address family and dual-stack hosts reach each other over both ping "
        "(IPv4) and ping6 (IPv6)."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 280, "y": 150},
            {"kind": "router", "name": "R2", "ports": 2, "x": 560, "y": 150},
            {"kind": "host", "name": "H1", "x": 80, "y": 150},
            {"kind": "host", "name": "H2", "x": 760, "y": 150},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "R2", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/1", "dev_b": "H2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/1",
                "ip address 192.168.1.1 255.255.255.0", "ipv6 address 2001:db8:1::1/64", "no shutdown", "exit",
                "interface GigabitEthernet0/0",
                "ip address 10.0.0.1 255.255.255.0", "ipv6 address 2001:db8:c::1/64", "no shutdown", "exit",
                "ip route 192.168.2.0 255.255.255.0 10.0.0.2",
                "ipv6 route 2001:db8:2::/64 2001:db8:c::2",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/1",
                "ip address 192.168.2.1 255.255.255.0", "ipv6 address 2001:db8:2::1/64", "no shutdown", "exit",
                "interface GigabitEthernet0/0",
                "ip address 10.0.0.2 255.255.255.0", "ipv6 address 2001:db8:c::2/64", "no shutdown", "exit",
                "ip route 192.168.1.0 255.255.255.0 10.0.0.1",
                "ipv6 route 2001:db8:1::/64 2001:db8:c::1",
            ),
            "H1": _cfg(
                "interface eth0",
                "ip address 192.168.1.10 255.255.255.0", "ipv6 address 2001:db8:1::10/64", "no shutdown", "exit",
                "ip default-gateway 192.168.1.1", "ipv6 default-gateway 2001:db8:1::1",
            ),
            "H2": _cfg(
                "interface eth0",
                "ip address 192.168.2.10 255.255.255.0", "ipv6 address 2001:db8:2::10/64", "no shutdown", "exit",
                "ip default-gateway 192.168.2.1", "ipv6 default-gateway 2001:db8:2::1",
            ),
        },
        "checks": [
            {"type": "ping", "name": "IPv4 H1 -> H2", "src": "H1", "dst": "192.168.2.10", "expect": "success"},
            {"type": "ping6", "name": "IPv6 H1 -> H2", "src": "H1", "dst": "2001:db8:2::10", "expect": "success"},
        ],
    },
}


_RSTP = {
    "id": "ccnp-rstp-root",
    "name": "Rapid-PVST root bridge election",
    "category": "CCNP",
    "level": "Switching",
    "objective": (
        "Three switches form a triangle (a physical loop). Rapid-PVST elects "
        "the lowest-priority switch as root and blocks one redundant port so "
        "the loop cannot form, while same-VLAN hosts still reach each other."
    ),
    "spec": {
        "devices": [
            {"kind": "switch", "name": "SW1", "ports": 4, "x": 400, "y": 80},
            {"kind": "switch", "name": "SW2", "ports": 4, "x": 260, "y": 300},
            {"kind": "switch", "name": "SW3", "ports": 4, "x": 540, "y": 300},
            {"kind": "host", "name": "H1", "x": 120, "y": 300},
            {"kind": "host", "name": "H2", "x": 680, "y": 300},
        ],
        "links": [
            {"dev_a": "SW1", "if_a": "FastEthernet0/0", "dev_b": "SW2", "if_b": "FastEthernet0/0"},
            {"dev_a": "SW2", "if_a": "FastEthernet0/1", "dev_b": "SW3", "if_b": "FastEthernet0/1"},
            {"dev_a": "SW3", "if_a": "FastEthernet0/0", "dev_b": "SW1", "if_b": "FastEthernet0/1"},
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "SW2", "if_b": "FastEthernet0/2"},
            {"dev_a": "H2", "if_a": "eth0", "dev_b": "SW3", "if_b": "FastEthernet0/2"},
        ],
        "config": {
            "SW1": _cfg("spanning-tree mode rapid-pvst", "spanning-tree vlan 1 priority 4096"),
            "SW2": _cfg("spanning-tree mode rapid-pvst"),
            "SW3": _cfg("spanning-tree mode rapid-pvst"),
            "H1": _host("192.168.1.10"),
            "H2": _host("192.168.1.20"),
        },
        "checks": [
            {"type": "stp_blocking", "name": "STP blocks a port to break the loop", "min_blocked": 1},
            {"type": "ping", "name": "H1 reaches H2 across the switched core", "src": "H1", "dst": "192.168.1.20", "expect": "success"},
        ],
    },
}

_VRRP = {
    "id": "ccnp-vrrp-redundancy",
    "name": "VRRP first-hop redundancy",
    "category": "CCNP",
    "level": "High Availability",
    "objective": (
        "Two routers share a VRRP virtual IP in group 1. The higher-priority "
        "router becomes Master and owns the virtual gateway that the host uses; "
        "the other is Backup."
    ),
    "spec": {
        "devices": [
            {"kind": "switch", "name": "SW1", "ports": 4, "x": 360, "y": 220},
            {"kind": "router", "name": "R1", "ports": 1, "x": 220, "y": 80},
            {"kind": "router", "name": "R2", "ports": 1, "x": 500, "y": 80},
            {"kind": "host", "name": "PC1", "x": 360, "y": 360},
        ],
        "links": [
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "SW1", "if_b": "FastEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/0", "dev_b": "SW1", "if_b": "FastEthernet0/1"},
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/2"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 192.168.1.2 255.255.255.0",
                "vrrp 1 ip 192.168.1.1", "vrrp 1 priority 120", "no shutdown", "exit",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/0", "ip address 192.168.1.3 255.255.255.0",
                "vrrp 1 ip 192.168.1.1", "vrrp 1 priority 100", "no shutdown", "exit",
            ),
            "PC1": _host("192.168.1.10", "192.168.1.1"),
        },
        "checks": [
            {"type": "hsrp_active", "name": "R1 is VRRP Master for group 1", "device": "R1", "group": 1, "expect_state": "Active"},
            {"type": "hsrp_active", "name": "R2 is VRRP Backup for group 1", "device": "R2", "group": 1, "expect_state": "Standby"},
            {"type": "ping", "name": "Host reaches the virtual gateway", "src": "PC1", "dst": "192.168.1.1", "expect": "success"},
        ],
    },
}

_IPSEC = {
    "id": "ccnp-ipsec-site-to-site",
    "name": "IPsec site-to-site VPN",
    "category": "CCNP",
    "level": "Security",
    "objective": (
        "Two edge routers build a site-to-site IPsec tunnel with matching "
        "interesting-traffic selectors. The tunnel comes up (UP-ACTIVE) and "
        "hosts at the two sites reach each other over the protected path."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 280, "y": 150},
            {"kind": "router", "name": "R2", "ports": 2, "x": 560, "y": 150},
            {"kind": "host", "name": "H1", "x": 80, "y": 150},
            {"kind": "host", "name": "H2", "x": 760, "y": 150},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/1", "dev_b": "R2", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/0", "dev_b": "H2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.1.1.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 10.0.12.1 255.255.255.0", "no shutdown", "exit",
                "ip route 10.2.2.0 255.255.255.0 10.0.12.2",
                "crypto tunnel 10.0.12.2 10.1.1.0/24 10.2.2.0/24",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.2.2.1 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 10.0.12.2 255.255.255.0", "no shutdown", "exit",
                "ip route 10.1.1.0 255.255.255.0 10.0.12.1",
                "crypto tunnel 10.0.12.1 10.2.2.0/24 10.1.1.0/24",
            ),
            "H1": _host("10.1.1.10", "10.1.1.1"),
            "H2": _host("10.2.2.10", "10.2.2.1"),
        },
        "checks": [
            {"type": "crypto_session", "name": "IPsec tunnel to peer is UP-ACTIVE", "device": "R1", "peer": "10.0.12.2", "expect_status": "UP-ACTIVE"},
            {"type": "ping", "name": "H1 reaches H2 over the VPN", "src": "H1", "dst": "10.2.2.10", "expect": "success"},
        ],
    },
}

_ZONE_FW = {
    "id": "ccnp-zone-firewall",
    "name": "Zone-based stateful firewall",
    "category": "CCNP",
    "level": "Security",
    "objective": (
        "A router places its LAN in zone INSIDE and its uplink in zone OUTSIDE. "
        "An INSIDE->OUTSIDE inspect policy allows inside-initiated traffic (and "
        "stateful return), while OUTSIDE-initiated traffic to the inside is "
        "denied by default."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 380, "y": 150},
            {"kind": "host", "name": "PC1", "x": 120, "y": 150},
            {"kind": "host", "name": "PC2", "x": 640, "y": 150},
        ],
        "links": [
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/1", "dev_b": "PC2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.0.254 255.255.255.0", "zone-member security INSIDE", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 10.0.1.254 255.255.255.0", "zone-member security OUTSIDE", "no shutdown", "exit",
                "zone-pair security INSIDE OUTSIDE inspect",
            ),
            "PC1": _host("10.0.0.1", "10.0.0.254"),
            "PC2": _host("10.0.1.1", "10.0.1.254"),
        },
        "checks": [
            {"type": "ping", "name": "Outside-initiated traffic to inside is denied", "src": "PC2", "dst": "10.0.0.1", "expect": "fail"},
            {"type": "ping", "name": "Inside-initiated traffic is inspected and allowed", "src": "PC1", "dst": "10.0.1.1", "expect": "success"},
        ],
    },
}

_PORT_SEC = {
    "id": "ccnp-port-security-violation",
    "name": "Switchport port-security violation (err-disable)",
    "category": "CCNP",
    "level": "Security",
    "objective": (
        "An access port is locked to one specific secure MAC address. When a "
        "host with a different MAC sends traffic the port violates port-security "
        "and goes err-disabled, dropping the traffic."
    ),
    "spec": {
        "devices": [
            {"kind": "switch", "name": "SW1", "ports": 4, "x": 360, "y": 150},
            {"kind": "host", "name": "H1", "x": 120, "y": 80},
            {"kind": "host", "name": "SRV", "x": 120, "y": 240},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/0"},
            {"dev_a": "SRV", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/1"},
        ],
        "config": {
            "SW1": _cfg(
                "interface FastEthernet0/0",
                "switchport port-security",
                "switchport port-security maximum 1",
                "switchport port-security mac-address AAAA.BBBB.CCCC",
                "exit",
            ),
            "H1": _host("10.0.0.1"),
            "SRV": _host("10.0.0.2"),
        },
        "checks": [
            {"type": "port_security", "name": "Fa0/0 err-disabled after MAC violation", "device": "SW1",
             "interface": "FastEthernet0/0", "src": "H1", "dst": "10.0.0.2", "expect_err_disabled": True},
        ],
    },
}

_DHCP_SNOOP = {
    "id": "ccnp-dhcp-snooping",
    "name": "DHCP snooping trusted-port binding",
    "category": "CCNP",
    "level": "Security",
    "objective": (
        "A switch runs DHCP snooping on the access VLAN with the uplink to the "
        "DHCP server marked trusted. A client lease through the trusted port "
        "creates a snooping binding (IP/MAC/port) used to police the edge."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 1, "x": 600, "y": 150},
            {"kind": "switch", "name": "SW1", "ports": 4, "x": 360, "y": 150},
            {"kind": "host", "name": "PC1", "x": 120, "y": 150},
        ],
        "links": [
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/0"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "SW1", "if_b": "FastEthernet0/3"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.0.254 255.255.255.0", "no shutdown", "exit",
                "ip dhcp excluded-address 10.0.0.254",
                "ip dhcp pool LAN", "network 10.0.0.0 255.255.255.0", "default-router 10.0.0.254", "exit",
            ),
            "SW1": _cfg(
                "ip dhcp snooping", "ip dhcp snooping vlan 1",
                "interface FastEthernet0/3", "ip dhcp snooping trust", "exit",
            ),
            "PC1": _cfg("interface eth0", "ip address dhcp", "exit"),
        },
        "checks": [
            {"type": "dhcp_snoop_binding", "name": "Snooping binding exists for the client", "device": "SW1", "client": "PC1"},
        ],
    },
}

_IPS = {
    "id": "ccie-ips-signature",
    "name": "IPS signature drop + alert",
    "category": "CCIE",
    "level": "Security",
    "objective": (
        "An inline IPS on the router matches an ICMP echo signature with a drop "
        "action. Matching traffic is dropped and an alert is logged, proving "
        "deep-packet signature enforcement on the data path."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 380, "y": 150},
            {"kind": "host", "name": "PC1", "x": 120, "y": 150},
            {"kind": "host", "name": "PC2", "x": 640, "y": 150},
        ],
        "links": [
            {"dev_a": "PC1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/1", "dev_b": "PC2", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/0", "ip address 10.0.0.254 255.255.255.0", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ip address 10.0.1.254 255.255.255.0", "no shutdown", "exit",
                "ip ips signature 2004 icmp type 8 drop name ICMP-ECHO",
            ),
            "PC1": _host("10.0.0.1", "10.0.0.254"),
            "PC2": _host("10.0.1.1", "10.0.1.254"),
        },
        "checks": [
            {"type": "ips_alert", "name": "IPS logs an alert for the matched signature", "device": "R1",
             "src": "PC1", "dst": "10.0.1.1", "expect_alert": True},
            {"type": "ping", "name": "Signature-matched ICMP is dropped", "src": "PC1", "dst": "10.0.1.1", "expect": "fail"},
        ],
    },
}

_DOT1X = {
    "id": "ccnp-dot1x-port-auth",
    "name": "802.1X port-based authentication",
    "category": "CCNP",
    "level": "Security",
    "objective": (
        "An access port runs 802.1X with port-control auto. Until the supplicant "
        "authenticates, the port stays unauthorized and blocks data traffic - "
        "demonstrating identity-based network access control."
    ),
    "spec": {
        "devices": [
            {"kind": "switch", "name": "SW1", "ports": 4, "x": 360, "y": 150},
            {"kind": "host", "name": "H1", "x": 120, "y": 80},
            {"kind": "host", "name": "H2", "x": 120, "y": 240},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/0"},
            {"dev_a": "H2", "if_a": "eth0", "dev_b": "SW1", "if_b": "FastEthernet0/1"},
        ],
        "config": {
            "SW1": _cfg(
                "dot1x system-auth-control",
                "username alice password s3cret",
                "interface FastEthernet0/0", "authentication port-control auto", "exit",
            ),
            "H1": _host("10.0.0.1"),
            "H2": _host("10.0.0.2"),
        },
        "checks": [
            {"type": "ping", "name": "Unauthenticated 802.1X port blocks traffic", "src": "H1", "dst": "10.0.0.2", "expect": "fail"},
        ],
    },
}

_IPV6_STATIC = {
    "id": "ccie-ipv6-static-routing",
    "name": "IPv6 end-to-end static routing",
    "category": "CCIE",
    "level": "IPv6",
    "objective": (
        "Three IPv6-only routers connect two host subnets across a transit "
        "core. Each router has IPv6 static routes for the far prefixes and the "
        "hosts reach each other with ping6."
    ),
    "spec": {
        "devices": [
            {"kind": "router", "name": "R1", "ports": 2, "x": 220, "y": 150},
            {"kind": "router", "name": "R2", "ports": 2, "x": 430, "y": 150},
            {"kind": "router", "name": "R3", "ports": 2, "x": 640, "y": 150},
            {"kind": "host", "name": "H1", "x": 60, "y": 150},
            {"kind": "host", "name": "H3", "x": 800, "y": 150},
        ],
        "links": [
            {"dev_a": "H1", "if_a": "eth0", "dev_b": "R1", "if_b": "GigabitEthernet0/1"},
            {"dev_a": "R1", "if_a": "GigabitEthernet0/0", "dev_b": "R2", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R2", "if_a": "GigabitEthernet0/1", "dev_b": "R3", "if_b": "GigabitEthernet0/0"},
            {"dev_a": "R3", "if_a": "GigabitEthernet0/1", "dev_b": "H3", "if_b": "eth0"},
        ],
        "config": {
            "R1": _cfg(
                "interface GigabitEthernet0/1", "ipv6 address 2001:db8:1::1/64", "no shutdown", "exit",
                "interface GigabitEthernet0/0", "ipv6 address 2001:db8:12::1/64", "no shutdown", "exit",
                "ipv6 route 2001:db8:23::/64 2001:db8:12::2",
                "ipv6 route 2001:db8:3::/64 2001:db8:12::2",
            ),
            "R2": _cfg(
                "interface GigabitEthernet0/0", "ipv6 address 2001:db8:12::2/64", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ipv6 address 2001:db8:23::1/64", "no shutdown", "exit",
                "ipv6 route 2001:db8:1::/64 2001:db8:12::1",
                "ipv6 route 2001:db8:3::/64 2001:db8:23::2",
            ),
            "R3": _cfg(
                "interface GigabitEthernet0/0", "ipv6 address 2001:db8:23::2/64", "no shutdown", "exit",
                "interface GigabitEthernet0/1", "ipv6 address 2001:db8:3::1/64", "no shutdown", "exit",
                "ipv6 route 2001:db8:1::/64 2001:db8:23::1",
                "ipv6 route 2001:db8:12::/64 2001:db8:23::1",
            ),
            "H1": _cfg(
                "interface eth0", "ipv6 address 2001:db8:1::10/64", "no shutdown", "exit",
                "ipv6 default-gateway 2001:db8:1::1",
            ),
            "H3": _cfg(
                "interface eth0", "ipv6 address 2001:db8:3::10/64", "no shutdown", "exit",
                "ipv6 default-gateway 2001:db8:3::1",
            ),
        },
        "checks": [
            {"type": "ping6", "name": "H1 reaches H3 over IPv6 static routes", "src": "H1", "dst": "2001:db8:3::10", "expect": "success"},
        ],
    },
}

_WIFI_WPA2 = {
    "id": "ccna-wireless-wpa2",
    "name": "Wireless WPA2-PSK association",
    "category": "CCNA",
    "level": "Wireless",
    "objective": (
        "An access point broadcasts a WPA2-PSK SSID. An in-range client with "
        "the correct pre-shared key completes the 4-way handshake and "
        "associates with keys installed."
    ),
    "spec": {
        "devices": [
            {"kind": "ap", "name": "AP1", "x": 400, "y": 200},
            {"kind": "wifi-client", "name": "STA1", "x": 430, "y": 200},
        ],
        "links": [],
        "config": {},
        "wireless": {
            "ssids": [{"device": "AP1", "ssid": "CorpWiFi", "auth": "wpa2-psk", "psk": "Net$im2024", "vlan": 10}],
            "profiles": [{"client": "STA1", "ssid": "CorpWiFi", "psk": "Net$im2024"}],
        },
        "checks": [
            {"type": "wifi_associated", "name": "STA1 associates to AP1 on CorpWiFi", "client": "STA1",
             "ssid": "CorpWiFi", "ap": "AP1", "expect_associated": True},
        ],
    },
}

_WIFI_WLC = {
    "id": "ccnp-wireless-wlc-capwap",
    "name": "Wireless: WLC + CAPWAP-joined AP",
    "category": "CCNP",
    "level": "Wireless",
    "objective": (
        "A lightweight AP joins a Wireless LAN Controller over CAPWAP; the "
        "controller pushes its WLAN to the AP. A client then associates to the "
        "controller-defined SSID through the AP."
    ),
    "spec": {
        "devices": [
            {"kind": "wlc", "name": "WLC1", "x": 200, "y": 120},
            {"kind": "ap", "name": "AP1", "x": 400, "y": 220},
            {"kind": "wifi-client", "name": "STA1", "x": 430, "y": 220},
        ],
        "links": [],
        "config": {},
        "wireless": {
            "ssids": [{"device": "WLC1", "ssid": "Campus", "auth": "wpa2-psk", "psk": "Campus#Key1", "vlan": 20}],
            "capwap": [{"ap": "AP1", "wlc": "WLC1"}],
            "profiles": [{"client": "STA1", "ssid": "Campus", "psk": "Campus#Key1"}],
        },
        "checks": [
            {"type": "wifi_associated", "name": "STA1 associates via the WLC-pushed WLAN", "client": "STA1",
             "ssid": "Campus", "ap": "AP1", "expect_associated": True},
        ],
    },
}


TEMPLATES: List[dict] = [
    _VLAN_TRUNK, _STATIC, _OSPF1, _DHCP, _ACL, _NAT,
    _OSPF_MULTI, _EBGP, _EIGRP, _HSRP, _ETHERCHANNEL,
    _MUTUAL_REDIST, _DUALSTACK,
    _RSTP, _VRRP, _IPSEC, _ZONE_FW, _PORT_SEC, _DHCP_SNOOP,
    _IPS, _DOT1X, _IPV6_STATIC, _WIFI_WPA2, _WIFI_WLC,
]

_BY_ID = {t["id"]: t for t in TEMPLATES}


def list_templates() -> List[dict]:
    """Metadata for every template (no full spec) for menu population."""
    out = []
    for t in TEMPLATES:
        spec = t["spec"]
        out.append({
            "id": t["id"],
            "name": t["name"],
            "category": t["category"],
            "level": t["level"],
            "objective": t["objective"],
            "devices": len(spec["devices"]),
            "links": len(spec["links"]),
            "checks": len(spec.get("checks", [])),
        })
    return out


def get_template(template_id: str) -> dict | None:
    return _BY_ID.get(template_id)
