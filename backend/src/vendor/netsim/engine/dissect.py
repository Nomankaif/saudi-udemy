"""Wireshark-style dissection of simulated frames for the capture analyzer UI.

The simulator models frames as Python objects; :mod:`app.engine.pcap` already
synthesizes byte-accurate Ethernet/802.1Q/ARP/IPv4/ICMP/UDP-BOOTP bytes from
those objects for ``.pcap`` export. Here we reuse that byte layout to produce,
for each captured frame:

* a flat ``bytes`` array (for the hex + ASCII pane),
* a ``length`` in bytes,
* an expandable ``layers`` tree (Frame -> Ethernet II -> IPv4/ARP -> ICMP/...)
  with per-layer byte ``range`` so the UI can cross-highlight detail <-> hex,
* a synthesized relative ``time`` (seconds) so the packet list has a realistic
  Time column and inter-frame deltas.

This module is purely a *serializer*: it never changes engine behavior.
"""
from __future__ import annotations

from typing import List

from . import pcap
from .packet import (
    ETHERTYPE_ARP,
    ETHERTYPE_IPV4,
    ARP_REQUEST,
    ICMP_ECHO_REQUEST,
    ICMP_ECHO_REPLY,
    ICMP_TIME_EXCEEDED,
    ICMP_DEST_UNREACHABLE,
    PROTO_ICMP,
    PROTO_UDP,
    ArpPacket,
    CaptureEntry,
    DhcpMessage,
    IcmpMessage,
    IpPacket,
)

# rough per-hop latency used to synthesize a plausible Time column (seconds).
_HOP_LATENCY = 0.000_521  # ~0.5 ms serialization+propagation per recorded step

_ICMP_TYPE_NAMES = {
    ICMP_ECHO_REQUEST: "8 (Echo (ping) request)",
    ICMP_ECHO_REPLY: "0 (Echo (ping) reply)",
    ICMP_TIME_EXCEEDED: "11 (Time-to-live exceeded)",
    ICMP_DEST_UNREACHABLE: "3 (Destination unreachable)",
}

_DHCP_TYPE_NAMES = {
    1: "DHCP Discover",
    2: "DHCP Offer",
    3: "DHCP Request",
    5: "DHCP ACK",
}


def _ethertype_name(ethertype: int) -> str:
    if ethertype == ETHERTYPE_IPV4:
        return "IPv4 (0x0800)"
    if ethertype == ETHERTYPE_ARP:
        return "ARP (0x0806)"
    return f"0x{ethertype:04x}"


