"""Devices, interfaces and links that make up a topology."""

from __future__ import annotations

import ipaddress
import itertools
from dataclasses import dataclass, field
from typing import Dict, List, Optional

_mac_counter = itertools.count(1)


def generate_mac() -> str:
    n = next(_mac_counter)
    # Locally administered, human-readable, dotted-hex (Cisco style).
    raw = f"0200{n:08X}"
    return f"{raw[0:4]}.{raw[4:8]}.{raw[8:12]}".upper()


def _split_iface(name: str) -> tuple:
    """Split 'gigabitethernet0/0' into ('gigabitethernet', '0/0')."""
    i = 0
    while i < len(name) and name[i].isalpha():
        i += 1
    return name[:i], name[i:]


def normalize_mask(mask: str) -> int:
    """Accept either a prefix length ('24') or dotted mask ('255.255.255.0')
    and return the prefix length."""
    mask = str(mask).strip()
    if "." in mask:
        return ipaddress.IPv4Network(f"0.0.0.0/{mask}").prefixlen
    return int(mask)


@dataclass
class Interface:
    name: str
    mac: str = field(default_factory=generate_mac)
    ip: Optional[str] = None
    prefix: Optional[int] = None
    ipv6: Optional[str] = None  # global IPv6 address (dual-stack)
    ipv6_prefix: Optional[int] = None
    enabled: bool = False  # interfaces start administratively down (Cisco default)
    mode: str = "access"  # access | trunk (switch ports)
    vlan: int = 1  # access vlan (or native vlan on a trunk)
    stp_state: str = "forwarding"  # forwarding | blocking (switch ports)
    ospf_area: Optional[int] = None  # area this interface participates in, if any
    acl_in: Optional[str] = None  # inbound access-group (acl name/number)
    acl_out: Optional[str] = None  # outbound access-group
    nat_role: Optional[str] = None  # 'inside' | 'outside' (ip nat inside/outside)
    channel_group: Optional[int] = None  # EtherChannel port-channel id
    channel_mode: Optional[str] = None  # 'on' | 'active' | 'passive' | 'desirable'
    stp_role: str = "designated"  # root | designated | alternate (for show output)
    # HSRP/VRRP standby groups: group id -> {vip, priority, preempt, proto, version}
    hsrp: Dict[int, dict] = field(default_factory=dict)
    # --- Phase 10 security (switch ports) ---
    port_security: bool = False
    port_security_max: int = 1
    port_security_violation: str = "shutdown"  # shutdown | restrict | protect
    port_security_sticky: bool = False
    port_security_macs: set = field(default_factory=set)  # secured/sticky MACs
    err_disabled: bool = False  # port shut by a security violation
    dhcp_snoop_trust: bool = False  # DHCP-snooping trusted port
    ip_source_guard: bool = False
    dot1x: bool = False  # 802.1X port-based auth enabled
    dot1x_authorized: bool = False  # supplicant has authenticated
    # --- Phase 10 security (router L3) ---
    zone: Optional[str] = None  # zone-based firewall membership
    link: Optional["Link"] = field(default=None, repr=False)
    device: Optional["Device"] = field(default=None, repr=False)

    def set_ip(self, ip: str, mask: str) -> None:
        self.ip = ip
        self.prefix = normalize_mask(mask)

    @property
    def network(self) -> Optional[ipaddress.IPv4Network]:
        if self.ip is None or self.prefix is None:
            return None
        return ipaddress.IPv4Network(f"{self.ip}/{self.prefix}", strict=False)

    def set_ipv6(self, addr: str, prefix: int) -> None:
        self.ipv6 = addr
        self.ipv6_prefix = int(prefix)

    @property
    def network6(self) -> Optional[ipaddress.IPv6Network]:
        if self.ipv6 is None or self.ipv6_prefix is None:
            return None
        return ipaddress.IPv6Network(f"{self.ipv6}/{self.ipv6_prefix}", strict=False)

    @property
    def is_up(self) -> bool:
        if self.err_disabled:
            return False
        return self.enabled and self.link is not None and self.link.is_up

    @property
    def forwarding(self) -> bool:
        """Up and not blocked by spanning tree."""
        return self.is_up and self.stp_state != "blocking"

    def peer(self) -> Optional["Interface"]:
        if self.link is None:
            return None
        return self.link.other_end(self)


@dataclass
class Link:
    a: Interface
    b: Interface
    up: bool = True

    @property
    def is_up(self) -> bool:
        return self.up and self.a.enabled and self.b.enabled

    def other_end(self, iface: Interface) -> Interface:
        return self.b if iface is self.a else self.a


