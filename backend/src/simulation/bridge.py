"""Bounded JSON-in/JSON-out adapter; never executes operating-system commands.

The journal is replayed per operation so topology state survives restarts and
cannot leak between students. MongoDB is the only session source of truth.
"""
import ipaddress
import heapq
import json
import pathlib
import re
import sys
from collections import deque

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "vendor" / "netsim"))
from engine.simulator import Network
from engine.models import Host, Router, Switch
from engine.cli import CLISession, CONFIG, CONFIG_IF, PRIV, USER
from engine.clihelp import context_help
from engine.labs import grade_lab
from engine.packet import IpPacket, IcmpMessage, PROTO_ICMP, ICMP_ECHO_REQUEST, ICMP_ECHO_REPLY, ETHERTYPE_IPV4
from ccna_extensions import CCNAConsole, allows, channel_ok, router_id, extra_rule


class WiredNetwork(Network):
    """OSPF neighbours must share a wired L2 path, not just an IP subnet."""
    def ping(self, source, destination, count=1):
        dev = self.devices.get(source)
        if not isinstance(dev, Router): return super().ping(source, destination, count)
        self.compute_spanning_tree(); self.compute_ospf()
        route = self._route_lookup(dev, destination)
        results, capture = [], []
        for seq in range(1, count + 1):
            ctx, queue = {"echo_replies": [], "step": [0]}, deque()
            for d in self.devices.values():
                if hasattr(d, "pending"): d.pending.clear()
            if route:
                port, hop = route
                packet = IpPacket(src_ip=port.ip, dst_ip=destination, protocol=PROTO_ICMP, payload=IcmpMessage(ICMP_ECHO_REQUEST, identifier=1, sequence=seq))
                self._send_or_arp(dev, port, hop, packet, capture, queue, ctx)
                self._run(queue, capture, ctx)
            results.append({"seq": seq, "reply": any(p.payload.sequence == seq for p in ctx["echo_replies"])})
        received = sum(r["reply"] for r in results)
        return {"ok": True, "sent": count, "received": received, "loss_pct": (count - received) / count * 100, "results": results}

    def _router_process(self, router, iface, frame, capture, queue, ctx):
        packet = frame.payload
        if frame.ethertype == ETHERTYPE_IPV4 and isinstance(packet, IpPacket) and isinstance(packet.payload, IcmpMessage) and packet.payload.icmp_type == ICMP_ECHO_REPLY and frame.dst_mac == iface.mac and any(p.ip == packet.dst_ip for p in router.interfaces.values()):
            if not iface.acl_in or self._acl_permit(router, iface.acl_in, packet): ctx["echo_replies"].append(packet)
            return
        return super()._router_process(router, iface, frame, capture, queue, ctx)
    def l2_reachable(self, source, target):
        queue, seen = [(source, None)], set()
        while queue:
            port, tag = queue.pop()
            key = (port.device.name, port.name, tag)
            if key in seen or not port.is_up: continue
            seen.add(key)
            peer = port.peer()
            if peer is target and tag is None: return True
            if not peer or not isinstance(peer.device, Switch): continue
            switch = peer.device
            vlan = tag if peer.mode == "trunk" and tag is not None else peer.vlan
            if vlan not in switch.vlans or peer.stp_state == "blocking" or not allows(peer, vlan): continue
            for out in switch.interfaces.values():
                if out is peer or not out.forwarding: continue
                if allows(out, vlan) and (out.mode == "trunk" or out.vlan == vlan):
                    queue.append((out, vlan if out.mode == "trunk" and out.vlan != vlan else None))
        return False

    def _ospf_edges(self):
        self.compute_spanning_tree()
        routers = [d for d in self.devices.values() if isinstance(d, Router) and d.ospf_pid is not None]
        def active(r):
            result = []
            for i in r.interfaces.values():
                if not i.network or not (i.is_up or (i.enabled and i.name.lower().startswith("lo"))): continue
                if getattr(i, "ospf_process", None) == r.ospf_pid:
                    result.append((i, i.ospf_area)); continue
                for n, p, area in r.ospf_networks:
                    if ipaddress.ip_address(i.ip) in ipaddress.ip_network(f"{n}/{p}", strict=False):
                        result.append((i, area)); break
            return result
        ports = {r.name: active(r) for r in routers}
        edges = {r.name: [] for r in routers}
        for r in routers:
            for peer in routers:
                if peer is r: continue
                for a, area in ports[r.name]:
                    for b, other_area in ports[peer.name]:
                        if router_id(r) != router_id(peer) and area == other_area and a.network == b.network and self.l2_reachable(a, b):
                            edges[r.name].append((peer.name, b.ip, a.name))
        return routers, ports, edges

    def compute_ospf(self):
        routers, ports, edges = self._ospf_edges()
        for r in self.devices.values():
            if isinstance(r, Router): r.ospf_routes = []
        for source in routers:
            dist, hops, queue = {source.name: 0}, {}, [(0, source.name)]
            while queue:
                cost, name = heapq.heappop(queue)
                if cost != dist[name]: continue
                for peer, address, _ in edges[name]:
                    if cost + 1 < dist.get(peer, float("inf")):
                        dist[peer] = cost + 1
                        hops[peer] = address if name == source.name else hops[name]
                        heapq.heappush(queue, (cost + 1, peer))
            local = {str(i.network) for i in source.interfaces.values() if i.network}
            routes = {}
            for peer in routers:
                if peer is source or peer.name not in hops: continue
                for i, _ in ports[peer.name]:
                    n = str(i.network)
                    if n not in local and (n not in routes or dist[peer.name] < routes[n][3]):
                        routes[n] = (str(i.network.network_address), i.network.prefixlen, hops[peer.name], dist[peer.name])
            source.ospf_routes = list(routes.values())

    def ospf_neighbors(self, router):
        _, _, edges = self._ospf_edges()
        return [{"neighbor": n, "address": addr, "interface": iface} for n, addr, iface in edges.get(router.name, [])]

    def ospf_role(self, router, iface):
        _, ports, edges = self._ospf_edges()
        if iface not in [i for i, _ in ports.get(router.name, [])] or not iface.is_up: return "DOWN"
        candidates = [(getattr(iface, "ospf_priority", 1), int(ipaddress.IPv4Address(router_id(router))), router.name)]
        for name, address, local in edges.get(router.name, []):
            if local != iface.name: continue
            peer = self.devices[name]
            port = next(p for p in peer.interfaces.values() if p.ip == address)
            candidates.append((getattr(port, "ospf_priority", 1), int(ipaddress.IPv4Address(router_id(peer))), name))
        eligible = sorted((c for c in candidates if c[0] > 0), reverse=True)
        if not eligible: return "DROTHER"
        if eligible[0][2] == router.name: return "DR"
        if len(eligible) > 1 and eligible[1][2] == router.name: return "BDR"
        return "DROTHER"

    def compute_spanning_tree(self):
        # Do not let passive/passive or inconsistent bundles bypass STP.
        changed = []
        for d in self.devices.values():
            for p in d.interfaces.values():
                if p.channel_group is not None and not channel_ok(p): changed.append((p, p.channel_group))
        try:
            for p, _ in changed: p.channel_group = None
            super().compute_spanning_tree()
        finally:
            for p, group in changed: p.channel_group = group

    def _bundle_rep(self, switch, iface):
        if not channel_ok(iface): return iface
        members = [p for p in switch.interfaces.values() if p.channel_group == iface.channel_group and channel_ok(p)]
        return min(members, key=lambda p: p.name)

    def etherchannel_summary(self, device):
        rows = super().etherchannel_summary(device)
        for row in rows:
            row["up"] = any(channel_ok(device.interfaces[n]) for n in row["members"])
        return rows

    def _transmit(self, port, frame, capture, queue, ctx):
        if isinstance(port.device, Switch):
            if port.channel_group is not None and not channel_ok(port): return
            vlan = frame.vlan if frame.vlan is not None else port.vlan
            if not allows(port, vlan): return
            if port.mode == "trunk" and frame.vlan == port.vlan:
                import copy
                frame = copy.copy(frame); frame.vlan = None
        return super()._transmit(port, frame, capture, queue, ctx)

    def _route_lookup(self, router, destination):
        # Preserve upstream protocol selection, then compare each viable static
        # route using its administrative distance (including floating routes).
        saved = router.static_routes
        try:
            router.static_routes = []
            base = super()._route_lookup(router, destination)
        finally: router.static_routes = saved
        address = ipaddress.IPv4Address(destination)
        candidates = []
        for network, prefix, hop in saved:
            distance = getattr(router, "route_distances", {}).get((network, prefix, hop), 1)
            egress = self._egress_for_nexthop(router, hop)
            if distance < 255 and egress and address in ipaddress.IPv4Network(f"{network}/{prefix}"):
                candidates.append((prefix, distance, egress, hop))
        for p in router.interfaces.values():
            if p.is_up and p.network and address in p.network: candidates.append((p.prefix, 0, p, destination))
        for routes, distance in ((router.ospf_routes, 110), (router.eigrp_routes, 90), (router.rip_routes, 120), (router.bgp_routes, 20)):
            for n, prefix, hop, _ in routes:
                egress = self._egress_for_nexthop(router, hop)
                if egress and address in ipaddress.IPv4Network(f"{n}/{prefix}"): candidates.append((prefix, distance, egress, hop))
        if not candidates: return base
        best = min(candidates, key=lambda c: (-c[0], c[1]))
        return best[2], best[3]

    def _switch_process(self, switch, iface, frame, capture, queue, ctx):
        vlan = frame.vlan if iface.mode == "trunk" and frame.vlan is not None else iface.vlan
        if vlan not in switch.vlans or not allows(iface, vlan) or (iface.channel_group is not None and not channel_ok(iface)): return
        return super()._switch_process(switch, iface, frame, capture, queue, ctx)


