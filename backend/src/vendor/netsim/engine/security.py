"""Phase 10 security helpers.

Pure, side-effect-light logic shared by the data-plane hooks in
``simulator.py``: switch port-security, DHCP snooping bindings, dynamic ARP
inspection, IP source guard, 802.1X, zone-based firewall policy, IPsec
interesting-traffic matching and IPS signature matching.

The functions here decide *whether a frame/packet is allowed*; the simulator
records violations and updates state."""
from __future__ import annotations

import ipaddress
from typing import TYPE_CHECKING, Optional

from .packet import PROTO_ICMP, PROTO_UDP

if TYPE_CHECKING:
    from .models import Interface, Router, Switch


# ----------------------------------------------------------- port security
def port_security_check(iface: "Interface", src_mac: str) -> str:
    """Decide what to do with a frame from ``src_mac`` on a secured port.

    Returns one of: 'allow' (and learns the MAC if there is room),
    'violation-shutdown', 'violation-restrict', 'violation-protect'."""
    if not iface.port_security:
        return "allow"
    if src_mac in iface.port_security_macs:
        return "allow"
    if len(iface.port_security_macs) < iface.port_security_max:
        iface.port_security_macs.add(src_mac)
        return "allow"
    return f"violation-{iface.port_security_violation}"


# ---------------------------------------------------------- DHCP snooping
def snooping_active(sw: "Switch", vlan: int) -> bool:
    if not sw.dhcp_snooping:
        return False
    return not sw.dhcp_snoop_vlans or vlan in sw.dhcp_snoop_vlans


def find_binding(sw: "Switch", mac: Optional[str] = None,
                 ip: Optional[str] = None) -> Optional[dict]:
    for b in sw.dhcp_snoop_bindings:
        if mac is not None and b["mac"] != mac:
            continue
        if ip is not None and b["ip"] != ip:
            continue
        return b
    return None


def dai_active(sw: "Switch", vlan: int) -> bool:
    if not sw.dai:
        return False
    return not sw.dai_vlans or vlan in sw.dai_vlans


# ------------------------------------------------------- zone-based firewall
def zone_policy(rt: "Router", src_zone: Optional[str], dst_zone: Optional[str]):
    """Return the configured action for traffic from src_zone to dst_zone.

    None means 'no zones in play' (default permit). Same-zone is permitted."""
    if src_zone is None or dst_zone is None:
        return None
    if src_zone == dst_zone:
        return "permit"
    return rt.zone_pairs.get((src_zone, dst_zone), "deny")


# ------------------------------------------------------------------- IPsec
def _in_net(ip: str, net: str, prefix: int) -> bool:
    return ipaddress.ip_address(ip) in ipaddress.ip_network(f"{net}/{prefix}", strict=False)


def matching_tunnel(rt: "Router", src_ip: str, dst_ip: str) -> Optional[dict]:
    """Return the crypto tunnel whose interesting-traffic matches this flow."""
    for t in rt.crypto_tunnels:
        if (_in_net(src_ip, t["local_net"], t["local_prefix"])
                and _in_net(dst_ip, t["remote_net"], t["remote_prefix"])):
            return t
    return None


def tunnels_match(a: dict, b: dict) -> bool:
    """A tunnel pair forms an SA when each side's local == the other's remote."""
    return (a["local_net"] == b["remote_net"] and a["local_prefix"] == b["remote_prefix"]
            and a["remote_net"] == b["local_net"] and a["remote_prefix"] == b["local_prefix"])


# ------------------------------------------------------------------- IPS/IDS
def match_signature(rt: "Router", ip) -> Optional[dict]:
    """Return the first IPS signature matching the packet, else None."""
    for sig in rt.ips_signatures:
        proto = sig.get("proto")
        if proto == "icmp" and ip.protocol == PROTO_ICMP:
            want = sig.get("icmp_type")
            if want is None or getattr(ip.payload, "icmp_type", None) == want:
                return sig
        elif proto in ("tcp", "udp") and ip.protocol == PROTO_UDP:
            # this engine only models UDP on the data plane; match on port
            want = sig.get("port")
            if want is None or ip.dst_port == want:
                return sig
        elif proto == "ip":
            return sig
    return None
