"""Cisco-style context-sensitive help for the CLI.

Implements the IOS ``?`` experience on top of :class:`CLISession`:

* ``?``                 -> list every command valid in the current mode
* ``ip ?``              -> list the keywords/arguments that may follow ``ip``
* ``ip add?``           -> list commands beginning with ``add`` (word help)
* ``ip address ?``      -> show the expected ``<A.B.C.D>`` argument, etc.

The command set is described declaratively in :data:`SPEC` as a tree of
:class:`Node` objects, one sub-tree per CLI mode.  Each node carries a short
help string and an optional ``kinds`` filter so a host's ``config-if`` help
never offers switch-only ``switchport`` and vice-versa.  This module only
*describes* commands; the actual parsing/execution still lives in ``cli.py``.
"""

from __future__ import annotations

from typing import Dict, List, Optional

# CLI modes (kept identical to cli.py).
USER, PRIV, CONFIG, CONFIG_IF = "user", "priv", "config", "config-if"
CONFIG_DHCP, CONFIG_ROUTER, CONFIG_ACL = "config-dhcp", "config-router", "config-acl"

# Sentinel child keys.
ARG = "__arg__"  # a variable argument slot (e.g. an IP address)
CR = "__cr__"    # the command may be accepted as-is (<cr>)


class Node:
    """One entry in the help tree."""

    __slots__ = ("help", "children", "kinds", "meta", "dynamic")

    def __init__(
        self,
        help: str = "",
        children: Optional[Dict[str, "Node"]] = None,
        kinds: Optional[List[str]] = None,
        meta: Optional[str] = None,
        dynamic: Optional[str] = None,
    ):
        self.help = help
        self.children = children or {}
        self.kinds = kinds          # None => all device kinds
        self.meta = meta            # placeholder shown for ARG nodes, e.g. "A.B.C.D"
        self.dynamic = dynamic      # name of a runtime-expanded list (e.g. "interfaces")


def n(help="", children=None, kinds=None, meta=None, dynamic=None) -> Node:
    return Node(help, children, kinds, meta, dynamic)


def _cr(help: str = "") -> Dict[str, Node]:
    return {CR: n(help or "<cr>")}


# Common reusable fragments ------------------------------------------------

_IP_ADDR = n(
    "Set the IP address of an interface",
    children={
        ARG: n("IP address", meta="A.B.C.D", children={
            ARG: n("Subnet mask", meta="A.B.C.D", children=_cr("Apply address & mask")),
        }),
        "dhcp": n("Obtain an address automatically via DHCP", kinds=["host"],
                  children=_cr()),
    },
)

_NO_IF = n("Negate a command / restore defaults", children={
    "shutdown": n("Enable the interface (bring it up)", children=_cr()),
    "ip": n("Remove IP configuration", children={
        "address": n("Remove the interface IP address", children=_cr()),
    }),
})

_SWITCHPORT = n("Configure switching characteristics", kinds=["switch"], children={
    "mode": n("Set trunking mode", children={
        "access": n("Set port to permanent non-trunking (access)", children=_cr()),
        "trunk": n("Set port to permanent trunking", children=_cr()),
    }),
    "access": n("Set access-mode parameters", children={
        "vlan": n("Assign the access VLAN", children={
            ARG: n("VLAN id (1-4094)", meta="1-4094", children=_cr()),
        }),
    }),
    "trunk": n("Set trunk parameters", children={
        "native": n("Native VLAN for the trunk", children={
            "vlan": n("Native VLAN id", children={
                ARG: n("VLAN id", meta="1-4094", children=_cr()),
            }),
        }),
    }),
    "port-security": n("Configure port security", children={
        CR: n("Enable port security on the interface"),
        "maximum": n("Max secure MAC addresses", children={
            ARG: n("Maximum number", meta="1-132", children=_cr())}),
        "violation": n("Action on violation", children={
            "shutdown": n("Err-disable the port", children=_cr()),
            "restrict": n("Drop & count violations", children=_cr()),
            "protect": n("Silently drop violations", children=_cr()),
        }),
        "mac-address": n("Configure a secure MAC", children={
            "sticky": n("Learn & pin MACs dynamically", children=_cr()),
            ARG: n("Static secure MAC", meta="H.H.H", children=_cr()),
        }),
    }),
})

