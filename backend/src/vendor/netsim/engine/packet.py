"""Packet, frame and protocol data units used by the simulation engine.

Everything here is a plain in-memory representation of the bytes that would be
on the wire. The simulator passes these objects hop by hop and records them in
the capture log so the UI can show a Wireshark-style breakdown.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Union

BROADCAST_MAC = "FFFF.FFFF.FFFF"

ETHERTYPE_IPV4 = 0x0800
ETHERTYPE_ARP = 0x0806

ARP_REQUEST = 1
ARP_REPLY = 2

PROTO_ICMP = 1
PROTO_UDP = 17

ICMP_ECHO_REQUEST = 8
ICMP_ECHO_REPLY = 0
ICMP_TIME_EXCEEDED = 11
ICMP_DEST_UNREACHABLE = 3

DHCP_DISCOVER = 1
DHCP_OFFER = 2
DHCP_REQUEST = 3
DHCP_ACK = 5

_DHCP_NAMES = {
    DHCP_DISCOVER: "DHCP Discover",
    DHCP_OFFER: "DHCP Offer",
    DHCP_REQUEST: "DHCP Request",
    DHCP_ACK: "DHCP ACK",
}


@dataclass
class ArpPacket:
    operation: int
    sender_mac: str
    sender_ip: str
    target_ip: str
    target_mac: str = "0000.0000.0000"

    def summary(self) -> str:
        if self.operation == ARP_REQUEST:
            return f"ARP Who has {self.target_ip}? Tell {self.sender_ip}"
        return f"ARP {self.sender_ip} is at {self.sender_mac}"


@dataclass
class IcmpMessage:
    icmp_type: int
    identifier: int = 1
    sequence: int = 1

    def summary(self) -> str:
        if self.icmp_type == ICMP_ECHO_REQUEST:
            return f"Echo (ping) request id={self.identifier} seq={self.sequence}"
        if self.icmp_type == ICMP_ECHO_REPLY:
            return f"Echo (ping) reply id={self.identifier} seq={self.sequence}"
        if self.icmp_type == ICMP_TIME_EXCEEDED:
            return "Time-to-live exceeded"
        if self.icmp_type == ICMP_DEST_UNREACHABLE:
            return "Destination unreachable"
        return f"ICMP type={self.icmp_type}"


@dataclass
class DhcpMessage:
    msg_type: int
    client_mac: str
    your_ip: str = "0.0.0.0"  # offered/assigned address
    server_ip: str = "0.0.0.0"
    gateway: Optional[str] = None
    dns: Optional[str] = None
    prefix: Optional[int] = None

    def summary(self) -> str:
        name = _DHCP_NAMES.get(self.msg_type, f"DHCP type={self.msg_type}")
        extra = f" yiaddr={self.your_ip}" if self.your_ip != "0.0.0.0" else ""
        return f"{name}{extra}"


@dataclass
class IpPacket:
    src_ip: str
    dst_ip: str
    protocol: int
    payload: Union[IcmpMessage, "DhcpMessage"]
    ttl: int = 64
    src_port: Optional[int] = None
    dst_port: Optional[int] = None

    def summary(self) -> str:
        return f"{self.src_ip} -> {self.dst_ip} ttl={self.ttl} {self.payload.summary()}"


@dataclass
class Frame:
    src_mac: str
    dst_mac: str
    payload: Union[ArpPacket, IpPacket]
    ethertype: int = ETHERTYPE_IPV4
    vlan: Optional[int] = None

    def is_broadcast(self) -> bool:
        return self.dst_mac.upper() == BROADCAST_MAC

    def summary(self) -> str:
        proto = "ARP" if self.ethertype == ETHERTYPE_ARP else "IPv4"
        vlan = f" vlan={self.vlan}" if self.vlan is not None else ""
        return f"[{proto}{vlan}] {self.src_mac} -> {self.dst_mac} | {self.payload.summary()}"


@dataclass
class CaptureEntry:
    """A single observation of a frame leaving one interface and arriving at
    another, recorded for the capture/animation view."""

    step: int
    src_device: str
    src_interface: str
    dst_device: str
    dst_interface: str
    frame: Frame = field(repr=False)

    def _protocol(self) -> str:
        payload = self.frame.payload
        if isinstance(payload, ArpPacket):
            return "ARP"
        if isinstance(payload, IpPacket):
            if isinstance(payload.payload, DhcpMessage):
                return "DHCP"
            if isinstance(payload.payload, IcmpMessage):
                return "ICMP"
        return "IPv4"

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "from": {"device": self.src_device, "interface": self.src_interface},
            "to": {"device": self.dst_device, "interface": self.dst_interface},
            "summary": self.frame.summary(),
            "protocol": self._protocol(),
            "vlan": self.frame.vlan,
        }