class Console(CCNAConsole, CLISession):
    """Compatibility additions kept outside the pinned upstream engine."""
    def __init__(self, device, network):
        super().__init__(device, network)
        self.vlan_id = None
        self.startup = None

    @property
    def prompt(self):
        if self.vlan_id is not None:
            return f"{self.device.hostname}(config-vlan)#"
        return super().prompt

    def running(self):
        # Upstream show run omits the VLAN database and explicit access mode.
        text = self._show_run()
        if isinstance(self.device, Switch):
            text += "\n" + "\n".join(f"vlan {v}\n name {n}\n!" for v, n in sorted(self.device.vlans.items()))
        return self.ccna_running(text)

    def _show(self, parts):
        result = self.ccna_show(parts)
        return result if result is not None else super()._show(parts)

    def _show_ip_route(self):
        output = super()._show_ip_route()
        if not isinstance(self.device, Router): return output
        rows = [line for line in output.splitlines() if not line.startswith("S    ")]
        for n, prefix, hop in self.device.static_routes:
            key = (n, prefix, hop)
            distance = getattr(self.device, "route_distances", {}).get(key, 1)
            route = self.network._route_lookup(self.device, n)
            if distance < 255 and route and route[1] == hop:
                rows.append(f"S    {n}/{prefix} [{distance}/0] via {hop}")
        return "\n".join(rows)

    def _ping(self, parts):
        if isinstance(self.device, Router) and len(parts) == 2 and ":" not in parts[1]:
            result = self.network.ping(self.device.name, parts[1], 4)
            return f"Success rate is {100 - result['loss_pct']:.0f} percent ({result['received']}/{result['sent']})"
        return super()._ping(parts)

    def execute(self, line):
        line = line.strip()
        parts = line.lower().split()
        if not parts:
            return ""
        try:
            if self.mode == PRIV and parts in (["enable"], ["en"]):
                return ""
            if self.vlan_id is not None:
                if line == "?":
                    return "  name  VLAN name\n  exit  Global configuration\n  end   Privileged EXEC"
                if parts[0] == "name" and len(parts) == 2:
                    self.device.vlans[self.vlan_id] = line.split()[1]
                    return ""
                if parts[0] in ("exit", "end"):
                    self.vlan_id = None
                    if parts[0] == "end": self.mode = PRIV
                    return ""
                if parts[0] not in ("vlan", "interface", "int"):
                    return "% Use name, exit or end in VLAN configuration mode"
                self.vlan_id = None
            if parts[0] == "do" and self.mode not in (USER, PRIV):
                old_mode = self.mode
                self.mode = PRIV
                try: return self.execute(" ".join(line.split()[1:]))
                finally: self.mode = old_mode
            if self.mode == PRIV and parts in (["write"], ["write", "memory"], ["wr"], ["copy", "running-config", "startup-config"], ["copy", "run", "start"]):
                self.startup = self.running()
                return "Building configuration...\n[OK]"
            if parts in (["show", "running-config"], ["sh", "run"], ["show", "run"]):
                return self.running()
            if parts in (["show", "startup-config"], ["sh", "start"]):
                return self.startup or "% Startup configuration is not saved"
            extension = self.ccna_execute(line)
            if extension is not None: return extension
            if self.mode == CONFIG and parts[0] == "vlan" and isinstance(self.device, Switch):
                if len(parts) != 2 or not parts[1].isdigit() or not 1 <= int(parts[1]) <= 4094:
                    return "% Enter a VLAN ID from 1 to 4094"
                self.vlan_id = int(parts[1])
                self.device.vlans.setdefault(self.vlan_id, f"VLAN{self.vlan_id:04d}")
                return ""
            if isinstance(self.device, Host):
                if parts == ["ipconfig"]:
                    i = self.device.primary
                    return f"Address: {i.ip or 'Unassigned'}/{i.prefix or 0}\nGateway: {self.device.gateway or 'Unassigned'}"
                if parts == ["ipconfig", "/renew"]:
                    lease = self.network.dhcp_request(self.device.name)
                    return json.dumps(lease) if lease else "% No DHCP lease received"
                if parts[0] == "ip" and len(parts) in (3, 4) and "/" in parts[1]:
                    address = ipaddress.IPv4Interface(parts[1])
                    gateway = str(ipaddress.IPv4Address(parts[2]))
                    self.device.primary.set_ip(str(address.ip), address.network.prefixlen)
                    self.device.primary.enabled = True
                    self.device.gateway = gateway
                    return "Address configured"
                if line == "?":
                    return "  ip ADDRESS/PREFIX GATEWAY\n  ipconfig\n  ipconfig /renew\n  ping ADDRESS\n  traceroute ADDRESS"
            if self.mode == CONFIG_IF and parts[:3] == ["switchport", "access", "vlan"]:
                if len(parts) != 4 or not parts[3].isdigit() or not 1 <= int(parts[3]) <= 4094:
                    return "% Enter a VLAN ID from 1 to 4094"
            # Avoid unbounded numeric/range expansion by the upstream grammar.
            for lo, hi in re.findall(r"(\d+)-(\d+)", line):
                if int(hi) - int(lo) > 128 or int(hi) > 4094:
                    return "% Numeric range exceeds simulation limits"
            if any(len(p) > 64 for p in parts) or ("range" in parts) or any(p.isdigit() and int(p) > 4294967295 for p in parts):
                return "% Unsupported command argument or interface range"
            if parts[0] in ("ping", "traceroute") and len(parts) > 1:
                ipaddress.ip_address(parts[1])
            return super().execute(line)
        except (ValueError, IndexError, AttributeError, KeyError, TypeError) as exc:
            return "% Invalid or unsupported command parameters"