# ----------------------------------------------------------------- show tree
_SHOW = n("Display running system information", children={
    "running-config": n("Current operating configuration", children=_cr()),
    "version": n("System hardware and software status", children=_cr()),
    "ip": n("IP information", children={
        "interface": n("IP interface status", children={
            "brief": n("Brief summary of IP status per interface", children=_cr()),
        }),
        "route": n("IP routing table", kinds=["router"], children=_cr()),
        "arp": n("ARP table", children=_cr()),
        "ospf": n("OSPF information", kinds=["router"], children={
            "neighbor": n("OSPF neighbor list", children=_cr())}),
        "eigrp": n("EIGRP information", kinds=["router"], children={
            "neighbors": n("EIGRP neighbor list", children=_cr())}),
        "bgp": n("BGP information", kinds=["router"], children={
            CR: n("BGP routing table"),
            "summary": n("BGP neighbor summary", children=_cr())}),
        "dhcp": n("DHCP information", children={
            "binding": n("DHCP server lease bindings", children=_cr()),
            "snooping": n("DHCP snooping status", kinds=["switch"], children={
                CR: n("Snooping configuration"),
                "binding": n("Snooping binding table", children=_cr())}),
        }),
        "nat": n("NAT information", kinds=["router"], children={
            "translations": n("Active NAT translations", children=_cr())}),
        "access-lists": n("Access list contents", children=_cr()),
        "ips": n("IPS signatures & hit counters", kinds=["router"], children=_cr()),
    }),
    "ipv6": n("IPv6 information", children={
        "route": n("IPv6 routing table", children=_cr()),
        "interface": n("IPv6 interface status", children={
            "brief": n("Brief IPv6 status per interface", children=_cr())}),
    }),
    "mac": n("MAC address table", kinds=["switch"], children={
        "address-table": n("MAC address forwarding table", children=_cr())}),
    "vlan": n("VLAN information", kinds=["switch"], children=_cr()),
    "spanning-tree": n("Spanning-tree topology & port roles", kinds=["switch"],
                       children=_cr()),
    "interfaces": n("Interface status and statistics", children={
        "trunk": n("Trunk port summary", kinds=["switch"], children=_cr())}),
    "cdp": n("Cisco Discovery Protocol", children={
        "neighbors": n("CDP neighbor table", children={
            CR: n("Neighbor summary"),
            "detail": n("Detailed neighbor info", children=_cr())})}),
    "lldp": n("Link Layer Discovery Protocol", children={
        "neighbors": n("LLDP neighbor table", children=_cr())}),
    "standby": n("HSRP group status", kinds=["router"], children=_cr()),
    "etherchannel": n("EtherChannel/port-channel status", children=_cr()),
    "port-security": n("Port-security status", kinds=["switch"], children=_cr()),
    "crypto": n("IPsec/crypto session status", kinds=["router"], children={
        "session": n("Active crypto sessions", children=_cr())}),
    "zone-pair": n("Zone-based firewall pair status", kinds=["router"], children=_cr()),
    "authentication": n("802.1X authentication sessions", kinds=["switch"], children={
        "sessions": n("Per-port auth sessions", children=_cr())}),
    "arp": n("ARP table", children=_cr()),
})

_PING = n("Send ICMP echo messages", children={
    ARG: n("Destination address (IPv4 or IPv6)", meta="WORD", children=_cr())})
_TRACE = n("Trace the route to a destination", children={
    ARG: n("Destination address", meta="A.B.C.D", children=_cr())})

