"""Serialize simulated frames to a libpcap (.pcap) file that opens in Wireshark.

The simulator models frames as Python objects rather than raw bytes, so here we
synthesize byte-accurate Ethernet / 802.1Q / ARP / IPv4 / ICMP / UDP-BOOTP
packets from those objects. Checksums are filled in so Wireshark dissects each
layer cleanly.
"""
import struct
from typing import List

from .packet import (
    ETHERTYPE_ARP,
    ETHERTYPE_IPV4,
    ArpPacket,
    CaptureEntry,
    DhcpMessage,
    IcmpMessage,
    IpPacket,
)

_ETHERTYPE_VLAN = 0x8100
_DHCP_MAGIC = bytes([99, 130, 83, 99])


def _mac_bytes(mac: str) -> bytes:
    hex_str = mac.replace(".", "").replace(":", "")
    return bytes.fromhex(hex_str)[:6].ljust(6, b"\x00")


def _ip_bytes(ip: str) -> bytes:
    return bytes(int(o) for o in ip.split("."))


def _checksum(data: bytes) -> int:
    if len(data) % 2:
        data += b"\x00"
    total = 0
    for i in range(0, len(data), 2):
        total += (data[i] << 8) + data[i + 1]
    total = (total >> 16) + (total & 0xFFFF)
    total += total >> 16
    return (~total) & 0xFFFF


def _icmp_bytes(icmp: IcmpMessage) -> bytes:
    header = struct.pack("!BBHHH", icmp.icmp_type, 0, 0, icmp.identifier, icmp.sequence)
    payload = b"netsim-icmp-payload"
    body = header + payload
    chk = _checksum(body)
    return struct.pack("!BBHHH", icmp.icmp_type, 0, chk, icmp.identifier, icmp.sequence) + payload


def _dhcp_bytes(dhcp: DhcpMessage) -> bytes:
    op = 1 if dhcp.msg_type in (1, 3) else 2  # BOOTREQUEST / BOOTREPLY
    chaddr = _mac_bytes(dhcp.client_mac).ljust(16, b"\x00")
    msg = struct.pack(
        "!BBBBIHH4s4s4s4s",
        op, 1, 6, 0,            # op, htype=Ethernet, hlen=6, hops
        0x3903F326,             # xid
        0, 0,                   # secs, flags
        _ip_bytes("0.0.0.0"),   # ciaddr
        _ip_bytes(dhcp.your_ip),  # yiaddr
        _ip_bytes(dhcp.server_ip),  # siaddr
        _ip_bytes("0.0.0.0"),   # giaddr
    )
    msg += chaddr + b"\x00" * 192  # sname + file
    options = _DHCP_MAGIC + bytes([53, 1, dhcp.msg_type])
    if dhcp.gateway:
        options += bytes([3, 4]) + _ip_bytes(dhcp.gateway)
    if dhcp.dns:
        options += bytes([6, 4]) + _ip_bytes(dhcp.dns)
    if dhcp.server_ip and dhcp.server_ip != "0.0.0.0":
        options += bytes([54, 4]) + _ip_bytes(dhcp.server_ip)
    options += bytes([255])
    return msg + options


def _udp_bytes(ip: IpPacket, payload: bytes) -> bytes:
    src_port = ip.src_port or 0
    dst_port = ip.dst_port or 0
    length = 8 + len(payload)
    return struct.pack("!HHHH", src_port, dst_port, length, 0) + payload


def _ipv4_bytes(ip: IpPacket) -> bytes:
    if isinstance(ip.payload, IcmpMessage):
        l4 = _icmp_bytes(ip.payload)
    elif isinstance(ip.payload, DhcpMessage):
        l4 = _udp_bytes(ip, _dhcp_bytes(ip.payload))
    else:
        l4 = b""
    total_len = 20 + len(l4)
    header = struct.pack(
        "!BBHHHBBH4s4s",
        0x45, 0, total_len, 0, 0,
        max(ip.ttl, 0), ip.protocol, 0,
        _ip_bytes(ip.src_ip), _ip_bytes(ip.dst_ip),
    )
    chk = _checksum(header)
    header = struct.pack(
        "!BBHHHBBH4s4s",
        0x45, 0, total_len, 0, 0,
        max(ip.ttl, 0), ip.protocol, chk,
        _ip_bytes(ip.src_ip), _ip_bytes(ip.dst_ip),
    )
    return header + l4


def _arp_bytes(arp: ArpPacket) -> bytes:
    return struct.pack(
        "!HHBBH6s4s6s4s",
        1, ETHERTYPE_IPV4, 6, 4, arp.operation,
        _mac_bytes(arp.sender_mac), _ip_bytes(arp.sender_ip),
        _mac_bytes(arp.target_mac), _ip_bytes(arp.target_ip),
    )


def _frame_bytes(frame) -> bytes:
    dst = _mac_bytes(frame.dst_mac)
    src = _mac_bytes(frame.src_mac)
    if isinstance(frame.payload, ArpPacket):
        ethertype, body = ETHERTYPE_ARP, _arp_bytes(frame.payload)
    elif isinstance(frame.payload, IpPacket):
        ethertype, body = ETHERTYPE_IPV4, _ipv4_bytes(frame.payload)
    else:
        ethertype, body = frame.ethertype, b""
    if frame.vlan:
        tag = struct.pack("!HH", _ETHERTYPE_VLAN, frame.vlan & 0x0FFF)
        return dst + src + tag + struct.pack("!H", ethertype) + body
    return dst + src + struct.pack("!H", ethertype) + body


def to_pcap(captures: List[CaptureEntry]) -> bytes:
    # libpcap global header: magic, v2.4, GMT offset, sigfigs, snaplen, LINKTYPE_ETHERNET
    out = struct.pack("!IHHiIII", 0xA1B2C3D4, 2, 4, 0, 0, 65535, 1)
    for idx, entry in enumerate(captures):
        data = _frame_bytes(entry.frame)
        ts_sec, ts_usec = idx // 1000, (idx % 1000) * 1000
        out += struct.pack("!IIII", ts_sec, ts_usec, len(data), len(data)) + data
    return out
