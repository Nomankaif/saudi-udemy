"""The simulation engine: topology container plus the packet-forwarding logic.

The model is a simple discrete event loop. A "frame arriving on an interface"
is the unit of work. Processing one arrival can transmit new frames, which are
queued as future arrivals on the peer interface. Every transmission is recorded
in a capture log so the UI can replay it like Wireshark / Packet Tracer's
simulation mode.
"""

from __future__ import annotations

import copy
import heapq
import ipaddress
from collections import defaultdict, deque
from typing import Dict, List, Optional, Tuple

from . import acl as acl_mod
from . import bgp as bgp_mod
from . import dissect as dissect_mod
from . import igp as igp_mod
from . import security as sec_mod
from .models import (
    AccessPoint,
    Device,
    Host,
    Interface,
    Link,
    Router,
    Switch,
    WirelessClient,
    WirelessLANController,
)
from .packet import (
    ARP_REPLY,
    ARP_REQUEST,
    BROADCAST_MAC,
    DHCP_ACK,
    DHCP_DISCOVER,
    DHCP_OFFER,
    DHCP_REQUEST,
    ETHERTYPE_ARP,
    ETHERTYPE_IPV4,
    ICMP_ECHO_REPLY,
    ICMP_ECHO_REQUEST,
    ICMP_TIME_EXCEEDED,
    PROTO_ICMP,
    PROTO_UDP,
    ArpPacket,
    CaptureEntry,
    DhcpMessage,
    Frame,
    IcmpMessage,
    IpPacket,
)

MAX_EVENTS = 2000