# IPS signature actions/qualifiers reused for every protocol.
_IPS_ACTION = {
    "alert": n("Log an alert when matched", children=_cr()),
    "drop": n("Drop matching packets", children=_cr()),
    "type": n("Match a specific ICMP type", children={
        ARG: n("ICMP type", meta="0-255", children=_cr())}),
    "port": n("Match a destination port", children={
        ARG: n("Port number", meta="1-65535", children=_cr())}),
    "name": n("Name this signature", children={
        ARG: n("Signature name", meta="WORD", children=_cr())}),
}

# NAT 'ip nat inside source ...' sub-tree.
_NAT_SOURCE = n("Configure source address translation", children={
    "static": n("Static inside->outside mapping", children={
        ARG: n("Inside local address", meta="A.B.C.D", children={
            ARG: n("Inside global address", meta="A.B.C.D", children=_cr())})}),
    "list": n("Dynamic translation matched by an ACL", children={
        ARG: n("Access-list name/number", meta="WORD", children={
            "pool": n("Translate using a NAT pool", children={
                ARG: n("Pool name", meta="WORD", children=_cr())}),
            "interface": n("PAT to an interface address", children={
                ARG: n("Interface name", meta="name", dynamic="interfaces",
                       children=_cr())}),
            "overload": n("Enable PAT (port overload)", children=_cr()),
        })}),
})

# Standard/extended ACL match grammar (used by numbered & named ACL config).
_ACL_MATCH = {
    "ip": n("Any IP protocol (extended ACL)", children=_cr()),
    "icmp": n("ICMP (extended ACL)", children=_cr()),
    "tcp": n("TCP (extended ACL)", children=_cr()),
    "udp": n("UDP (extended ACL)", children=_cr()),
    "any": n("Match any source", children=_cr()),
    "host": n("Match a single host", children={
        ARG: n("Host address", meta="A.B.C.D", children=_cr())}),
    ARG: n("Source address (+ wildcard mask)", meta="A.B.C.D", children=_cr()),
}

# ------------------------------------------------------------ config sub-trees
_CONFIG_IP = n("Global IP configuration", children={
    "route": n("Add a static route", kinds=["router"], children={
        ARG: n("Destination prefix", meta="A.B.C.D", children={
            ARG: n("Destination mask", meta="A.B.C.D", children={
                ARG: n("Next-hop / exit interface", meta="A.B.C.D", children=_cr()),
            })})}),
    "default-gateway": n("Set the default gateway", kinds=["host", "switch"], children={
        ARG: n("Gateway IP address", meta="A.B.C.D", children=_cr())}),
    "dhcp": n("DHCP server / snooping config", kinds=["router", "switch"], children={
        "pool": n("Create a DHCP address pool", kinds=["router"], children={
            ARG: n("Pool name", meta="WORD", children=_cr("Enter DHCP pool config"))}),
        "excluded-address": n("Reserve addresses from the pool", kinds=["router"], children={
            ARG: n("First address", meta="A.B.C.D", children={
                CR: n("Exclude this single address"),
                ARG: n("Last address", meta="A.B.C.D", children=_cr())})}),
        "snooping": n("Enable DHCP snooping", kinds=["switch"], children=_cr()),
    }),
    "nat": n("NAT configuration", kinds=["router"], children={
        "inside": n("Mark inside / inside source translation", children={
            CR: n("(on an interface) mark as NAT inside"),
            "source": _NAT_SOURCE}),
        "outside": n("Mark the outside interface", children=_cr()),
        "pool": n("Define a NAT address pool", children={
            ARG: n("Pool name", meta="WORD", children={
                ARG: n("Start address", meta="A.B.C.D", children={
                    ARG: n("End address", meta="A.B.C.D", children={
                        "netmask": n("Pool netmask", children={
                            ARG: n("Netmask", meta="A.B.C.D", children=_cr())}),
                        "prefix-length": n("Pool prefix length", children={
                            ARG: n("Length", meta="1-32", children=_cr())}),
                    })})})}),
    }),
    "access-list": n("Define a named access list", kinds=["router"], children={
        "standard": n("Standard named ACL", children={
            ARG: n("ACL name", meta="WORD", children=_cr("Enter ACL configuration"))}),
        "extended": n("Extended named ACL", children={
            ARG: n("ACL name", meta="WORD", children=_cr("Enter ACL configuration"))}),
    }),
    "arp": n("ARP inspection (DAI)", kinds=["switch"], children={
        "inspection": n("Dynamic ARP Inspection", children={
            "vlan": n("Enable DAI on a VLAN", children={
                ARG: n("VLAN id", meta="1-4094", children=_cr())})})}),
    "ips": n("Intrusion-prevention signatures", kinds=["router"], children={
        "signature": n("Define an IPS signature", children={
            ARG: n("Signature id", meta="WORD", children={
                "icmp": n("ICMP signature", children=dict(_IPS_ACTION)),
                "udp": n("UDP signature", children=dict(_IPS_ACTION)),
                "tcp": n("TCP signature", children=dict(_IPS_ACTION)),
                "ip": n("IP signature", children=dict(_IPS_ACTION)),
            })})}),
})