def build(lab):
    net = WiredNetwork()
    consoles = {}
    for d in lab["devices"]:
        dev = {"router": net.add_router, "switch": net.add_switch, "host": net.add_host}[d["type"]](d["name"])
        dev.interfaces.clear()
        for name, info in d["interfaces"].items():
            iface = dev.add_interface(name)
            iface.enabled = info["status"] == "up"
            if info.get("ip"):
                address = ipaddress.IPv4Interface(info["ip"])
                iface.set_ip(str(address.ip), address.network.prefixlen)
        if isinstance(dev, Host): dev.gateway = d.get("gateway") or None
        consoles[d["name"]] = Console(dev, net)
    for link in lab["links"]:
        net.connect(link["fromDevice"], link["fromInterface"], link["toDevice"], link["toInterface"])
    for d in lab["devices"]:
        cli = consoles[d["name"]]
        for line in d.get("initialConfig", "").splitlines():
            if not line.strip() or line.strip() == "!": continue
            result = cli.execute(line)
            if result.startswith("%"):
                raise ValueError(f"Initial configuration on {d['name']}: {line}: {result}")
        cli.mode = USER
        cli.vlan_id = None
    return net, consoles


def check_rule(net, consoles, device, rule):
    dev = net.devices[device]
    cli = consoles[device]
    kind = rule["type"]
    value = rule.get("value", "")
    iface = dev.get_interface(rule.get("interface", ""))
    extended = extra_rule(net, consoles, dev, rule)
    if extended is not None: return extended
    if kind == "vlan": return isinstance(dev, Switch) and int(value) in dev.vlans
    if kind == "access_vlan": return isinstance(dev, Switch) and iface.mode == "access" and iface.vlan == int(value)
    if kind == "trunk": return isinstance(dev, Switch) and iface.mode == "trunk"
    if kind == "interface_up": return iface.is_up
    if kind == "interface_ip": return iface.ip is not None and ipaddress.IPv4Interface(f"{iface.ip}/{iface.prefix}") == ipaddress.IPv4Interface(value)
    if kind == "static_route":
        network = ipaddress.IPv4Network(value, strict=False)
        key = (str(network.network_address), network.prefixlen, rule["nextHop"])
        return isinstance(dev, Router) and key in dev.static_routes and ("distance" not in rule or getattr(dev, "route_distances", {}).get(key, 1) == rule["distance"])
    if kind == "saved": return cli.startup is not None and cli.startup == cli.running()
    if kind == "ping":
        result = net.ping(device, value, 2)
        return bool(result.get("ok")) and ((result["received"] == result["sent"]) if rule.get("expect", "success") == "success" else result["received"] == 0)
    if kind == "route": return grade_lab(net, [{"type": "route", "device": device, "network": value}])["passed"] == 1
    if kind == "ospf_route":
        net.compute_ospf()
        network = ipaddress.IPv4Network(value, strict=False)
        return isinstance(dev, Router) and any(n == str(network.network_address) and p == network.prefixlen for n, p, _, _ in dev.ospf_routes)
    if kind == "config":
        # Exact canonical line in the selected interface block, never tokens
        # found independently elsewhere in a device configuration.
        lines = cli.running().splitlines()
        if rule.get("interface"):
            start = next((i for i, ln in enumerate(lines) if ln == f"interface {iface.name}"), -1)
            if start < 0: return False
            block = []
            for ln in lines[start + 1:]:
                if not ln.startswith(" "): break
                block.append(ln)
            lines = block
        else: lines = [ln for ln in lines if not ln.startswith(" ")]
        canonical = lambda s: " ".join(s.lower().split())
        return canonical(value) in [canonical(ln) for ln in lines]
    return False