class Device:
    kind = "device"

    def __init__(self, name: str):
        self.name = name
        self.hostname = name
        self.interfaces: Dict[str, Interface] = {}

    def add_interface(self, name: str, **kwargs) -> Interface:
        iface = Interface(name=name, **kwargs)
        iface.device = self
        self.interfaces[name] = iface
        return iface

    def get_interface(self, name: str) -> Optional[Interface]:
        if name in self.interfaces:
            return self.interfaces[name]
        lowered = name.lower().replace(" ", "")
        for iname, iface in self.interfaces.items():
            if iname.lower().replace(" ", "") == lowered:
                return iface
        # tolerate Cisco abbreviations like "g0/0" -> "GigabitEthernet0/0"
        want_alpha, want_num = _split_iface(lowered)
        if want_alpha:
            for iname, iface in self.interfaces.items():
                have_alpha, have_num = _split_iface(iname.lower())
                if have_alpha.startswith(want_alpha) and have_num == want_num:
                    return iface
        return None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "hostname": self.hostname,
            "kind": self.kind,
            "interfaces": [
                {
                    "name": i.name,
                    "mac": i.mac,
                    "ip": i.ip,
                    "prefix": i.prefix,
                    "enabled": i.enabled,
                    "mode": i.mode,
                    "vlan": i.vlan,
                    "stp_state": i.stp_state,
                    "up": i.is_up,
                    "connected": i.link is not None,
                }
                for i in self.interfaces.values()
            ],
        }


class Host(Device):
    kind = "host"

    def __init__(self, name: str):
        super().__init__(name)
        self.add_interface("eth0")
        self.gateway: Optional[str] = None
        self.gateway6: Optional[str] = None
        self.arp_table: Dict[str, str] = {}  # ip -> mac
        # IP packets waiting for ARP resolution, keyed by next-hop ip
        self.pending: Dict[str, list] = {}
        self.dhcp_enabled: bool = False  # eth0 set to learn its address via DHCP
        self.dhcp_lease: Optional[dict] = None  # last lease granted to this host

    @property
    def primary(self) -> Interface:
        return self.interfaces["eth0"]


class Switch(Device):
    kind = "switch"

    def __init__(self, name: str, ports: int = 4):
        super().__init__(name)
        for p in range(ports):
            iface = self.add_interface(f"FastEthernet0/{p}")
            iface.enabled = True  # switchports are enabled by default
        # mac_table maps (vlan, mac) -> interface name
        self.mac_table: Dict[tuple, str] = {}
        self.bridge_priority: int = 32768  # default STP priority
        self.vlans: Dict[int, str] = {1: "default"}  # vlan id -> name
        self.stp_mode: str = "pvst"  # pvst | rapid-pvst (RSTP)
        # --- Phase 10 security ---
        self.dhcp_snooping: bool = False
        self.dhcp_snoop_vlans: set = set()  # empty = all vlans
        # DHCP-snooping binding table: list of {mac, ip, vlan, interface}
        self.dhcp_snoop_bindings: List[dict] = []
        self.dai: bool = False  # dynamic ARP inspection
        self.dai_vlans: set = set()
        # recorded security violations: list of {kind, interface, detail}
        self.security_log: List[dict] = []
        # 802.1X: global enable + local user database for supplicant auth
        self.dot1x_system: bool = False
        self.aaa_users: Dict[str, str] = {}

    @property
    def bridge_id(self) -> tuple:
        """(priority, lowest interface MAC) — lower wins the root election."""
        macs = [i.mac for i in self.interfaces.values()]
        return (self.bridge_priority, min(macs) if macs else "FFFF.FFFF.FFFF")