_CONFIG_IF_TREE = {
    "ip": n("Interface IP configuration", children={
        "address": _IP_ADDR,
        "access-group": n("Apply an ACL to the interface", kinds=["router"], children={
            ARG: n("ACL name/number", meta="WORD", children={
                "in": n("Inbound direction", children=_cr()),
                "out": n("Outbound direction", children=_cr())})}),
        "helper-address": n("Forward broadcasts (DHCP relay)", kinds=["router"],
                            children={ARG: n("Helper IP", meta="A.B.C.D", children=_cr())}),
        "nat": n("Mark NAT inside/outside", kinds=["router"], children={
            "inside": n("Inside interface", children=_cr()),
            "outside": n("Outside interface", children=_cr())}),
        "verify": n("IP source guard", kinds=["switch"], children={
            "source": n("Validate source IP/MAC", children=_cr())}),
        "dhcp": n("DHCP snooping trust", kinds=["switch"], children={
            "snooping": n("", children={"trust": n("Trust this port", children=_cr())})}),
        "arp": n("ARP inspection trust", kinds=["switch"], children={
            "inspection": n("", children={"trust": n("Trust this port", children=_cr())})}),
    }),
    "ipv6": n("Interface IPv6 configuration", children={
        "address": n("Set an IPv6 address", children={
            ARG: n("IPv6 address/prefix", meta="X:X:X:X::X/<len>", children=_cr())})}),
    "shutdown": n("Administratively disable the interface", children=_cr()),
    "no": _NO_IF,
    "switchport": _SWITCHPORT,
    "standby": n("HSRP first-hop redundancy", kinds=["router"], children={
        ARG: n("Group number", meta="0-255", children={
            "ip": n("Virtual IP address", children={
                ARG: n("Virtual IP", meta="A.B.C.D", children=_cr())}),
            "priority": n("Group priority", children={
                ARG: n("Priority (default 100)", meta="0-255", children=_cr())}),
            "preempt": n("Allow this router to preempt", children=_cr())})}),
    "vrrp": n("VRRP first-hop redundancy", kinds=["router"], children={
        ARG: n("Group number", meta="1-255", children={
            "ip": n("Virtual IP address", children={
                ARG: n("Virtual IP", meta="A.B.C.D", children=_cr())}),
            "priority": n("Group priority", children=_cr()),
            "preempt": n("Allow preemption", children=_cr())})}),
    "channel-group": n("Bundle into an EtherChannel", kinds=["switch", "router"], children={
        ARG: n("Channel-group number", meta="1-48", children={
            "mode": n("LACP/static mode", children={
                "on": n("Unconditional bundle", children=_cr()),
                "active": n("LACP active", children=_cr()),
                "passive": n("LACP passive", children=_cr())})})}),
    "zone-member": n("Assign interface to a firewall zone", kinds=["router"], children={
        "security": n("Security zone", children={
            ARG: n("Zone name", meta="WORD", children=_cr())})}),
    "dot1x": n("802.1X port authentication", kinds=["switch"], children={
        "pae": n("Set Port Access Entity role", children=_cr()),
        "port-control": n("Set the authorization mode", children=_cr())}),
}