def main(data):
    lab = data["lab"]
    net, consoles = build(lab)
    for entry in data.get("journal", []):
        consoles[entry["device"]].execute(entry["command"])
    operation = data.get("operation", "inspect")
    result = {}
    if operation == "validate":
        journal = []
        errors = []
        for task in lab["tasks"]:
            for line in task.get("hint", "").splitlines():
                if not line.strip() or line.strip() == "!": continue
                out = consoles[task["device"]].execute(line)
                journal.append({"device": task["device"], "command": line})
                if out.startswith("%"):
                    errors.append(f"Task {task['id']} ({task['device']}): {line}: {out}")
        if len(journal) > 2000: raise ValueError("Reference solutions exceed 2,000 commands")
        report = main({"lab": lab, "journal": journal, "operation": "grade"})
        return {"score": report["score"], "tasks": report["tasks"], "errors": errors, "valid": not errors and report["score"] == 100}
    if operation == "command":
        cli = consoles[data["device"]]
        result = {"prompt": cli.prompt, "output": cli.execute(data["command"])[:16000]}
    if operation == "complete":
        cli = consoles[data["device"]]
        line = data["input"]
        help_text = cli.execute(line + "?")
        result = {"partial": line.split()[-1] if line and not line.endswith(" ") else "", "matches": [{"word": ln.strip().split()[0]} for ln in help_text.splitlines() if ln.strip() and not ln.startswith("%") and not ln.strip().startswith("<")]}
    if operation == "grade":
        tasks = []
        for task in lab["tasks"]:
            # Each task gets a fresh copy so a ping/DHCP check cannot change
            # the outcome of later configuration or save checks.
            task_net, task_consoles = build(lab)
            for entry in data.get("journal", []): task_consoles[entry["device"]].execute(entry["command"])
            passed = all(check_rule(task_net, task_consoles, task["device"], r) for r in task["rules"])
            tasks.append({"id": task["id"], "device": task["device"], "text": task["text"], "passed": passed, "points": task["points"], "earned": task["points"] if passed else 0, "solution": task.get("hint", "")})
        possible = sum(t["points"] for t in tasks)
        earned = sum(t["earned"] for t in tasks)
        result = {"tasks": tasks, "correct": sum(t["passed"] for t in tasks), "total": len(tasks), "earned": earned, "possible": possible, "score": round(earned / possible * 100)}
    result["prompts"] = {name: cli.prompt for name, cli in consoles.items()}
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(main(json.load(sys.stdin))))
    except (ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"error": str(exc)[:500]}))
