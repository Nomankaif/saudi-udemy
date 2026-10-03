"""Bounded CCNA configuration features, independent of the vendored engine.

This is a deterministic teaching model, not IOS or a real protocol daemon.
OSPF roles are recalculated after configuration changes (no election timers).
"""
import copy
import ipaddress as ip
import re
from engine.models import Router, Switch
from engine.cli import CONFIG, CONFIG_IF, CONFIG_ROUTER, PRIV, USER


def vlan_set(value):
    if value == "all": return set(range(1, 4095))
    if value == "none": return set()
    result = set()
    for item in value.split(","):
        if not re.fullmatch(r"\d+(?:-\d+)?", item): raise ValueError("Invalid VLAN list")
        bounds = list(map(int, item.split("-")))
        lo, hi = bounds[0], bounds[-1]
        if not 1 <= lo <= hi <= 4094: raise ValueError("VLAN IDs must be 1–4094")
        result.update(range(lo, hi + 1))
    return result


def vlan_text(values):
    if values is None or len(values) == 4094: return "all"
    if not values: return "none"
    return ",".join(map(str, sorted(values)))


def allows(port, vlan):
    return port.mode != "trunk" or getattr(port, "allowed_vlans", None) is None or vlan in port.allowed_vlans


def channel_ok(port):
    peer = port.peer()
    if not port.is_up or not peer or not isinstance(peer.device, Switch): return False
    if port.channel_group is None or peer.channel_group is None: return False
    modes = {port.channel_mode, peer.channel_mode}
    negotiated = (modes <= {"active", "passive"} and "active" in modes) or modes == {"on"} or (modes <= {"desirable", "auto"} and "desirable" in modes)
    if not negotiated: return False
    # Members must agree locally and across the link on Layer-2 settings.
    signature = lambda p: (p.mode, p.vlan, vlan_text(getattr(p, "allowed_vlans", None)))
    if signature(port) != signature(peer): return False
    for end in (port, peer):
        members = [p for p in end.device.interfaces.values() if p.channel_group == end.channel_group]
        if any(signature(p) != signature(end) for p in members): return False
        if any(p.peer() and p.peer().device is not end.peer().device for p in members): return False
    return True


def router_id(dev):
    if getattr(dev, "ospf_router_id", None): return dev.ospf_router_id
    loops = [i.ip for i in dev.interfaces.values() if i.enabled and i.ip and i.name.lower().startswith("lo")]
    addresses = loops or [i.ip for i in dev.interfaces.values() if i.enabled and i.ip]
    return max(addresses, key=lambda a: int(ip.IPv4Address(a))) if addresses else "0.0.0.0"


def discovery(port, protocol="lldp"):
    peer = port.peer()
    if not port.is_up or not peer: return False
    if protocol == "cdp":
        return all(getattr(p.device, "cdp_run", True) and getattr(p, "cdp_enable", True) for p in (port, peer))
    return (getattr(port.device, "lldp_run", False) and getattr(peer.device, "lldp_run", False)
            and getattr(port, "lldp_receive", True) and getattr(peer, "lldp_transmit", True))