_CONFIG_ROUTER_TREE = {
    "network": n("Advertise a network into the routing process", children={
        ARG: n("Network address", meta="A.B.C.D", children=_cr())}),
    "neighbor": n("Configure a BGP neighbor", children={
        ARG: n("Neighbor IP", meta="A.B.C.D", children={
            "remote-as": n("Neighbor AS number", children={
                ARG: n("AS number", meta="1-65535", children=_cr())})})}),
    "redistribute": n("Redistribute routes from another protocol", children={
        "connected": n("Connected routes", children=_cr()),
        "static": n("Static routes", children=_cr()),
        "ospf": n("OSPF routes", children=_cr()),
        "eigrp": n("EIGRP routes", children=_cr()),
        "rip": n("RIP routes", children=_cr()),
        "bgp": n("BGP routes", children=_cr()),
    }),
    "passive-interface": n("Suppress routing updates on an interface", children=_cr()),
    "version": n("RIP version", children=_cr()),
    "auto-summary": n("Toggle automatic summarisation", children=_cr()),
    "default-metric": n("Default redistribution metric", children=_cr()),
}

# Top-level SPEC keyed by mode. -------------------------------------------
SPEC: Dict[str, Dict[str, Node]] = {
    USER: {
        "enable": n("Turn on privileged commands", children=_cr()),
        "ping": _PING,
        "traceroute": _TRACE,
        "show": _SHOW,
        "exit": n("Exit the session", children=_cr()),
    },
    PRIV: {
        "configure": n("Enter configuration mode", children={
            "terminal": n("Configure from the terminal", children=_cr())}),
        "show": _SHOW,
        "ping": _PING,
        "traceroute": _TRACE,
        "clear": n("Reset functions", children={
            "ip": n("IP subsystem", children={
                "nat": n("Clear NAT translations", kinds=["router"], children={
                    "translation": n("Translation table", children=_cr())})})}),
        "write": n("Save the running configuration", children=_cr()),
        "reload": n("Halt and reboot the device", children=_cr()),
        "disable": n("Return to user mode", children=_cr()),
        "exit": n("Exit privileged mode", children=_cr()),
    },
    CONFIG: {
        "hostname": n("Set the device name", children={
            ARG: n("New hostname", meta="WORD", children=_cr())}),
        "interface": n("Select an interface to configure", children={
            ARG: n("Interface name", meta="name", dynamic="interfaces", children=_cr())}),
        "ip": _CONFIG_IP,
        "ipv6": n("Global IPv6 configuration", children={
            "route": n("Add an IPv6 static route", kinds=["router"], children={
                ARG: n("Destination prefix", meta="X:X:X:X::X/<len>", children={
                    ARG: n("Next-hop address", meta="X:X:X:X::X", children=_cr())})}),
            "unicast-routing": n("Enable IPv6 routing", kinds=["router"], children=_cr()),
            "default-gateway": n("Set IPv6 default gateway", kinds=["host"], children={
                ARG: n("Gateway address", meta="X:X:X:X::X", children=_cr())}),
        }),
        "no": n("Negate a global command", children={
            "hostname": n("Restore the default hostname", children=_cr())}),
        "spanning-tree": n("Spanning-tree configuration", kinds=["switch"], children={
            "mode": n("STP mode", children={
                "pvst": n("Per-VLAN Spanning Tree", children=_cr()),
                "rapid-pvst": n("Rapid PVST+", children=_cr())}),
            "vlan": n("Per-VLAN tuning", children=_cr())}),
        "vlan": n("Create/configure a VLAN", kinds=["switch"], children={
            ARG: n("VLAN id", meta="1-4094", children=_cr())}),
        "router": n("Enable a routing process", kinds=["router"], children={
            "ospf": n("Open Shortest Path First", children={
                ARG: n("Process id", meta="1-65535", children=_cr())}),
            "bgp": n("Border Gateway Protocol", children={
                ARG: n("Local AS number", meta="1-65535", children=_cr())}),
            "eigrp": n("Enhanced IGRP", children={
                ARG: n("AS number", meta="1-65535", children=_cr())}),
            "rip": n("Routing Information Protocol", children=_cr())}),
        "access-list": n("Define a numbered ACL", kinds=["router"], children={
            ARG: n("ACL number (1-99 std, 100-199 ext)", meta="1-199", children=_cr())}),
        "aaa": n("Authentication/authorization config", kinds=["router", "switch"],
                  children={
                      "new-model": n("Enable the AAA access-control model", children=_cr()),
                      "authentication": n("Configure authentication method lists",
                                          children=_cr()),
                      "authorization": n("Configure authorization method lists",
                                         children=_cr()),
                  }),
        "username": n("Establish a local user", kinds=["router", "switch"], children={
            ARG: n("Username", meta="WORD", children={
                "password": n("Set a cleartext password", children={
                    ARG: n("Password", meta="WORD", children=_cr())}),
                "secret": n("Set an encrypted secret", children={
                    ARG: n("Secret", meta="WORD", children=_cr())}),
            })}),
        "zone": n("Define a firewall security zone", kinds=["router"], children={
            "security": n("Security zone", children={
                ARG: n("Zone name", meta="WORD", children=_cr())})}),
        "zone-pair": n("Define a firewall zone pair", kinds=["router"], children={
            "security": n("Security zone pair", children={
                ARG: n("Source zone", meta="WORD", children={
                    ARG: n("Destination zone", meta="WORD", children={
                        "permit": n("Permit traffic between zones", children=_cr()),
                        "inspect": n("Statefully inspect traffic", children=_cr()),
                        "deny": n("Drop traffic between zones", children=_cr()),
                    })})})}),
        "crypto": n("IPsec/VPN configuration", kinds=["router"], children={
            "tunnel": n("Define an IPsec protected tunnel", children={
                ARG: n("Peer address", meta="A.B.C.D", children={
                    ARG: n("Local protected prefix", meta="A.B.C.D/len", children={
                        ARG: n("Remote protected prefix", meta="A.B.C.D/len",
                               children=_cr())})})})}),
        "dot1x": n("Global 802.1X configuration", kinds=["switch"], children={
            "system-auth-control": n("Enable 802.1X globally", children=_cr())}),
        "exit": n("Leave configuration mode", children=_cr()),
    },
    CONFIG_IF: _CONFIG_IF_TREE,
    CONFIG_DHCP: {
        "network": n("Define the pool subnet", children={
            ARG: n("Network address", meta="A.B.C.D", children={
                ARG: n("Subnet mask", meta="A.B.C.D", children=_cr())})}),
        "default-router": n("Gateway handed to clients", children={
            ARG: n("Gateway IP", meta="A.B.C.D", children=_cr())}),
        "dns-server": n("DNS server handed to clients", children={
            ARG: n("DNS IP", meta="A.B.C.D", children=_cr())}),
        "exit": n("Leave DHCP pool config", children=_cr()),
    },
    CONFIG_ROUTER: _CONFIG_ROUTER_TREE,
    CONFIG_ACL: {
        "permit": n("Specify packets to forward", children=dict(_ACL_MATCH)),
        "deny": n("Specify packets to reject", children=dict(_ACL_MATCH)),
        "exit": n("Leave ACL config", children=_cr()),
    },
}