def _layers(entry: CaptureEntry, total: int) -> List[dict]:
    frame = entry.frame
    payload = frame.payload
    has_vlan = bool(frame.vlan)
    eth_len = 18 if has_vlan else 14

    protocols: List[str] = ["eth"]
    layers: List[dict] = []

    # ---- Ethernet II -----------------------------------------------------
    ethertype = ETHERTYPE_ARP if isinstance(payload, ArpPacket) else ETHERTYPE_IPV4
    eth_fields = [
        ["Destination", frame.dst_mac],
        ["Source", frame.src_mac],
    ]
    if has_vlan:
        eth_fields.append(["802.1Q Virtual LAN", f"ID {frame.vlan}"])
    eth_fields.append(["Type", _ethertype_name(ethertype)])
    layers.append({
        "name": f"Ethernet II, Src: {frame.src_mac}, Dst: {frame.dst_mac}",
        "fields": eth_fields,
        "range": [0, eth_len],
    })

    off = eth_len

    # ---- ARP -------------------------------------------------------------
    if isinstance(payload, ArpPacket):
        protocols.append("arp")
        op = "request (1)" if payload.operation == ARP_REQUEST else "reply (2)"
        layers.append({
            "name": "Address Resolution Protocol"
                    + (" (request)" if payload.operation == ARP_REQUEST else " (reply)"),
            "fields": [
                ["Hardware type", "Ethernet (1)"],
                ["Protocol type", "IPv4 (0x0800)"],
                ["Opcode", op],
                ["Sender MAC address", payload.sender_mac],
                ["Sender IP address", payload.sender_ip],
                ["Target MAC address", payload.target_mac],
                ["Target IP address", payload.target_ip],
            ],
            "range": [off, min(off + 28, total)],
        })
        return _with_frame(entry, total, protocols, layers)

    # ---- IPv4 ------------------------------------------------------------
    if isinstance(payload, IpPacket):
        protocols.append("ip")
        ip = payload
        proto_name = (
            "ICMP (1)" if ip.protocol == PROTO_ICMP
            else "UDP (17)" if ip.protocol == PROTO_UDP
            else str(ip.protocol)
        )
        layers.append({
            "name": f"Internet Protocol Version 4, Src: {ip.src_ip}, Dst: {ip.dst_ip}",
            "fields": [
                ["Version", "4"],
                ["Header Length", "20 bytes (5)"],
                ["Total Length", str(total - off)],
                ["Time to Live", str(ip.ttl)],
                ["Protocol", proto_name],
                ["Source Address", ip.src_ip],
                ["Destination Address", ip.dst_ip],
            ],
            "range": [off, off + 20],
        })
        off += 20
        inner = ip.payload

        if isinstance(inner, IcmpMessage):
            protocols.append("icmp")
            layers.append({
                "name": "Internet Control Message Protocol",
                "fields": [
                    ["Type", _ICMP_TYPE_NAMES.get(inner.icmp_type, str(inner.icmp_type))],
                    ["Code", "0"],
                    ["Identifier", f"{inner.identifier} (0x{inner.identifier:04x})"],
                    ["Sequence Number", str(inner.sequence)],
                ],
                "range": [off, total],
            })
        elif isinstance(inner, DhcpMessage):
            protocols += ["udp", "dhcp"]
            layers.append({
                "name": "User Datagram Protocol",
                "fields": [
                    ["Source Port", str(ip.src_port or 0)],
                    ["Destination Port", str(ip.dst_port or 0)],
                    ["Length", str(total - off)],
                ],
                "range": [off, off + 8],
            })
            off += 8
            df = [
                ["Message type", _DHCP_TYPE_NAMES.get(inner.msg_type, str(inner.msg_type))],
                ["Client MAC address", inner.client_mac],
                ["Your (client) IP address", inner.your_ip],
                ["Next server IP address", inner.server_ip],
            ]
            if inner.gateway:
                df.append(["Router (option 3)", inner.gateway])
            if inner.dns:
                df.append(["Domain Name Server (option 6)", inner.dns])
            layers.append({
                "name": "Dynamic Host Configuration Protocol "
                        f"({_DHCP_TYPE_NAMES.get(inner.msg_type, '')})".strip(),
                "fields": df,
                "range": [off, total],
            })

    return _with_frame(entry, total, protocols, layers)


def _with_frame(entry: CaptureEntry, total: int, protocols: List[str],
                layers: List[dict]) -> List[dict]:
    frame_layer = {
        "name": f"Frame {entry.step}: {total} bytes on wire ({total * 8} bits)",
        "fields": [
            ["Frame Length", f"{total} bytes ({total * 8} bits)"],
            ["Capture Length", f"{total} bytes ({total * 8} bits)"],
            ["Protocols in frame", ":".join(protocols)],
            ["Arrival", f"{entry.src_device} {entry.src_interface}"
                        f" -> {entry.dst_device} {entry.dst_interface}"],
        ],
        "range": [0, total],
    }
    return [frame_layer] + layers


def capture_dict(entry: CaptureEntry, index: int = 0) -> dict:
    """Rich capture serialization for the analyzer UI.

    Includes everything :meth:`CaptureEntry.to_dict` returns plus ``length``,
    raw ``bytes``, the expandable ``layers`` tree, the ``protocols`` chain and a
    synthesized relative ``time`` (seconds).
    """
    raw = pcap._frame_bytes(entry.frame)
    total = len(raw)
    base = entry.to_dict()
    layers = _layers(entry, total)
    protocols = layers[0]["fields"][2][1].split(":") if layers else []
    base.update({
        "no": index + 1,
        "time": round(index * _HOP_LATENCY, 6),
        "length": total,
        "bytes": list(raw),
        "layers": layers,
        "protocols": protocols,
    })
    return base


def capture_list(entries: List[CaptureEntry]) -> List[dict]:
    return [capture_dict(e, i) for i, e in enumerate(entries)]