class CCNAConsole:
    def ccna_running(self, text):
        lines = text.splitlines()
        result = []
        for line in lines:
            result.append(line)
            if line.startswith("interface "):
                p = self.device.get_interface(line[10:])
                if isinstance(self.device, Switch):
                    if p.mode == "access": result.append(" switchport mode access")
                    if p.mode == "trunk": result.append(f" switchport trunk native vlan {p.vlan}")
                    if getattr(p, "allowed_vlans", None) is not None: result.append(f" switchport trunk allowed vlan {vlan_text(p.allowed_vlans)}")
                    if getattr(p, "voice_vlan", None): result.append(f" switchport voice vlan {p.voice_vlan}")
                if getattr(p, "ipv6_enabled", False): result.append(" ipv6 enable")
                for key in ("lldp_transmit", "lldp_receive", "cdp_enable"):
                    if not getattr(p, key, True): result.append(" no " + key.replace("_", " "))
                if getattr(p, "ospf_priority", 1) != 1: result.append(f" ip ospf priority {p.ospf_priority}")
                if getattr(p, "ospf_process", None) is not None: result.append(f" ip ospf {p.ospf_process} area {p.ospf_area}")
            if line.startswith("router ospf ") and getattr(self.device, "ospf_router_id", None):
                result.append(f" router-id {self.device.ospf_router_id}")
        if getattr(self.device, "lldp_run", False): result.append("lldp run")
        if not getattr(self.device, "cdp_run", True): result.append("no cdp run")
        # Rewrite static route distance without changing upstream tuple shape.
        distances = getattr(self.device, "route_distances", {})
        for index, line in enumerate(result):
            p = line.split()
            if p[:2] == ["ip", "route"]:
                n = ip.IPv4Network(f"{p[2]}/{p[3]}")
                distance = distances.get((str(n.network_address), n.prefixlen, p[4]), 1)
                if distance != 1: result[index] += f" {distance}"
        return "\n".join(result)

    def ccna_execute(self, line):
        """Return None to delegate to the upstream grammar."""
        p = line.lower().split()
        dev = self.device
        if not p: return ""
        if "?" in line:
            options = ["interface range", "switchport trunk allowed vlan", "switchport trunk native vlan", "switchport voice vlan", "channel-group", "lldp run", "lldp transmit", "lldp receive", "cdp run", "cdp enable", "ip ospf priority", "ip ospf", "ipv6 enable", "ipv6 address", "router-id", "show lldp neighbors", "show cdp neighbors", "show interfaces trunk", "show etherchannel summary", "show ip ospf interface"]
            prefix = line.replace("?", "").strip().lower()
            arguments = {"switchport trunk allowed vlan": "<1-4094>  VLAN list (10,20-30), all, none, add, remove or except", "switchport voice vlan": "<1-4094>  Voice VLAN", "switchport trunk native vlan": "<1-4094>  Native VLAN", "ip ospf priority": "<0-255>  Election priority; 0 is ineligible", "interface range": "<interfaces>  Example: e0/0-1 or e0/0,e0/2", "channel-group": "<1-4094> mode active|passive|on|desirable|auto", "router-id": "A.B.C.D  Router ID", "ipv6 address": "X:X::X/PREFIX  Global IPv6 address"}
            if prefix in arguments: return "  " + arguments[prefix]
            hits = [c for c in options if c.startswith(prefix)]
            if hits and prefix: return "\n".join("  " + c[len(prefix):].strip() + "  CCNA configuration" for c in hits)
            return None
        if p[0] in ("end", "exit"):
            self.range_ports = []
            return None
        if self.mode not in (USER, PRIV) and p[0] in ("int", "interface"):
            spec = re.sub(r"\s+", "", " ".join(line.split()[1:]))
            is_range = spec.lower().startswith("range")
            spec = spec[5:] if is_range else spec
            names = []
            for item in spec.split(","):
                m = re.fullmatch(r"(.+?)(\d+)-(\d+)", item)
                if m:
                    if not is_range or int(m[3]) < int(m[2]) or int(m[3]) - int(m[2]) > 47: raise ValueError("Invalid interface range")
                    names.extend(f"{m[1]}{n}" for n in range(int(m[2]), int(m[3]) + 1))
                else: names.append(item)
            ports = []
            for name in names:
                port = dev.get_interface(name)
                if port is None and re.fullmatch(r"(?i)(?:port-channel|po)\d+", name) and isinstance(dev, Switch):
                    group = int(re.search(r"\d+", name)[0])
                    if not 1 <= group <= 4094 or len(dev.interfaces) >= 64: raise ValueError("Invalid port channel")
                    port = dev.add_interface(f"Port-channel{group}"); port.enabled = True
                if port is None: raise ValueError("Interface does not exist")
                ports.append(port)
            self.range_ports = ports if is_range else []
            self.iface, self.mode = ports[0], CONFIG_IF
            return ""
        if self.mode == CONFIG_IF and getattr(self, "range_ports", []):
            selected = self.range_ports
            self.range_ports = []
            outputs = []
            try:
                for port in selected:
                    self.iface = port
                    outputs.append(self.execute(line))
            finally: self.range_ports, self.iface, self.mode = selected, selected[0], CONFIG_IF
            return "\n".join(o for o in outputs if o)
        # IOS permits switching directly to global configuration sections.
        if self.mode not in (USER, PRIV) and p[0] in ("vlan", "router", "lldp", "cdp") and (self.mode != CONFIG_IF or p[1:2] == ["run"]):
            self.mode = CONFIG
        no = p[0] == "no"
        q = p[1:] if no else p
        if self.mode == CONFIG and q in (["lldp", "run"], ["cdp", "run"]):
            setattr(dev, q[0] + "_run", not no); return ""
        if self.mode == CONFIG and q[:2] == ["ip", "route"]:
            if not isinstance(dev, Router) or len(q) not in (5, 6): raise ValueError("Use ip route NETWORK MASK NEXT-HOP [DISTANCE]")
            n = ip.IPv4Network(f"{q[2]}/{q[3]}", strict=True)
            key = (str(n.network_address), n.prefixlen, str(ip.IPv4Address(q[4])))
            distance = int(q[5]) if len(q) == 6 else 1
            if not 1 <= distance <= 255: raise ValueError("Distance must be 1–255")
            if not hasattr(dev, "route_distances"): dev.route_distances = {}
            if no:
                dev.static_routes = [r for r in dev.static_routes if r != key]
                dev.route_distances.pop(key, None)
            else:
                if key not in dev.static_routes: dev.static_routes.append(key)
                dev.route_distances[key] = distance
            return ""
        if self.mode == CONFIG and q[:2] == ["router", "ospf"]:
            if len(q) != 3 or not isinstance(dev, Router) or not 1 <= int(q[2]) <= 65535: raise ValueError("Invalid OSPF process")
            if no:
                dev.ospf_pid, dev.ospf_networks, dev.ospf_router_id = None, [], None
                return ""
        if self.mode == CONFIG_ROUTER and self.router_proto == "ospf":
            if q[0] == "router-id" and len(q) == 2:
                dev.ospf_router_id = None if no else str(ip.IPv4Address(q[1])); return ""
            if q[0] == "network" and len(q) == 5 and q[3] == "area":
                inv = int(ip.IPv4Address(q[2])); mask = str(ip.IPv4Address(0xffffffff ^ inv))
                n = ip.IPv4Network(f"{q[1]}/{mask}", strict=False)
                area = int(q[4])
                if not 0 <= area <= 4294967295: raise ValueError("Invalid OSPF area")
                item = (str(n.network_address), n.prefixlen, area)
                if no: dev.ospf_networks = [r for r in dev.ospf_networks if r != item]
                elif item not in dev.ospf_networks: dev.ospf_networks.append(item)
                return ""
        if self.mode != CONFIG_IF: return None
        port = self.iface
        if q in (["lldp", "transmit"], ["lldp", "receive"], ["cdp", "enable"]):
            setattr(port, "_".join(q), not no); return ""
        if q == ["ipv6", "enable"]:
            port.ipv6_enabled = not no; return ""
        if q[:2] == ["ipv6", "address"]:
            if no: port.ipv6, port.ipv6_prefix = None, None; return ""
            if len(q) != 3: raise ValueError("Use ipv6 address ADDRESS/PREFIX")
            a = ip.IPv6Interface(q[2]); port.set_ipv6(str(a.ip), a.network.prefixlen); return ""
        if q[:2] == ["ip", "ospf"]:
            if not isinstance(dev, Router): raise ValueError("OSPF requires a router")
            if len(q) == 4 and q[2] == "priority":
                priority = int(q[3])
                if not 0 <= priority <= 255: raise ValueError("Priority must be 0–255")
                port.ospf_priority = 1 if no else priority; return ""
            if len(q) == 5 and q[3] == "area":
                pid, area = int(q[2]), int(q[4])
                if not 1 <= pid <= 65535 or not 0 <= area <= 4294967295: raise ValueError("Invalid OSPF process or area")
                if dev.ospf_pid not in (None, pid): raise ValueError("Only one OSPF process per router is modeled")
                port.ospf_process, port.ospf_area = (None, None) if no else (pid, area)
                if not no: dev.ospf_pid = pid
                return ""
        if q[:2] == ["switchport", "trunk"] or q[:2] == ["switchport", "voice"]:
            if not isinstance(dev, Switch): raise ValueError("Switchport requires a switch")
            if q == ["switchport", "trunk", "encapsulation", "dot1q"]: return ""
            if q[:4] == ["switchport", "trunk", "allowed", "vlan"]:
                arg = q[4:]
                values = None if no else vlan_set(arg[-1])
                if not no and len(arg) == 2:
                    old = getattr(port, "allowed_vlans", None)
                    old = set(range(1, 4095)) if old is None else old.copy()
                    if arg[0] == "add": values = old | values
                    elif arg[0] == "remove": values = old - values
                    elif arg[0] == "except": values = set(range(1, 4095)) - values
                    else: raise ValueError("Use add, remove or except")
                elif not no and len(arg) != 1: raise ValueError("Invalid VLAN list")
                port.allowed_vlans = values
                self.propagate_channel(port, "allowed_vlans", values)
                return ""
            if q[:3] == ["switchport", "voice", "vlan"] or q[:4] == ["switchport", "trunk", "native", "vlan"]:
                value = int(q[-1]) if not no else 1
                if not 1 <= value <= 4094: raise ValueError("Invalid VLAN ID")
                key = "voice_vlan" if q[1] == "voice" else "vlan"
                setattr(port, key, value if not no or key == "vlan" else None)
                self.propagate_channel(port, key, getattr(port, key))
                return ""
        if q[0] == "channel-group":
            if not isinstance(dev, Switch): raise ValueError("EtherChannel requires a switch")
            if no: port.channel_group, port.channel_mode = None, None; return ""
            if len(q) != 4 or q[2] != "mode" or q[3] not in ("active", "passive", "on", "desirable", "auto") or not 1 <= int(q[1]) <= 4094: raise ValueError("Invalid channel-group")
            port.channel_group, port.channel_mode = int(q[1]), q[3]
            name = f"Port-channel{q[1]}"
            if name not in dev.interfaces:
                if len(dev.interfaces) >= 64: raise ValueError("Interface limit reached")
                logical = dev.add_interface(name); logical.enabled = True
                for key in ("mode", "vlan", "allowed_vlans"):
                    setattr(logical, key, copy.deepcopy(getattr(port, key, None)))
            return ""
        if q[:2] == ["switchport", "mode"] and len(q) == 3 and q[2] in ("access", "trunk"):
            if not isinstance(dev, Switch): raise ValueError("Switchport requires a switch")
            port.mode = "access" if no else q[2]; self.propagate_channel(port, "mode", port.mode); return ""
        return None

    def propagate_channel(self, port, key, value):
        if port.name.lower().startswith("port-channel"):
            group = int(re.search(r"\d+", port.name)[0])
            for member in self.device.interfaces.values():
                if member.channel_group == group: setattr(member, key, copy.deepcopy(value))

    def ccna_show(self, parts):
        p = [v.lower() for v in parts]
        if len(p) >= 3 and p[1] in ("lldp", "cdp") and "neighbors".startswith(p[2]):
            rows = ["Device ID        Local Interface       Port ID"]
            for port in self.device.interfaces.values():
                if discovery(port, p[1]): rows.append(f"{port.peer().device.hostname:16} {port.name:21} {port.peer().name}")
            return "\n".join(rows)
        if p[1:3] == ["interfaces", "trunk"]:
            rows = ["Port             Mode    Native VLAN    Allowed VLANs"]
            for port in self.device.interfaces.values():
                if port.mode == "trunk": rows.append(f"{port.name:16} trunk   {port.vlan:<14} {vlan_text(getattr(port, 'allowed_vlans', None))}")
            return "\n".join(rows)
        if p[1:4] == ["ip", "ospf", "interface"] and isinstance(self.device, Router):
            _, ports, _ = self.network._ospf_edges()
            return "\n".join(f"{i.name}: Area {a}, Priority {getattr(i, 'ospf_priority', 1)}, State {self.network.ospf_role(self.device, i)}, Router ID {router_id(self.device)}" for i, a in ports.get(self.device.name, [])) or "OSPF is not enabled on any interface"
        if p[1:4] == ["ip", "ospf", "neighbor"] and isinstance(self.device, Router):
            rows = ["Neighbor ID       State       Address          Interface"]
            for entry in self.network.ospf_neighbors(self.device):
                peer = self.network.devices[entry["neighbor"]]
                pi = next(i for i in peer.interfaces.values() if i.ip == entry["address"])
                rows.append(f"{router_id(peer):17} FULL/{self.network.ospf_role(peer, pi):7} {entry['address']:16} {entry['interface']}")
            return "\n".join(rows)
        return None