# Always-available navigation commands (added to every mode listing).
_NAV = {
    CONFIG: {"exit": "Leave configuration mode", "end": "Return to privileged mode"},
    CONFIG_IF: {"exit": "Leave interface config", "end": "Return to privileged mode"},
    CONFIG_DHCP: {"exit": "Leave pool config", "end": "Return to privileged mode"},
    CONFIG_ROUTER: {"exit": "Leave router config", "end": "Return to privileged mode"},
    CONFIG_ACL: {"exit": "Leave ACL config", "end": "Return to privileged mode"},
}


def _kind_ok(node: Node, kind: str) -> bool:
    return node.kinds is None or kind in node.kinds


def _expand_dynamic(name: str, device) -> List[tuple]:
    """Return (token, help) pairs for a runtime-expanded argument list."""
    if name == "interfaces" and device is not None:
        return [(iface.name, "Interface") for iface in device.interfaces.values()]
    return []


def _format(pairs: List[tuple]) -> str:
    """Render ``[(token, help), ...]`` as an aligned IOS-style help block."""
    if not pairs:
        return "% No help available"
    width = max(len(tok) for tok, _ in pairs)
    width = max(width, 4)
    lines = [f"  {tok:<{width}}  {help}".rstrip() for tok, help in pairs]
    return "\n".join(lines)


