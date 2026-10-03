"""IPv4 access-control lists: data model, matching and evaluation.

Supports Cisco-style standard ACLs (source only) and extended ACLs
(protocol + source/destination + L4 port match). Wildcard masks follow Cisco
semantics: a set bit means "don't care". Evaluation applies entries top-down
and ends in an implicit ``deny`` if nothing matches.
"""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from .packet import IpPacket

ANY = ("0.0.0.0", "255.255.255.255")


@dataclass
class AclEntry:
    action: str  # "permit" | "deny"
    proto: str = "ip"  # ip | icmp | tcp | udp
    src: str = "0.0.0.0"
    src_wild: str = "255.255.255.255"
    dst: str = "0.0.0.0"
    dst_wild: str = "255.255.255.255"
    dst_port_op: Optional[str] = None  # "eq" (only operator modelled)
    dst_port: Optional[int] = None

    def text(self) -> str:
        if self.proto == "_std":  # standard ACL: source only, no protocol keyword
            return f"{self.action} {_addr_text(self.src, self.src_wild)}"
        parts = [self.action, self.proto, _addr_text(self.src, self.src_wild),
                 _addr_text(self.dst, self.dst_wild)]
        if self.dst_port_op and self.dst_port is not None:
            parts.append(f"{self.dst_port_op} {self.dst_port}")
        return " ".join(parts)


def _addr_text(addr: str, wild: str) -> str:
    if (addr, wild) == ANY:
        return "any"
    if wild == "0.0.0.0":
        return f"host {addr}"
    return f"{addr} {wild}"


def _addr_matches(addr: str, acl_addr: str, wild: str) -> bool:
    a = int(ipaddress.ip_address(addr))
    base = int(ipaddress.ip_address(acl_addr))
    inv = int(ipaddress.ip_address(wild)) ^ 0xFFFFFFFF  # bits that must match
    return (a & inv) == (base & inv)


_PROTO_NAMES = {1: "icmp", 6: "tcp", 17: "udp"}


def _proto_matches(entry: AclEntry, packet: "IpPacket") -> bool:
    if entry.proto == "ip":
        return True
    return _PROTO_NAMES.get(packet.protocol) == entry.proto


def entry_matches(entry: AclEntry, packet: "IpPacket") -> bool:
    if not _addr_matches(packet.src_ip, entry.src, entry.src_wild):
        return False
    if entry.proto == "_std":  # standard ACL: source only
        return True
    if not _addr_matches(packet.dst_ip, entry.dst, entry.dst_wild):
        return False
    if not _proto_matches(entry, packet):
        return False
    if entry.dst_port_op == "eq" and entry.dst_port is not None:
        if packet.dst_port != entry.dst_port:
            return False
    return True


def evaluate(acl: dict, packet: "IpPacket") -> bool:
    """Return True if the packet is permitted (implicit deny otherwise)."""
    for entry in acl.get("entries", []):
        if entry_matches(entry, packet):
            return entry.action == "permit"
    return False


def source_permitted(acl: dict, src_ip: str) -> bool:
    """Match only on source address — used by NAT ``inside source list``."""
    for entry in acl.get("entries", []):
        if _addr_matches(src_ip, entry.src, entry.src_wild):
            return entry.action == "permit"
    return False