class Network:
    def __init__(self) -> None:
        self.devices: Dict[str, Device] = {}
        self.links: List[Link] = []
        self.last_capture: List[CaptureEntry] = []  # frames from the most recent run (for pcap export)

    # ------------------------------------------------------------------ build
    def add_host(self, name: str) -> Host:
        return self._add(Host(name))

    def add_switch(self, name: str, ports: int = 4) -> Switch:
        return self._add(Switch(name, ports))

    def add_router(self, name: str, ports: int = 2) -> Router:
        return self._add(Router(name, ports))

    def add_ap(self, name: str, x: float = 0.0, y: float = 0.0) -> "AccessPoint":
        return self._add(AccessPoint(name, x, y))

    def add_wifi_client(self, name: str, x: float = 0.0, y: float = 0.0) -> "WirelessClient":
        return self._add(WirelessClient(name, x, y))

    def add_wlc(self, name: str) -> "WirelessLANController":
        return self._add(WirelessLANController(name))

    def _add(self, device: Device) -> Device:
        if device.name in self.devices:
            raise ValueError(f"device {device.name} already exists")
        self.devices[device.name] = device
        return device

    def connect(self, dev_a: str, if_a: str, dev_b: str, if_b: str) -> Link:
        a = self._iface(dev_a, if_a)
        b = self._iface(dev_b, if_b)
        if a.link or b.link:
            raise ValueError("interface already connected")
        link = Link(a=a, b=b)
        a.link = link
        b.link = link
        self.links.append(link)
        return link

    def _iface(self, dev: str, iface: str) -> Interface:
        device = self.devices.get(dev)
        if device is None:
            raise ValueError(f"unknown device {dev}")
        i = device.get_interface(iface)
        if i is None:
            raise ValueError(f"{dev} has no interface {iface}")
        return i

    def find_ip_owner(self, ip: str) -> Optional[Tuple[Device, Interface]]:
        for device in self.devices.values():
            for iface in device.interfaces.values():
                if iface.ip == ip:
                    return device, iface
        return None

    # ------------------------------------------------------------------- ping
    def ping(self, src: str, dst_ip: str, count: int = 1) -> dict:
        host = self.devices.get(src)
        if not isinstance(host, Host):
            return {"ok": False, "error": f"{src} is not a host"}
        if host.primary.ip is None:
            return {"ok": False, "error": f"{src} has no IP address"}
        self.compute_spanning_tree()
        self.compute_ospf()
        bgp_mod.compute(self)
        igp_mod.compute(self)

        results = []
        all_capture: List[CaptureEntry] = []
        for seq in range(1, count + 1):
            ctx = {"echo_replies": [], "step": [0]}
            capture: List[CaptureEntry] = []
            queue: deque = deque()
            # Each attempt is an independent event loop: discard any packets a
            # previous (failed) attempt left buffered awaiting ARP, otherwise the
            # 'already ARPing' guard would suppress a fresh ARP request.
            for d in self.devices.values():
                if hasattr(d, "pending"):
                    d.pending.clear()

            echo = IpPacket(
                src_ip=host.primary.ip,
                dst_ip=dst_ip,
                protocol=PROTO_ICMP,
                payload=IcmpMessage(ICMP_ECHO_REQUEST, identifier=1, sequence=seq),
            )
            self._host_send_ip(host, echo, capture, queue, ctx)
            self._run(queue, capture, ctx)

            got = any(
                r.dst_ip == host.primary.ip
                and r.payload.icmp_type == ICMP_ECHO_REPLY
                and r.payload.sequence == seq
                for r in ctx["echo_replies"]
            )
            results.append({"seq": seq, "reply": got})
            all_capture.extend(capture)

        received = sum(1 for r in results if r["reply"])
        self.last_capture = list(all_capture)
        return {
            "ok": True,
            "src": src,
            "dst": dst_ip,
            "sent": count,
            "received": received,
            "loss_pct": round(100 * (count - received) / count, 1),
            "results": results,
            "capture": dissect_mod.capture_list(all_capture),
        }

    # ------------------------------------------------------------ traceroute
    def traceroute(self, src: str, dst_ip: str, max_hops: int = 15) -> dict:
        host = self.devices.get(src)
        if not isinstance(host, Host):
            return {"ok": False, "error": f"{src} is not a host"}
        if host.primary.ip is None:
            return {"ok": False, "error": f"{src} has no IP address"}
        self.compute_spanning_tree()
        self.compute_ospf()
        bgp_mod.compute(self)
        igp_mod.compute(self)

        hops: List[dict] = []
        all_capture: List[CaptureEntry] = []
        reached = False
        for ttl in range(1, max_hops + 1):
            ctx = {"echo_replies": [], "ttl_exceeded": [], "step": [0]}
            capture: List[CaptureEntry] = []
            queue: deque = deque()
            probe = IpPacket(
                src_ip=host.primary.ip,
                dst_ip=dst_ip,
                protocol=PROTO_ICMP,
                payload=IcmpMessage(ICMP_ECHO_REQUEST, identifier=1, sequence=ttl),
                ttl=ttl,
            )
            self._host_send_ip(host, probe, capture, queue, ctx)
            self._run(queue, capture, ctx)
            all_capture.extend(capture)

            if any(r.payload.icmp_type == ICMP_ECHO_REPLY for r in ctx["echo_replies"]):
                hops.append({"ttl": ttl, "hop": dst_ip})
                reached = True
                break
            if ctx["ttl_exceeded"]:
                hops.append({"ttl": ttl, "hop": ctx["ttl_exceeded"][0]})
            else:
                hops.append({"ttl": ttl, "hop": None})
        self.last_capture = list(all_capture)
        return {
            "ok": True,
            "src": src,
            "dst": dst_ip,
            "reached": reached,
            "hops": hops,
            "capture": dissect_mod.capture_list(all_capture),
        }

    # ----------------------------------------------------------- CDP / LLDP
    _CAP = {"router": "R", "switch": "S", "host": "H"}

    def neighbors(self, device: Device) -> List[dict]:
        """Directly-connected neighbours (drives `show cdp/lldp neighbors`)."""
        result = []
        for iface in device.interfaces.values():
            if not iface.is_up:
                continue
            peer = iface.peer()
            if peer is None:
                continue
            result.append({
                "local_interface": iface.name,
                "neighbor": peer.device.hostname,
                "neighbor_interface": peer.name,
                "capability": self._CAP.get(peer.device.kind, "?"),
                "platform": f"NetSim-{peer.device.kind}",
            })
        return result

    # -------------------------------------------------------------- event loop
    def _run(self, queue: deque, capture: List[CaptureEntry], ctx: dict) -> None:
        events = 0
        while queue and events < MAX_EVENTS:
            events += 1
            device, iface, frame = queue.popleft()
            if not iface.is_up:
                continue
            if isinstance(device, Switch):
                self._switch_process(device, iface, frame, capture, queue, ctx)
            elif isinstance(device, Host):
                self._host_process(device, iface, frame, capture, queue, ctx)
            elif isinstance(device, Router):
                self._router_process(device, iface, frame, capture, queue, ctx)

    def _transmit(
        self,
        out_iface: Interface,
        frame: Frame,
        capture: List[CaptureEntry],
        queue: deque,
        ctx: dict,
    ) -> None:
        if not out_iface.is_up:
            return
        peer = out_iface.peer()
        if peer is None or not peer.is_up:
            return
        ctx["step"][0] += 1
        capture.append(
            CaptureEntry(
                step=ctx["step"][0],
                src_device=out_iface.device.name,
                src_interface=out_iface.name,
                dst_device=peer.device.name,
                dst_interface=peer.name,
                frame=frame,
            )
        )
        queue.append((peer.device, peer, frame))

    # ----------------------------------------------------------------- switch
    def _bundle_rep(self, sw: Switch, iface: Interface) -> Interface:
        """The single logical port representing an EtherChannel bundle.

        All member ports of a channel-group collapse onto one representative
        (lowest-named up member) so the bundle behaves as one link for MAC
        learning and flooding instead of looping over each physical member."""
        if iface.channel_group is None:
            return iface
        members = [p for p in sw.interfaces.values() if p.channel_group == iface.channel_group]
        up = [p for p in members if p.is_up] or members
        return min(up, key=lambda p: p.name)

    def _switch_process(self, sw: Switch, iface: Interface, frame: Frame, capture, queue, ctx):
        # A frame arriving on a spanning-tree blocked port is dropped.
        if iface.stp_state == "blocking":
            return
        # 802.1X: an unauthorized port drops all data frames (EAPOL not modeled).
        if iface.dot1x and not iface.dot1x_authorized:
            sw.security_log.append({"kind": "dot1x", "interface": iface.name,
                                    "detail": "unauthorized port dropped frame"})
            return
        # Port security: enforce the allowed-MAC limit on the ingress port.
        decision = sec_mod.port_security_check(iface, frame.src_mac)
        if decision != "allow":
            sw.security_log.append({"kind": "port-security", "interface": iface.name,
                                    "detail": f"{frame.src_mac} {decision}"})
            if decision == "violation-shutdown":
                iface.err_disabled = True
            return
        # Determine the frame's VLAN: a trunk reads the 802.1Q tag (falling back
        # to the native VLAN for untagged frames); an access port uses its own
        # access VLAN.
        if iface.mode == "trunk":
            vlan = frame.vlan if frame.vlan is not None else iface.vlan
        else:
            vlan = iface.vlan
        # DHCP snooping / DAI / IP source guard happen before forwarding.
        if not self._snoop_inspect(sw, iface, frame, vlan):
            return
        ingress = self._bundle_rep(sw, iface)
        sw.mac_table[(vlan, frame.src_mac)] = ingress.name

        def carries(port: Interface) -> bool:
            if port is iface or not port.forwarding:
                return False
            if port.mode == "trunk":
                return True  # trunk carries all VLANs (simplified)
            return port.vlan == vlan

        def collapse(ports: List[Interface]) -> List[Interface]:
            # one egress per EtherChannel bundle, never back out the ingress bundle
            seen: Dict[str, Interface] = {}
            for p in ports:
                rep = self._bundle_rep(sw, p)
                if rep.name == ingress.name:
                    continue
                seen.setdefault(rep.name, rep)
            return list(seen.values())

        egress: List[Interface] = []
        if frame.is_broadcast():
            egress = collapse([p for p in sw.interfaces.values() if carries(p)])
        else:
            known = sw.mac_table.get((vlan, frame.dst_mac))
            if known and known != ingress.name and carries(sw.interfaces[known]):
                egress = collapse([sw.interfaces[known]])
            elif known == ingress.name:
                egress = []
            else:  # unknown unicast -> flood within the VLAN
                egress = collapse([p for p in sw.interfaces.values() if carries(p)])

        for port in egress:
            out = copy.copy(frame)
            # Tag on egress trunk ports, strip the tag on access ports.
            out.vlan = vlan if port.mode == "trunk" else None
            self._transmit(port, out, capture, queue, ctx)

    def _snoop_inspect(self, sw: Switch, iface: Interface, frame: Frame, vlan: int) -> bool:
        """DHCP snooping, dynamic ARP inspection and IP source guard.

        Returns True if the frame may continue, False if it is dropped."""
        # ---- Dynamic ARP Inspection ----
        if frame.ethertype == ETHERTYPE_ARP and sec_mod.dai_active(sw, vlan):
            if not iface.dhcp_snoop_trust:
                arp = frame.payload
                b = sec_mod.find_binding(sw, mac=arp.sender_mac, ip=arp.sender_ip)
                if b is None:
                    sw.security_log.append({"kind": "dai", "interface": iface.name,
                                            "detail": f"invalid ARP {arp.sender_ip}/{arp.sender_mac}"})
                    return False
            return True
        if frame.ethertype != ETHERTYPE_IPV4:
            return True
        ip = frame.payload
        msg = ip.payload
        if isinstance(msg, DhcpMessage):
            if sec_mod.snooping_active(sw, vlan):
                server_msg = msg.msg_type in (DHCP_OFFER, DHCP_ACK)
                if server_msg and not iface.dhcp_snoop_trust:
                    sw.security_log.append({"kind": "dhcp-snoop", "interface": iface.name,
                                            "detail": "rogue DHCP server reply dropped"})
                    return False
                if msg.msg_type == DHCP_ACK and iface.dhcp_snoop_trust:
                    client_port = sw.mac_table.get((vlan, msg.client_mac))
                    if not sec_mod.find_binding(sw, mac=msg.client_mac):
                        sw.dhcp_snoop_bindings.append({
                            "mac": msg.client_mac, "ip": msg.your_ip,
                            "vlan": vlan, "interface": client_port or "?",
                        })
            return True
        # ---- IP source guard (data IP frames) ----
        if iface.ip_source_guard:
            b = sec_mod.find_binding(sw, mac=frame.src_mac, ip=ip.src_ip)
            if b is None:
                sw.security_log.append({"kind": "ipsg", "interface": iface.name,
                                        "detail": f"spoofed {ip.src_ip}/{frame.src_mac}"})
                return False
        return True

    # ---------------------------------------------------------- spanning tree
    def compute_spanning_tree(self) -> None:
        """Elect a root bridge and set each switch port to forwarding/blocking.

        A pragmatic STP: bridge id = (priority, lowest MAC); per-link cost is a
        constant 19 (Fast Ethernet). Edge ports (to hosts/routers or unconnected)
        always forward; among switch-to-switch links we keep root ports and
        designated ports forwarding and block the rest to break loops.
        """
        switches = [d for d in self.devices.values() if isinstance(d, Switch)]
        # Reset: edge ports forward, inter-switch ports start blocking.
        for sw in switches:
            for p in sw.interfaces.values():
                peer = p.peer()
                inter_switch = p.is_up and peer is not None and isinstance(peer.device, Switch)
                p.stp_state = "blocking" if inter_switch else "forwarding"
                p.stp_role = "designated"
        if len(switches) < 2:
            return

        bid = {sw.name: sw.bridge_id for sw in switches}

        # EtherChannel: parallel inter-switch links that are bundled (matching
        # channel-group on both ends) collapse into one logical link, so the
        # bundle members all forward instead of STP blocking the extras.
        def bundle_key(ln: Link):
            a, b = ln.a, ln.b
            if a.channel_group is not None and a.channel_group == b.channel_group:
                return (frozenset((a.device.name, b.device.name)), a.channel_group)
            return None

        bundles: Dict[tuple, List[Link]] = {}
        rep_links: List[Link] = []
        for ln in self.links:
            if not ln.is_up:
                continue
            da, db = ln.a.device, ln.b.device
            if not (isinstance(da, Switch) and isinstance(db, Switch)):
                continue
            key = bundle_key(ln)
            if key is None:
                rep_links.append(ln)
            else:
                bundles.setdefault(key, []).append(ln)
        for members in bundles.values():
            rep_links.append(members[0])

        adj: Dict[str, List[tuple]] = {sw.name: [] for sw in switches}
        for ln in rep_links:
            da, db = ln.a.device, ln.b.device
            adj[da.name].append((db.name, ln.a, ln.b))
            adj[db.name].append((da.name, ln.b, ln.a))

        root = min(switches, key=lambda s: bid[s.name])
        INF = float("inf")
        cost = {sw.name: INF for sw in switches}
        cost[root.name] = 0
        # best[nb] = (cost, upstream_bridge_id, upstream_port_name) chosen so far
        best: Dict[str, tuple] = {root.name: (0, bid[root.name], "")}
        root_port: Dict[str, Interface] = {}
        heap = [(0, bid[root.name], root.name)]
        visited = set()
        while heap:
            c, _, name = heapq.heappop(heap)
            if name in visited:
                continue
            visited.add(name)
            for nb, local, remote in adj[name]:
                nc = c + 19
                cand = (nc, bid[name], local.name)  # STP tie-break order
                if cand < best.get(nb, (INF, (INF, "ZZ"), "ZZ")):
                    cost[nb] = nc
                    best[nb] = cand
                    root_port[nb] = remote  # nb's local port toward the root
                    heapq.heappush(heap, (nc, bid[nb], nb))

        for rp in root_port.values():
            rp.stp_state = "forwarding"
            rp.stp_role = "root"

        # Designated port per inter-switch segment: the end on the switch with
        # the lower cost-to-root (tie-break lower bridge id) forwards.
        for ln in rep_links:
            da, db = ln.a.device, ln.b.device
            if cost[da.name] < cost[db.name]:
                des = ln.a
            elif cost[db.name] < cost[da.name]:
                des = ln.b
            else:
                des = ln.a if bid[da.name] <= bid[db.name] else ln.b
            des.stp_state = "forwarding"
            if des.stp_role != "root":
                des.stp_role = "designated"

        # Remaining blocked inter-switch ports take the RSTP "alternate" role.
        for ln in rep_links:
            for end in (ln.a, ln.b):
                if end.stp_state == "blocking":
                    end.stp_role = "alternate"

        # EtherChannel: every member port inherits its bundle representative's
        # state/role (aligned per switch), so bundled links all forward.
        for members in bundles.values():
            rep = members[0]
            rep_by_dev = {rep.a.device.name: rep.a, rep.b.device.name: rep.b}
            for ln in members:
                for end in (ln.a, ln.b):
                    src = rep_by_dev[end.device.name]
                    end.stp_state = src.stp_state
                    end.stp_role = src.stp_role

    # ------------------------------------------------------------------- host
    def _host_process(self, host: Host, iface: Interface, frame: Frame, capture, queue, ctx):
        if not (frame.is_broadcast() or frame.dst_mac == iface.mac):
            return
        if frame.ethertype == ETHERTYPE_ARP:
            self._handle_arp(host, iface, frame.payload, capture, queue, ctx)
            return
        ip: IpPacket = frame.payload
        if isinstance(ip.payload, DhcpMessage):
            self._host_dhcp(host, iface, ip.payload, capture, queue, ctx)
            return
        if frame.dst_mac != iface.mac:
            return
        if ip.dst_ip != iface.ip:
            return
        if ip.payload.icmp_type == ICMP_ECHO_REQUEST:
            reply = IpPacket(
                src_ip=iface.ip,
                dst_ip=ip.src_ip,
                protocol=PROTO_ICMP,
                payload=IcmpMessage(ICMP_ECHO_REPLY, ip.payload.identifier, ip.payload.sequence),
            )
            self._host_send_ip(host, reply, capture, queue, ctx)
        elif ip.payload.icmp_type == ICMP_ECHO_REPLY:
            ctx["echo_replies"].append(ip)
        elif ip.payload.icmp_type == ICMP_TIME_EXCEEDED:
            ctx.setdefault("ttl_exceeded", []).append(ip.src_ip)

    def _host_send_ip(self, host: Host, ip: IpPacket, capture, queue, ctx):
        out = host.primary
        if out.ip is None or not out.is_up:
            return
        net = out.network
        dst = ipaddress.ip_address(ip.dst_ip)
        if net is not None and dst in net:
            next_hop = ip.dst_ip
        elif host.gateway:
            next_hop = host.gateway
        else:
            return  # no route
        self._send_or_arp(host, out, next_hop, ip, capture, queue, ctx)

    # ----------------------------------------------------------------- router
    def _router_process(self, rt: Router, iface: Interface, frame: Frame, capture, queue, ctx):
        hsrp_vmacs = self._active_hsrp_vmacs(rt, iface)
        accept_mac = frame.dst_mac == iface.mac or frame.dst_mac in hsrp_vmacs
        if not (frame.is_broadcast() or accept_mac):
            return
        if frame.ethertype == ETHERTYPE_ARP:
            self._handle_arp(rt, iface, frame.payload, capture, queue, ctx)
            return
        ip: IpPacket = frame.payload
        if isinstance(ip.payload, DhcpMessage):
            self._router_dhcp(rt, iface, ip.payload, capture, queue, ctx)
            return
        if not accept_mac:
            return
        # inbound access-list on the ingress interface
        if iface.acl_in and not self._acl_permit(rt, iface.acl_in, ip):
            return
        # NAT outside->inside: translate the destination before routing
        if iface.nat_role == "outside":
            ip = self._nat_inbound(rt, ip)
        if any(i.ip == ip.dst_ip for i in rt.interfaces.values()) or ip.dst_ip in self._active_hsrp_vips(rt):
            if ip.payload.icmp_type == ICMP_ECHO_REQUEST:
                reply = IpPacket(
                    src_ip=ip.dst_ip,
                    dst_ip=ip.src_ip,
                    protocol=PROTO_ICMP,
                    payload=IcmpMessage(ICMP_ECHO_REPLY, ip.payload.identifier, ip.payload.sequence),
                )
                route = self._route_lookup(rt, reply.dst_ip)
                if route:
                    egress, next_hop = route
                    self._send_or_arp(rt, egress, next_hop, reply, capture, queue, ctx)
            return
        # forward
        ip = copy.copy(ip)
        ip.ttl -= 1
        if ip.ttl <= 0:
            self._send_time_exceeded(rt, iface, frame.payload, capture, queue, ctx)
            return
        route = self._route_lookup(rt, ip.dst_ip)
        if not route:
            return
        egress, next_hop = route
        # NAT inside->outside: translate the source as it leaves
        if iface.nat_role == "inside" and egress.nat_role == "outside":
            ip = self._nat_outbound(rt, ip, egress)
        # outbound access-list on the egress interface
        if egress.acl_out and not self._acl_permit(rt, egress.acl_out, ip):
            return
        # Zone-based firewall (stateful) between ingress and egress zones.
        if not self._zone_permit(rt, iface, egress, ip):
            return
        # IPS/IDS signature inspection.
        if not self._ips_inspect(rt, ip):
            return
        # IPsec: mark interesting traffic as protected (visibility only).
        if sec_mod.matching_tunnel(rt, ip.src_ip, ip.dst_ip):
            ctx.setdefault("ipsec_protected", []).append((ip.src_ip, ip.dst_ip))
        self._send_or_arp(rt, egress, next_hop, ip, capture, queue, ctx)

    def _zone_permit(self, rt: Router, ingress: Interface, egress: Interface, ip: IpPacket) -> bool:
        policy = sec_mod.zone_policy(rt, ingress.zone, egress.zone)
        if policy is None or policy in ("permit", "inspect"):
            if policy == "inspect":
                rt.fw_sessions.add((ip.src_ip, ip.dst_ip))
            return True
        # policy == "deny": allow only established (stateful) return traffic.
        if (ip.dst_ip, ip.src_ip) in rt.fw_sessions:
            return True
        return False

    def _ips_inspect(self, rt: Router, ip: IpPacket) -> bool:
        sig = sec_mod.match_signature(rt, ip)
        if sig is None:
            return True
        action = sig.get("action", "alert")
        rt.ips_alerts.append({"sig": sig.get("name", sig.get("id")),
                              "src": ip.src_ip, "dst": ip.dst_ip, "action": action})
        return action != "drop"

    # -------------------------------------------------------------- ACL / NAT
    def _acl_permit(self, rt: Router, name: str, ip: IpPacket) -> bool:
        acld = rt.acls.get(name)
        if acld is None:
            return True  # referencing a non-existent ACL permits all (Cisco)
        return acl_mod.evaluate(acld, ip)

    def _send_time_exceeded(self, rt: Router, in_iface: Interface, orig: IpPacket, capture, queue, ctx):
        if in_iface.ip is None:
            return
        msg = IpPacket(
            src_ip=in_iface.ip,
            dst_ip=orig.src_ip,
            protocol=PROTO_ICMP,
            payload=IcmpMessage(ICMP_TIME_EXCEEDED, orig.payload.identifier, orig.payload.sequence),
        )
        route = self._route_lookup(rt, msg.dst_ip)
        if route:
            egress, next_hop = route
            self._send_or_arp(rt, egress, next_hop, msg, capture, queue, ctx)

    def _nat_inbound(self, rt: Router, ip: IpPacket) -> IpPacket:
        for inside_local, inside_global in rt.nat_static:
            if ip.dst_ip == inside_global:
                out = copy.copy(ip)
                out.dst_ip = inside_local
                return out
        for inside_local, inside_global in rt.nat_pool_map.items():
            if ip.dst_ip == inside_global:
                out = copy.copy(ip)
                out.dst_ip = inside_local
                return out
        ident = getattr(ip.payload, "identifier", None)
        key = ("icmp", ip.dst_ip, ident)
        if key in rt.nat_pat_reverse:
            inside_local, orig_id = rt.nat_pat_reverse[key]
            out = copy.copy(ip)
            out.dst_ip = inside_local
            out.payload = copy.copy(ip.payload)
            out.payload.identifier = orig_id
            return out
        return ip

    def _nat_outbound(self, rt: Router, ip: IpPacket, egress: Interface) -> IpPacket:
        for inside_local, inside_global in rt.nat_static:
            if ip.src_ip == inside_local:
                out = copy.copy(ip)
                out.src_ip = inside_global
                self._record_nat(rt, "icmp", inside_local, inside_global, ip.dst_ip)
                return out
        for rule in rt.nat_dynamic:
            if not acl_mod.source_permitted(rt.acls.get(rule["acl"], {}), ip.src_ip):
                continue
            if rule.get("overload"):
                global_ip = self._pat_global(rt, rule, egress)
                if global_ip is None:
                    return ip
                ident = getattr(ip.payload, "identifier", 0)
                new_id = rt.nat_next_id
                rt.nat_next_id += 1
                rt.nat_pat_reverse[("icmp", global_ip, new_id)] = (ip.src_ip, ident)
                out = copy.copy(ip)
                out.src_ip = global_ip
                out.payload = copy.copy(ip.payload)
                out.payload.identifier = new_id
                self._record_nat(rt, "icmp", ip.src_ip, global_ip, ip.dst_ip, overload=True)
                return out
            global_ip = self._pool_alloc(rt, rule, ip.src_ip)
            if global_ip is None:
                return ip
            out = copy.copy(ip)
            out.src_ip = global_ip
            self._record_nat(rt, "icmp", ip.src_ip, global_ip, ip.dst_ip)
            return out
        return ip

    def _pat_global(self, rt: Router, rule: dict, egress: Interface) -> Optional[str]:
        if rule.get("interface"):
            iface = rt.get_interface(rule["interface"])
            return iface.ip if iface else None
        pool = rt.nat_pools.get(rule.get("pool"))
        return pool["start"] if pool else (egress.ip if egress else None)

    def _pool_alloc(self, rt: Router, rule: dict, inside_local: str) -> Optional[str]:
        if inside_local in rt.nat_pool_map:
            return rt.nat_pool_map[inside_local]
        pool = rt.nat_pools.get(rule.get("pool"))
        if not pool:
            return None
        taken = set(rt.nat_pool_map.values())
        lo, hi = int(ipaddress.ip_address(pool["start"])), int(ipaddress.ip_address(pool["end"]))
        for n in range(lo, hi + 1):
            cand = str(ipaddress.ip_address(n))
            if cand not in taken:
                rt.nat_pool_map[inside_local] = cand
                return cand
        return None

    def _record_nat(self, rt: Router, proto, inside_local, inside_global, outside, overload=False):
        entry = {
            "pro": proto,
            "inside_local": inside_local,
            "inside_global": inside_global,
            "outside": outside,
            "overload": overload,
        }
        if entry not in rt.nat_table:
            rt.nat_table.append(entry)

    def _egress_for_nexthop(self, rt: Router, next_hop: str) -> Optional[Interface]:
        nh = ipaddress.ip_address(next_hop)
        for iface in rt.interfaces.values():
            if iface.is_up and iface.network and nh in iface.network:
                return iface
        return None

    def _route_lookup(self, rt: Router, dst_ip: str) -> Optional[Tuple[Interface, str]]:
        """Longest-prefix match across connected (AD 0), static (AD 1) and
        OSPF (AD 110) routes. Returns (egress interface, next-hop ip)."""
        dst = ipaddress.ip_address(dst_ip)
        candidates: List[Tuple[int, int, Interface, str]] = []  # (prefixlen, AD, egress, next_hop)
        for iface in rt.interfaces.values():
            if iface.is_up and iface.network and dst in iface.network:
                candidates.append((iface.network.prefixlen, 0, iface, dst_ip))
        for network, prefix, next_hop in rt.static_routes:
            if dst in ipaddress.ip_network(f"{network}/{prefix}", strict=False):
                eg = self._egress_for_nexthop(rt, next_hop)
                if eg:
                    candidates.append((prefix, 1, eg, next_hop))
        for network, prefix, next_hop, _cost in rt.ospf_routes:
            if dst in ipaddress.ip_network(f"{network}/{prefix}", strict=False):
                eg = self._egress_for_nexthop(rt, next_hop)
                if eg:
                    candidates.append((prefix, 110, eg, next_hop))
        for network, prefix, next_hop, _m in rt.eigrp_routes:
            if dst in ipaddress.ip_network(f"{network}/{prefix}", strict=False):
                eg = self._egress_for_nexthop(rt, next_hop)
                if eg:
                    candidates.append((prefix, 90, eg, next_hop))
        for network, prefix, next_hop, _m in rt.rip_routes:
            if dst in ipaddress.ip_network(f"{network}/{prefix}", strict=False):
                eg = self._egress_for_nexthop(rt, next_hop)
                if eg:
                    candidates.append((prefix, 120, eg, next_hop))
        for network, prefix, next_hop, _as_path in rt.bgp_routes:
            if dst in ipaddress.ip_network(f"{network}/{prefix}", strict=False):
                eg = self._egress_for_nexthop(rt, next_hop)
                if eg:
                    candidates.append((prefix, 20, eg, next_hop))
        if not candidates:
            return None
        candidates.sort(key=lambda c: (-c[0], c[1]))  # longest prefix, then lowest AD
        _pl, _ad, egress, next_hop = candidates[0]
        return egress, next_hop

    # --------------------------------------------------------------- IPv6
    def _owner6(self, addr: str):
        """(device, interface) whose up interface owns IPv6 `addr`, else None."""
        try:
            a = ipaddress.ip_address(addr)
        except ValueError:
            return None
        for d in self.devices.values():
            for i in d.interfaces.values():
                if i.is_up and i.ipv6 and ipaddress.ip_address(i.ipv6) == a:
                    return d, i
        return None

    def _router_nexthop6(self, rt: Router, dst):
        """IPv6 longest-prefix match: ('connected', iface) or ('static', nh)."""
        for i in rt.interfaces.values():
            if i.is_up and i.network6 and dst in i.network6:
                return ("connected", i)
        cands = []
        for n, p, nh in rt.static_routes6:
            block = ipaddress.ip_network(f"{n}/{p}", strict=False)
            if dst in block:
                cands.append((block.prefixlen, nh))
        if cands:
            cands.sort(key=lambda c: -c[0])
            return ("static", cands[0][1])
        return None

    def _reachable6(self, host: Host, dst_str: str) -> bool:
        dst = ipaddress.ip_address(dst_str)
        net = host.primary.network6
        if net and dst in net:  # same link
            return self._owner6(dst_str) is not None
        if not host.gateway6:
            return False
        gw = self._owner6(host.gateway6)
        if gw is None or not isinstance(gw[0], Router):
            return False
        rt = gw[0]
        visited = set()
        for _ in range(64):  # hop limit / loop guard
            res = self._router_nexthop6(rt, dst)
            if res is None:
                return False
            kind, val = res
            if kind == "connected":
                return self._owner6(dst_str) is not None
            owner = self._owner6(val)
            if owner is None or owner[0] is rt or not isinstance(owner[0], Router):
                return False
            if id(owner[0]) in visited:
                return False
            visited.add(id(owner[0]))
            rt = owner[0]
        return False

    def ping6(self, src: str, dst: str, count: int = 1) -> dict:
        """IPv6 reachability (control-plane route walk over connected + static v6)."""
        host = self.devices.get(src)
        if not isinstance(host, Host):
            return {"ok": False, "error": f"{src} is not a host"}
        if host.primary.ipv6 is None:
            return {"ok": False, "error": f"{src} has no IPv6 address"}
        self.compute_spanning_tree()
        ok = self._reachable6(host, dst)
        received = count if ok else 0
        return {
            "ok": True,
            "src": src,
            "dst": dst,
            "sent": count,
            "received": received,
            "loss_pct": round(100 * (count - received) / count, 1),
        }

    # ------------------------------------------------------------- shared L2/3
    def _send_or_arp(self, device, out_iface: Interface, next_hop: str, ip: IpPacket, capture, queue, ctx):
        arp_table = device.arp_table
        mac = arp_table.get(next_hop)
        if mac:
            frame = Frame(src_mac=out_iface.mac, dst_mac=mac, payload=ip, ethertype=ETHERTYPE_IPV4)
            self._transmit(out_iface, frame, capture, queue, ctx)
            return
        # buffer and ARP
        first = next_hop not in device.pending
        device.pending.setdefault(next_hop, []).append((out_iface, ip))
        if first:
            arp = ArpPacket(ARP_REQUEST, out_iface.mac, out_iface.ip, next_hop)
            frame = Frame(out_iface.mac, BROADCAST_MAC, arp, ETHERTYPE_ARP)
            self._transmit(out_iface, frame, capture, queue, ctx)

    def _owns_nat_global(self, rt: Router, ip_str: str) -> bool:
        """A router answers ARP (proxy-ARP) for NAT inside-global addresses it
        represents but that are not assigned to any interface."""
        if any(ig == ip_str for _il, ig in rt.nat_static):
            return True
        addr = ipaddress.ip_address(ip_str)
        for pool in rt.nat_pools.values():
            if int(ipaddress.ip_address(pool["start"])) <= int(addr) <= int(ipaddress.ip_address(pool["end"])):
                return True
        return False

    # ------------------------------------------------------------- HSRP/VRRP
    @staticmethod
    def _hsrp_vmac(group: int, proto: str = "hsrp") -> str:
        if proto == "vrrp":
            return f"0000.5E00.01{group:02X}"
        return f"0000.0C07.AC{group:02X}"

    def _hsrp_active(self, group: int, subnet):
        """Elect the Active router/interface for an HSRP/VRRP group on a subnet.

        Highest priority wins; ties break on the highest interface IP. Only
        up interfaces are eligible, so a downed Active fails over to Standby."""
        cands = []
        for d in self.devices.values():
            if not isinstance(d, Router):
                continue
            for i in d.interfaces.values():
                if not (i.is_up and i.network == subnet and i.ip):
                    continue
                cfg = i.hsrp.get(group)
                if cfg is None:
                    continue
                cands.append((cfg.get("priority", 100), int(ipaddress.ip_address(i.ip)), d, i, cfg))
        if not cands:
            return None
        cands.sort(key=lambda c: (c[0], c[1]), reverse=True)
        _pri, _ip, dev, ifc, cfg = cands[0]
        return dev, ifc, cfg

    def _active_hsrp_vmacs(self, rt: Router, iface: Interface) -> dict:
        """vMAC -> VIP for groups on `iface` for which `rt` is the Active router."""
        out = {}
        if not isinstance(rt, Router) or iface.network is None:
            return out
        for group, cfg in iface.hsrp.items():
            active = self._hsrp_active(group, iface.network)
            if active and active[0] is rt:
                out[self._hsrp_vmac(group, cfg.get("proto", "hsrp"))] = cfg["vip"]
        return out

    def _active_hsrp_vips(self, rt: Router) -> set:
        vips = set()
        for iface in rt.interfaces.values():
            vips.update(self._active_hsrp_vmacs(rt, iface).values())
        return vips

    def etherchannel_summary(self, device: Device) -> List[dict]:
        """Rows for `show etherchannel summary`."""
        groups: Dict[int, List[Interface]] = {}
        for i in device.interfaces.values():
            if i.channel_group is not None:
                groups.setdefault(i.channel_group, []).append(i)
        out = []
        for g, members in sorted(groups.items()):
            modes = {m.channel_mode for m in members}
            if modes & {"active", "passive"}:
                proto = "LACP"
            elif modes & {"desirable", "auto"}:
                proto = "PAgP"
            else:
                proto = "-"
            out.append({
                "group": g,
                "members": [m.name for m in members],
                "proto": proto,
                "up": any(m.is_up for m in members),
            })
        return out

    def standby_state(self, rt: Router) -> List[dict]:
        """Rows for `show standby`: group, state, priority, virtual IP, peers."""
        rows = []
        for iface in rt.interfaces.values():
            for group, cfg in sorted(iface.hsrp.items()):
                active = self._hsrp_active(group, iface.network) if iface.network else None
                state = "Init"
                if active is not None:
                    state = "Active" if active[0] is rt else "Standby"
                rows.append({
                    "interface": iface.name,
                    "group": group,
                    "proto": cfg.get("proto", "hsrp").upper(),
                    "priority": cfg.get("priority", 100),
                    "state": state,
                    "vip": cfg["vip"],
                    "active_router": active[0].hostname if active else "unknown",
                })
        return rows

    def _handle_arp(self, device, iface: Interface, arp: ArpPacket, capture, queue, ctx):
        if arp.operation == ARP_REQUEST:
            # HSRP/VRRP: the Active router answers for the virtual IP with the vMAC.
            if isinstance(device, Router):
                vip_to_vmac = {vip: vmac for vmac, vip in self._active_hsrp_vmacs(device, iface).items()}
                if arp.target_ip in vip_to_vmac:
                    vmac = vip_to_vmac[arp.target_ip]
                    device.arp_table[arp.sender_ip] = arp.sender_mac
                    reply = ArpPacket(ARP_REPLY, vmac, arp.target_ip, arp.sender_ip, arp.sender_mac)
                    self._transmit(iface, Frame(vmac, arp.sender_mac, reply, ETHERTYPE_ARP), capture, queue, ctx)
                    return
            owns = arp.target_ip == iface.ip or (
                isinstance(device, Router) and self._owns_nat_global(device, arp.target_ip)
            )
            if owns:
                device.arp_table[arp.sender_ip] = arp.sender_mac
                reply = ArpPacket(ARP_REPLY, iface.mac, arp.target_ip, arp.sender_ip, arp.sender_mac)
                frame = Frame(iface.mac, arp.sender_mac, reply, ETHERTYPE_ARP)
                self._transmit(iface, frame, capture, queue, ctx)
        elif arp.operation == ARP_REPLY:
            if arp.target_mac == iface.mac:
                device.arp_table[arp.sender_ip] = arp.sender_mac
                self._flush_pending(device, arp.sender_ip, capture, queue, ctx)

    def _flush_pending(self, device, ip: str, capture, queue, ctx):
        mac = device.arp_table.get(ip)
        pending = device.pending.pop(ip, [])
        if not mac:
            return
        for out_iface, packet in pending:
            frame = Frame(out_iface.mac, mac, packet, ETHERTYPE_IPV4)
            self._transmit(out_iface, frame, capture, queue, ctx)

    # ------------------------------------------------------------------- DHCP
    def dhcp_request(self, host_name: str) -> Optional[dict]:
        """Run a full DORA exchange for a host and return the granted lease."""
        host = self.devices.get(host_name)
        if not isinstance(host, Host):
            return None
        out = host.primary
        if not out.is_up:
            return None
        self.compute_spanning_tree()
        ctx = {"step": [0], "dhcp_lease": None}
        capture: List[CaptureEntry] = []
        queue: deque = deque()
        discover = DhcpMessage(DHCP_DISCOVER, client_mac=out.mac)
        ip = IpPacket("0.0.0.0", "255.255.255.255", PROTO_UDP, discover, src_port=68, dst_port=67)
        frame = Frame(out.mac, BROADCAST_MAC, ip, ETHERTYPE_IPV4)
        self._transmit(out, frame, capture, queue, ctx)
        self._run(queue, capture, ctx)
        self.last_capture = capture
        return ctx.get("dhcp_lease")

    def _host_dhcp(self, host: Host, iface: Interface, msg: DhcpMessage, capture, queue, ctx):
        if msg.client_mac != iface.mac:
            return
        if msg.msg_type == DHCP_OFFER:
            request = DhcpMessage(
                DHCP_REQUEST, client_mac=iface.mac, your_ip=msg.your_ip,
                server_ip=msg.server_ip, gateway=msg.gateway, dns=msg.dns, prefix=msg.prefix,
            )
            ip = IpPacket("0.0.0.0", "255.255.255.255", PROTO_UDP, request, src_port=68, dst_port=67)
            self._transmit(iface, Frame(iface.mac, BROADCAST_MAC, ip, ETHERTYPE_IPV4), capture, queue, ctx)
        elif msg.msg_type == DHCP_ACK:
            iface.set_ip(msg.your_ip, str(msg.prefix))
            if msg.gateway:
                host.gateway = msg.gateway
            lease = {"ip": msg.your_ip, "prefix": msg.prefix, "gateway": msg.gateway, "dns": msg.dns}
            host.dhcp_lease = lease
            ctx["dhcp_lease"] = lease

    def _router_dhcp(self, rt: Router, iface: Interface, msg: DhcpMessage, capture, queue, ctx):
        if msg.msg_type not in (DHCP_DISCOVER, DHCP_REQUEST):
            return
        pool = self._find_pool(rt, iface)
        if pool is None:
            return
        offered = self._dhcp_allocate(rt, pool, msg.client_mac)
        if offered is None:
            return
        reply_type = DHCP_OFFER if msg.msg_type == DHCP_DISCOVER else DHCP_ACK
        reply = DhcpMessage(
            reply_type, client_mac=msg.client_mac, your_ip=offered, server_ip=iface.ip or "0.0.0.0",
            gateway=pool.gateway, dns=pool.dns, prefix=pool.prefix,
        )
        ip = IpPacket(iface.ip or "0.0.0.0", offered, PROTO_UDP, reply, src_port=67, dst_port=68)
        # unicast back to the client (the switch already learned its MAC from the broadcast)
        self._transmit(iface, Frame(iface.mac, msg.client_mac, ip, ETHERTYPE_IPV4), capture, queue, ctx)

    def _find_pool(self, rt: Router, iface: Interface):
        if iface.network is None:
            return None
        for pool in rt.dhcp_pools.values():
            if pool.network is None or pool.prefix is None:
                continue
            pool_net = ipaddress.ip_network(f"{pool.network}/{pool.prefix}", strict=False)
            if pool_net == iface.network:
                return pool
        return None

    def _dhcp_allocate(self, rt: Router, pool, client_mac: str) -> Optional[str]:
        for lease in rt.dhcp_leases:
            if lease["mac"] == client_mac and lease["pool"] == pool.name:
                return lease["ip"]
        net = ipaddress.ip_network(f"{pool.network}/{pool.prefix}", strict=False)
        taken = {lease["ip"] for lease in rt.dhcp_leases}
        taken |= rt.dhcp_excluded
        if pool.gateway:
            taken.add(pool.gateway)
        for iface in rt.interfaces.values():
            if iface.ip:
                taken.add(iface.ip)
        for addr in net.hosts():
            candidate = str(addr)
            if candidate not in taken:
                rt.dhcp_leases.append({"ip": candidate, "mac": client_mac, "pool": pool.name})
                return candidate
        return None

    # ------------------------------------------------------------------- OSPF
    def compute_ospf(self) -> None:
        """Build OSPF adjacencies over shared subnets and install routes via SPF.

        Deterministic from the topology: routers running OSPF whose interfaces
        match a `network ... area` statement become neighbours when they share a
        subnet and area; Dijkstra over that graph yields the routes (admin
        distance 110, applied in `_route_lookup`)."""
        routers = [d for d in self.devices.values() if isinstance(d, Router) and d.ospf_pid is not None]
        for r in routers:
            r.ospf_routes = []
        if len(routers) < 2:
            return

        def ospf_ifaces(router: Router):
            out = []
            for i in router.interfaces.values():
                if not (i.is_up and i.network):
                    continue
                for net, prefix, area in router.ospf_networks:
                    block = ipaddress.ip_network(f"{net}/{prefix}", strict=False)
                    if ipaddress.ip_address(i.ip) in block:
                        out.append((i, area))
                        break
            return out

        ifaces = {r.name: ospf_ifaces(r) for r in routers}
        # Group OSPF interfaces by (subnet, area) so adjacencies form in near
        # linear time instead of O(routers^2 * interfaces^2): two routers are
        # neighbours iff they share a subnet in the same area.
        groups: Dict[tuple, list] = defaultdict(list)
        for r in routers:
            for i, area in ifaces[r.name]:
                groups[(str(i.network), area)].append((r, i))
        # neighbours[r] = list of (neighbour_router, cost, next_hop_ip)
        neighbours: Dict[str, list] = {r.name: [] for r in routers}
        for members in groups.values():
            if len(members) < 2:
                continue
            for r, _i in members:
                for r2, j in members:
                    if r2 is r:
                        continue
                    neighbours[r.name].append((r2, 1, j.ip))

        for src in routers:
            dist = {src.name: 0}
            next_hop = {src.name: None}
            heap = [(0, src.name)]
            while heap:
                d, rn = heapq.heappop(heap)
                if d > dist.get(rn, float("inf")):
                    continue
                for nb, cost, nh_ip in neighbours[rn]:
                    nd = d + cost
                    if nd < dist.get(nb.name, float("inf")):
                        dist[nb.name] = nd
                        next_hop[nb.name] = nh_ip if rn == src.name else next_hop[rn]
                        heapq.heappush(heap, (nd, nb.name))

            local_nets = {str(i.network) for i, _a in ifaces[src.name]}
            best: Dict[str, Tuple[int, str]] = {}
            for r in routers:
                if r is src or r.name not in dist:
                    continue
                for i, _a in ifaces[r.name]:
                    netstr = str(i.network)
                    if netstr in local_nets:
                        continue
                    cand = (dist[r.name], next_hop[r.name])
                    if cand[1] and (netstr not in best or cand[0] < best[netstr][0]):
                        best[netstr] = cand
            for netstr, (cost, nh) in best.items():
                block = ipaddress.ip_network(netstr)
                src.ospf_routes.append((str(block.network_address), block.prefixlen, nh, cost))

    def ospf_neighbors(self, rt: Router) -> List[dict]:
        """Neighbour list for `show ip ospf neighbor` (recomputed on demand)."""
        self.compute_ospf()
        bgp_mod.compute(self)
        igp_mod.compute(self)
        result = []
        if rt.ospf_pid is None:
            return result
        for i in rt.interfaces.values():
            if not (i.is_up and i.network):
                continue
            matched = any(
                ipaddress.ip_address(i.ip) in ipaddress.ip_network(f"{n}/{p}", strict=False)
                for n, p, _a in rt.ospf_networks
            )
            if not matched:
                continue
            for other in self.devices.values():
                if other is rt or not isinstance(other, Router) or other.ospf_pid is None:
                    continue
                for j in other.interfaces.values():
                    if j.is_up and j.network == i.network and j.ip:
                        local_matched = any(
                            ipaddress.ip_address(j.ip) in ipaddress.ip_network(f"{n}/{p}", strict=False)
                            for n, p, _a in other.ospf_networks
                        )
                        if local_matched:
                            result.append({"neighbor": other.hostname, "address": j.ip, "interface": i.name})
        return result

    def eigrp_neighbors(self, rt: Router) -> List[dict]:
        """Neighbour list for `show ip eigrp neighbors` (shared subnet + AS)."""
        result = []
        if rt.eigrp_asn is None:
            return result
        for i in igp_mod._participating(rt, "eigrp"):
            for other in self.devices.values():
                if other is rt or not isinstance(other, Router) or other.eigrp_asn != rt.eigrp_asn:
                    continue
                for j in igp_mod._participating(other, "eigrp"):
                    if j.network == i.network and j.ip:
                        result.append({"neighbor": other.hostname, "address": j.ip, "interface": i.name})
        return result

    # ----------------------------------------------------------- Phase 10 security
    def crypto_sessions(self, rt: Router) -> List[dict]:
        """IPsec session status for `show crypto session`.

        A tunnel is 'UP-ACTIVE' when the peer is a reachable router with a
        reciprocal (mirror-image) tunnel definition."""
        out = []
        for t in rt.crypto_tunnels:
            status = "DOWN"
            owner = self.find_ip_owner(t["peer"])
            if owner is not None:
                peer_dev, _pi = owner
                reachable = self._route_lookup(rt, t["peer"]) is not None
                if isinstance(peer_dev, Router) and reachable and any(
                        sec_mod.tunnels_match(t, pt) for pt in peer_dev.crypto_tunnels):
                    status = "UP-ACTIVE"
            out.append({
                "peer": t["peer"], "status": status,
                "local": f"{t['local_net']}/{t['local_prefix']}",
                "remote": f"{t['remote_net']}/{t['remote_prefix']}",
            })
        return out

    def dot1x_authenticate(self, sw_name: str, iface_name: str, user: str, password: str) -> bool:
        """Authenticate an 802.1X supplicant against the switch's local user db."""
        sw = self.devices.get(sw_name)
        if not isinstance(sw, Switch):
            return False
        iface = sw.get_interface(iface_name)
        if iface is None or not iface.dot1x:
            return False
        if sw.aaa_users.get(user) == password:
            iface.dot1x_authorized = True
            return True
        return False