def extra_rule(net, consoles, dev, rule):
    kind, value = rule["type"], rule.get("value", "")
    port = dev.get_interface(rule.get("interface", ""))
    if kind == "interface_ipv6": return bool(port.ipv6) and ip.IPv6Interface(f"{port.ipv6}/{port.ipv6_prefix}") == ip.IPv6Interface(value)
    if kind == "vlan_name":
        number, name = value.split("|", 1)
        return dev.vlans.get(int(number)) == name
    if kind == "voice_vlan": return getattr(port, "voice_vlan", None) == int(value)
    if kind == "native_vlan": return port.mode == "trunk" and port.vlan == int(value)
    if kind == "allowed_vlans":
        actual = getattr(port, "allowed_vlans", None)
        return port.mode == "trunk" and (set(range(1, 4095)) if actual is None else actual) == vlan_set(value)
    if kind == "channel_group":
        group, mode = value.split()
        return port.channel_group == int(group) and port.channel_mode == mode and channel_ok(port)
    if kind == "lldp_neighbor": return discovery(port) and port.peer().device.name == value
    if kind in ("lldp_transmit", "lldp_receive", "cdp_enable"):
        return getattr(port, kind, True) == (value == "enabled")
    if kind == "ospf_process": return dev.ospf_pid == int(value)
    if kind == "ospf_router_id": return dev.ospf_pid is not None and router_id(dev) == value
    if kind == "ospf_priority": return getattr(port, "ospf_priority", 1) == int(value)
    if kind == "ospf_interface":
        pid, area = map(int, value.split())
        return getattr(port, "ospf_process", None) == pid and port.ospf_area == area
    if kind == "ospf_network":
        cidr, area = value.split(); n = ip.IPv4Network(cidr)
        return (str(n.network_address), n.prefixlen, int(area)) in dev.ospf_networks
    if kind == "ospf_neighbor": return any(n["neighbor"] == value for n in net.ospf_neighbors(dev))
    if kind == "ospf_dr": return net.ospf_role(dev, port) == "DR"
    return None