def _listing(children: Dict[str, Node], kind: str, device, partial: str) -> str:
    pairs: List[tuple] = []
    has_cr = False
    for key, node in children.items():
        if key == CR:
            has_cr = True
            continue
        if key == ARG:
            if node.dynamic:
                for tok, h in _expand_dynamic(node.dynamic, device):
                    if tok.lower().startswith(partial.lower()):
                        pairs.append((tok, h))
            else:
                meta = f"<{node.meta}>" if node.meta else "<value>"
                pairs.append((meta, node.help))
            continue
        if not _kind_ok(node, kind):
            continue
        if partial and not key.startswith(partial.lower()):
            continue
        pairs.append((key, node.help))
    pairs.sort(key=lambda p: (p[0].startswith("<"), p[0]))
    if has_cr and not partial:
        pairs.append(("<cr>", ""))
    return _format(pairs)


def context_help(mode: str, device, line: str) -> Optional[str]:
    """Return IOS-style help for a ``?``-terminated *line*, else ``None``.

    *line* is the raw console buffer including the trailing ``?``.  ``device``
    supplies the device kind and (for dynamic args) its interface list.
    """
    if "?" not in line:
        return None
    kind = getattr(device, "kind", "device")
    before = line.split("?", 1)[0]
    trailing_space = before.endswith(" ") or before.strip() == ""
    tokens = before.split()
    partial = "" if trailing_space else (tokens.pop() if tokens else "")

    roots = dict(SPEC.get(mode, {}))
    # Walk completed tokens down the tree.
    children = roots
    node: Optional[Node] = None
    for tok in tokens:
        match = _resolve(children, tok, kind, device)
        if match is None:
            avail = _listing(children, kind, device, "")
            if avail and not avail.startswith("%"):
                return (f"% '{tok}' is not valid here - type ? for the commands "
                        f"available in this mode.\n{avail}")
            return f"% '{tok}' is not valid here - type ? for a list of commands."
        key, node = match
        children = node.children

    listing = _listing(children, kind, device, partial)
    # Append navigation hints when listing a full mode (no tokens, no partial).
    if not tokens and not partial and mode in _NAV:
        existing = {ln.strip().split(" ")[0] for ln in listing.splitlines()}
        extra = [(k, v) for k, v in _NAV[mode].items() if k not in existing]
        if extra:
            listing = (listing + "\n" + _format(extra)).strip("\n")
    return listing


def _resolve(children: Dict[str, Node], token: str, kind: str, device):
    """Match *token* against the literal children, else fall back to ARG."""
    literals = {k: v for k, v in children.items()
                if k not in (CR, ARG) and _kind_ok(v, kind)}
    tl = token.lower()
    hits = [k for k in literals if k.startswith(tl)]
    if len(hits) == 1:
        return hits[0], literals[hits[0]]
    if tl in literals:
        return tl, literals[tl]
    if ARG in children:
        return ARG, children[ARG]
    return None