class Router(Device):
    kind = "router"

    def __init__(self, name: str, ports: int = 2):
        super().__init__(name)
        for p in range(ports):
            self.add_interface(f"GigabitEthernet0/{p}")
        self.arp_table: Dict[str, str] = {}
        # static routes: list of (network, prefix, next_hop_ip)
        self.static_routes: List[tuple] = []
        # (egress_interface_name, IpPacket) waiting for ARP, keyed by next-hop ip
        self.pending: Dict[str, list] = {}
        # OSPF: process id (None = not running) and learned routes
        self.ospf_pid: Optional[int] = None
        # network statements: list of (network, prefix, area)
        self.ospf_networks: List[tuple] = []
        # routes installed by OSPF: list of (network, prefix, next_hop, cost)
        self.ospf_routes: List[tuple] = []
        # DHCP server pools keyed by pool name
        self.dhcp_pools: Dict[str, "DhcpPool"] = {}
        # DHCP leases granted: list of dicts {ip, mac, pool}
        self.dhcp_leases: List[dict] = []
        # addresses excluded from any DHCP pool
        self.dhcp_excluded: set = set()
        # per-interface DHCP relay target (ip helper-address)
        self.helper_addresses: Dict[str, str] = {}
        # access lists: name/number -> {"kind": "standard"|"extended", "entries": [AclEntry,...]}
        self.acls: Dict[str, dict] = {}
        # NAT: static one-to-one maps (inside_local, inside_global)
        self.nat_static: List[tuple] = []
        # NAT address pools: name -> {"start","end","prefix"}
        self.nat_pools: Dict[str, dict] = {}
        # NAT dynamic rules: {"acl","pool"|None,"interface"|None,"overload":bool}
        self.nat_dynamic: List[dict] = []
        # active translations recorded for `show ip nat translations`
        self.nat_table: List[dict] = []
        # reverse PAT map: (proto, global_ip, global_id) -> (inside_local, original_id)
        self.nat_pat_reverse: Dict[tuple, tuple] = {}
        # 1:1 dynamic-pool allocation: inside_local -> inside_global
        self.nat_pool_map: Dict[str, str] = {}
        self.nat_next_id: int = 10000  # PAT identifier allocator
        # BGP: local AS (None = not running), neighbors, originated networks, learned routes
        self.bgp_asn: Optional[int] = None
        self.bgp_neighbors: List[dict] = []  # {"ip", "remote_as"}
        self.bgp_networks: List[tuple] = []  # (network, prefix)
        # routes learned via BGP: (network, prefix, next_hop, as_path[list])
        self.bgp_routes: List[tuple] = []
        # EIGRP: AS number (None = not running), network statements, learned routes
        self.eigrp_asn: Optional[int] = None
        self.eigrp_networks: List[tuple] = []  # (network, prefix)
        self.eigrp_routes: List[tuple] = []  # (network, prefix, next_hop, metric)
        # RIP: enabled flag, network statements, learned routes (hop count metric)
        self.rip_enabled: bool = False
        self.rip_networks: List[tuple] = []  # (network, prefix)
        self.rip_routes: List[tuple] = []  # (network, prefix, next_hop, hops)
        # redistribution: per target protocol -> set of source protocols
        # e.g. {"ospf": {"connected", "static"}, "eigrp": {"rip"}}
        self.redistribute: Dict[str, set] = {}
        # IPv6 static routes: list of (network, prefix, next_hop)
        self.static_routes6: List[tuple] = []
        self.stp_mode: str = "pvst"  # routers can bundle/STP too via switchports (unused)
        # --- Phase 10 security ---
        # zone-based firewall: policy per (src_zone, dst_zone) -> permit|inspect|deny
        self.zone_pairs: Dict[tuple, str] = {}
        # stateful sessions opened by inspect/permit: set of (src_ip, dst_ip)
        self.fw_sessions: set = set()
        # AAA: simple local authentication enable + user db (name -> password)
        self.aaa_enabled: bool = False
        self.aaa_users: Dict[str, str] = {}
        # site-to-site IPsec tunnels: list of {peer, local_net, local_prefix,
        #   remote_net, remote_prefix}
        self.crypto_tunnels: List[dict] = []
        # IPS/IDS signatures: list of {id, proto, port|icmp_type, action, name}
        self.ips_signatures: List[dict] = []
        # IPS alert log: list of {sig, src, dst, action}
        self.ips_alerts: List[dict] = []


class AccessPoint(Device):
    """802.11 access point. Has one wired uplink interface plus radio params and
    a set of advertised SSIDs. May join a WLC via CAPWAP (lightweight AP)."""
    kind = "ap"

    def __init__(self, name: str, x: float = 0.0, y: float = 0.0):
        super().__init__(name)
        self.add_interface("GigabitEthernet0/0").enabled = True  # wired uplink
        self.x = x
        self.y = y
        self.tx_power = 20  # dBm (radio transmit power)
        self.channel = 6
        self.band = "2.4"  # "2.4" | "5"
        # ssid -> {"auth","psk","vlan","hidden","wmm"}
        self.ssids: Dict[str, dict] = {}
        self.wlc: Optional[str] = None  # controller name once joined
        self.capwap_state = "Idle"  # Idle -> Discovery -> Join -> Run
        # client_name -> {"ssid","rssi","authenticated","key_installed","sae"}
        self.associations: Dict[str, dict] = {}

    @property
    def uplink(self) -> Interface:
        return self.interfaces["GigabitEthernet0/0"]


class WirelessClient(Device):
    """A Wi-Fi station (laptop/phone). Knows credentials for SSIDs it can join."""
    kind = "wifi-client"

    def __init__(self, name: str, x: float = 0.0, y: float = 0.0):
        super().__init__(name)
        self.add_interface("wlan0")
        self.x = x
        self.y = y
        self.profiles: Dict[str, str] = {}  # ssid -> psk ("" for open networks)
        # association record: {"ap","ssid","rssi","authenticated","key_installed","sae"}
        self.assoc: Optional[dict] = None
        self.roam_log: List[dict] = []  # {"from","to","ssid","rssi"}

    @property
    def radio(self) -> Interface:
        return self.interfaces["wlan0"]


class WirelessLANController(Device):
    """A WLC: centrally defines WLANs and manages lightweight APs via CAPWAP."""
    kind = "wlc"

    def __init__(self, name: str):
        super().__init__(name)
        self.add_interface("GigabitEthernet0/0").enabled = True
        self.wlans: Dict[str, dict] = {}  # ssid -> {"auth","psk","vlan","wmm"}
        self.aps: List[str] = []  # names of joined APs


@dataclass
class DhcpPool:
    name: str
    network: Optional[str] = None
    prefix: Optional[int] = None
    gateway: Optional[str] = None  # default-router
    dns: Optional[str] = None
    # next host address to hand out within the pool
    _next: int = 0
    excluded: set = field(default_factory=set)
