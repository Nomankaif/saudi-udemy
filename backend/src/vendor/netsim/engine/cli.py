"""A small Cisco IOS-like command interpreter.

This is intentionally pragmatic, not a full IOS clone: it covers the CCNA-level
commands needed to configure and inspect the simulated devices. Each device has
its own CLISession holding the current mode and selected interface.
"""

from __future__ import annotations

import ipaddress
from typing import TYPE_CHECKING, List, Optional

from . import bgp as bgp_mod
from . import clihelp
from . import igp as igp_mod
from .acl import AclEntry
from .models import DhcpPool, Host, Router, Switch

if TYPE_CHECKING:
    from .simulator import Network

USER, PRIV, CONFIG, CONFIG_IF = "user", "priv", "config", "config-if"
CONFIG_DHCP, CONFIG_ROUTER = "config-dhcp", "config-router"
CONFIG_ACL = "config-acl"


def _is_ipv4(token: str) -> bool:
    if "." not in token:
        return False
    try:
        ipaddress.IPv4Address(token)
        return True
    except ValueError:
        return False


_ADDR_KEYWORDS = {"any", "host", "eq", "log"}


def _parse_addr_spec(toks: List[str]) -> tuple:
    """Parse a Cisco address spec, returning (addr, wildcard, remaining)."""
    if not toks:
        raise ValueError("Incomplete command")
    if toks[0] == "any":
        return "0.0.0.0", "255.255.255.255", toks[1:]
    if toks[0] == "host":
        if len(toks) < 2:
            raise ValueError("Incomplete command")
        return toks[1], "0.0.0.0", toks[2:]
    addr = toks[0]
    if len(toks) > 1 and _is_ipv4(toks[1]) and toks[1] not in _ADDR_KEYWORDS:
        return addr, toks[1], toks[2:]
    return addr, "0.0.0.0", toks[1:]


def _match(token: str, *options: str) -> Optional[str]:
    """Cisco-style unique-prefix matching for a single keyword."""
    token = token.lower()
    hits = [o for o in options if o.startswith(token)]
    return hits[0] if len(hits) == 1 else (token if token in options else None)


def _split_v6_prefix(spec: str) -> tuple:
    """Split 'INPUT/len' into (network, prefixlen); default /64 when omitted."""
    if "/" in spec:
        addr, plen = spec.split("/", 1)
        return addr, int(plen)
    return spec, 64


def _classful_prefix(addr: str) -> int:
    """Classful network mask length for a classful IGP `network` statement."""
    first = int(addr.split(".")[0])
    if first < 128:
        return 8
    if first < 192:
        return 16
    return 24


def _split_v4_prefix(spec: str) -> tuple:
    """Split 'a.b.c.d/len' or 'a.b.c.d mask' style into (network, prefixlen)."""
    if "/" in spec:
        addr, plen = spec.split("/", 1)
        return addr, int(plen)
    return spec, 24


def _expand_vlan_list(spec: str) -> list:
    """Expand '10', '10,20' or '10-12' into a list of vlan ids."""
    out = []
    for part in spec.split(","):
        if "-" in part:
            lo, hi = part.split("-", 1)
            out.extend(range(int(lo), int(hi) + 1))
        elif part.strip().isdigit():
            out.append(int(part))
    return out


class CLISession:
    def __init__(self, device, network: "Network"):
        self.device = device
        self.network = network
        self.mode = USER
        self.iface = None  # selected interface in config-if
        self.pool = None  # selected DHCP pool in config-dhcp
        self.acl_name = None  # selected ACL in config-acl
        self.router_proto = "ospf"  # protocol of the current config-router block

    # --------------------------------------------------------------- prompt
    @property
    def prompt(self) -> str:
        h = self.device.hostname
        if self.mode == USER:
            return f"{h}>"
        if self.mode == PRIV:
            return f"{h}#"
        if self.mode == CONFIG:
            return f"{h}(config)#"
        if self.mode == CONFIG_IF:
            return f"{h}(config-if)#"
        if self.mode == CONFIG_DHCP:
            return f"{h}(dhcp-config)#"
        if self.mode == CONFIG_ROUTER:
            return f"{h}(config-router)#"
        if self.mode == CONFIG_ACL:
            kind = self.device.acls.get(self.acl_name, {}).get("kind", "standard")
            tag = "std" if kind == "standard" else "ext"
            return f"{h}(config-{tag}-nacl)#"
        return f"{h}#"

    # --------------------------------------------------------------- execute
    def execute(self, line: str) -> str:
        # Cisco-style context help: any line containing '?' shows what may be
        # typed here, without executing anything (the buffer is preserved by
        # the console UI). Handle before stripping so 'ip address ?' works.
        if "?" in line:
            help_text = clihelp.context_help(self.mode, self.device, line)
            if help_text is not None:
                return help_text
        line = line.strip()
        if not line:
            return ""
        parts = line.split()
        head = parts[0].lower()

        _config_modes = (CONFIG, CONFIG_IF, CONFIG_DHCP, CONFIG_ROUTER, CONFIG_ACL)
        # universal navigation
        if head in ("exit", "quit"):
            return self._exit()
        if head == "end":
            self.mode = PRIV if self.mode in _config_modes else self.mode
            self.iface = None
            self.pool = None
            self.acl_name = None
            return ""
        if head == "help":
            return ("Context help: type '?' on its own to list commands, or "
                    "'<command> ?' to see the next option (e.g. 'ip address ?').")

        try:
            if self.mode == USER:
                return self._user(parts)
            if self.mode == PRIV:
                return self._priv(parts)
            if self.mode == CONFIG:
                return self._config(parts)
            if self.mode == CONFIG_IF:
                return self._config_if(parts)
            if self.mode == CONFIG_DHCP:
                return self._config_dhcp(parts)
            if self.mode == CONFIG_ROUTER:
                return self._config_router(parts)
            if self.mode == CONFIG_ACL:
                return self._config_acl(parts)
        except ValueError as exc:
            return f"% {exc}"
        return "% Invalid input - type ? for a list of commands"

    # ----------------------------------------------------------------- modes
    def _exit(self) -> str:
        if self.mode in (CONFIG_IF, CONFIG_DHCP, CONFIG_ROUTER, CONFIG_ACL):
            self.mode = CONFIG
            self.iface = None
            self.pool = None
            self.acl_name = None
        elif self.mode == CONFIG:
            self.mode = PRIV
        elif self.mode == PRIV:
            self.mode = USER
        return ""

    def _user(self, parts):
        cmd = _match(parts[0], "enable", "ping", "traceroute", "show", "exit")
        if cmd == "enable":
            self.mode = PRIV
            return ""
        if cmd == "ping":
            return self._ping(parts)
        if cmd == "traceroute":
            return self._traceroute(parts)
        if cmd == "show":
            return self._show(parts)
        return "% Invalid input - type ? for a list of commands"

    def _priv(self, parts):
        cmd = _match(parts[0], "configure", "ping", "traceroute", "show", "disable",
                     "write", "reload", "clear")
        if cmd == "configure":
            self.mode = CONFIG
            return "Enter configuration commands, one per line. End with CNTL/Z."
        if cmd == "disable":
            self.mode = USER
            return ""
        if cmd == "ping":
            return self._ping(parts)
        if cmd == "traceroute":
            return self._traceroute(parts)
        if cmd == "clear":
            return self._clear(parts)
        if cmd == "show":
            return self._show(parts)
        if cmd == "write":
            return "Building configuration...\n[OK]"
        return "% Invalid input - type ? for a list of commands"

    def _config(self, parts):
        cmd = _match(parts[0], "hostname", "interface", "ip", "ipv6", "no",
                     "spanning-tree", "vlan", "router", "access-list",
                     "aaa", "username", "zone-pair", "zone", "crypto", "dot1x")
        if cmd in ("aaa", "username", "zone-pair", "zone", "crypto", "dot1x"):
            return self._config_security(parts)
        if cmd == "ipv6":
            return self._config_ipv6(parts)
        if cmd == "access-list":
            return self._numbered_acl(parts)
        if cmd == "spanning-tree":
            return self._spanning_tree(parts)
        if cmd == "vlan":
            if not isinstance(self.device, Switch):
                raise ValueError("vlan database only valid on a switch")
            if len(parts) < 2 or not parts[1].isdigit():
                raise ValueError("Incomplete command")
            self.device.vlans.setdefault(int(parts[1]), f"VLAN{int(parts[1]):04d}")
            return ""
        if cmd == "router":
            return self._router_proto(parts)
        if cmd == "hostname":
            if len(parts) < 2:
                raise ValueError("Incomplete command")
            self.device.hostname = parts[1]
            return ""
        if cmd == "interface":
            if len(parts) < 2:
                raise ValueError("Incomplete command")
            name = " ".join(parts[1:])
            iface = self.device.get_interface(name)
            if iface is None:
                raise ValueError(f"Invalid interface {name}")
            self.iface = iface
            self.mode = CONFIG_IF
            return ""
        if cmd == "ip":
            return self._config_ip(parts)
        if cmd == "no":
            return self._config_no(parts)
        return "% Invalid input - type ? for a list of commands"

    def _config_ip(self, parts):
        if len(parts) >= 3 and _match(parts[1], "default-gateway") == "default-gateway":
            self.device.gateway = parts[2]
            return ""
        if len(parts) >= 5 and _match(parts[1], "route") == "route":
            if not isinstance(self.device, Router):
                raise ValueError("ip route only valid on a router")
            network, mask, next_hop = parts[2], parts[3], parts[4]
            prefix = ipaddress.IPv4Network(f"0.0.0.0/{mask}").prefixlen if "." in mask else int(mask)
            self.device.static_routes.append((network, prefix, next_hop))
            return ""
        # ip dhcp snooping [vlan <id>]  (switch global) — checked before pool
        if (len(parts) >= 3 and _match(parts[1], "dhcp") == "dhcp"
                and _match(parts[2], "snooping") == "snooping"):
            return self._ip_dhcp_snooping(parts)
        if len(parts) >= 3 and _match(parts[1], "dhcp") == "dhcp":
            return self._ip_dhcp(parts)
        # ip arp inspection vlan <id>  (switch global)
        if (len(parts) >= 4 and _match(parts[1], "arp") == "arp"
                and _match(parts[2], "inspection") == "inspection"):
            if not isinstance(self.device, Switch):
                raise ValueError("ip arp inspection only valid on a switch")
            if _match(parts[3], "vlan") == "vlan" and len(parts) >= 5:
                self.device.dai = True
                for v in _expand_vlan_list(parts[4]):
                    self.device.dai_vlans.add(v)
                return ""
            raise ValueError("Incomplete command")
        # ip ips signature <id> <icmp|udp|ip> [type <n>|port <n>] <alert|drop> [name <NAME>]
        if len(parts) >= 2 and _match(parts[1], "ips") == "ips":
            return self._ip_ips(parts)
        if len(parts) >= 2 and _match(parts[1], "access-list") == "access-list":
            return self._named_acl_header(parts)
        if len(parts) >= 2 and _match(parts[1], "nat") == "nat":
            return self._ip_nat(parts)
        raise ValueError("Incomplete command")

    def _ip_ips(self, parts):
        if not isinstance(self.device, Router):
            raise ValueError("ip ips only valid on a router")
        if len(parts) < 5 or _match(parts[2], "signature") != "signature":
            raise ValueError("ip ips signature <id> <icmp|udp|ip> [type/port <n>] <alert|drop> [name <n>]")
        sig = {"id": parts[3], "proto": _match(parts[4], "icmp", "udp", "tcp", "ip"), "action": "alert"}
        if sig["proto"] is None:
            raise ValueError("signature proto must be icmp|udp|tcp|ip")
        rest = parts[5:]
        i = 0
        while i < len(rest):
            tok = _match(rest[i], "type", "port", "alert", "drop", "name")
            if tok == "type" and i + 1 < len(rest):
                sig["icmp_type"] = int(rest[i + 1])
                i += 2
            elif tok == "port" and i + 1 < len(rest):
                sig["port"] = int(rest[i + 1])
                i += 2
            elif tok in ("alert", "drop"):
                sig["action"] = tok
                i += 1
            elif tok == "name" and i + 1 < len(rest):
                sig["name"] = rest[i + 1]
                i += 2
            else:
                i += 1
        self.device.ips_signatures.append(sig)
        return ""

    def _config_security(self, parts):
        cmd = _match(parts[0], "aaa", "username", "zone-pair", "zone", "crypto", "dot1x")
        if cmd == "aaa":
            if isinstance(self.device, Router):
                self.device.aaa_enabled = True
            return ""  # aaa new-model / authentication lists accepted
        if cmd == "username" and len(parts) >= 4 and _match(parts[2], "password", "secret"):
            if isinstance(self.device, (Router, Switch)):
                self.device.aaa_users[parts[1]] = parts[3]
            return ""
        if cmd == "dot1x":
            if (isinstance(self.device, Switch) and len(parts) >= 2
                    and _match(parts[1], "system-auth-control") == "system-auth-control"):
                self.device.dot1x_system = True
            return ""
        if cmd == "zone":
            return ""  # zone security <name>: zones are applied on interfaces
        if cmd == "zone-pair":
            self._require_router("zone-pair")
            toks = parts[1:]
            if toks and _match(toks[0], "security") == "security":
                toks = toks[1:]
            if len(toks) >= 3:
                action = _match(toks[2], "permit", "inspect", "deny")
                if action is None:
                    raise ValueError("zone-pair action must be permit|inspect|deny")
                self.device.zone_pairs[(toks[0], toks[1])] = action
                return ""
            raise ValueError("zone-pair security <src> <dst> <permit|inspect|deny>")
        if cmd == "crypto":
            self._require_router("crypto")
            toks = parts[1:]
            if toks and _match(toks[0], "tunnel") == "tunnel" and len(toks) >= 4:
                ln, lp = _split_v4_prefix(toks[2])
                rn, rp = _split_v4_prefix(toks[3])
                self.device.crypto_tunnels.append({
                    "peer": toks[1], "local_net": ln, "local_prefix": lp,
                    "remote_net": rn, "remote_prefix": rp,
                })
                return ""
            raise ValueError("crypto tunnel <peer> <local/len> <remote/len>")
        return ""

    def _ip_dhcp_snooping(self, parts):
        if not isinstance(self.device, Switch):
            raise ValueError("ip dhcp snooping only valid on a switch")
        self.device.dhcp_snooping = True
        if len(parts) >= 5 and _match(parts[3], "vlan") == "vlan":
            for v in _expand_vlan_list(parts[4]):
                self.device.dhcp_snoop_vlans.add(v)
        return ""

    def _config_ipv6(self, parts):
        # ipv6 unicast-routing (enable v6 forwarding) - accepted, no state needed
        if len(parts) >= 2 and _match(parts[1], "unicast-routing") == "unicast-routing":
            return ""
        # ipv6 route <prefix>/<len> <next-hop>
        if len(parts) >= 4 and _match(parts[1], "route") == "route":
            if not isinstance(self.device, Router):
                raise ValueError("ipv6 route only valid on a router")
            net, prefix = _split_v6_prefix(parts[2])
            self.device.static_routes6.append((net, prefix, parts[3]))
            return ""
        # ipv6 default-gateway <addr> (host)
        if len(parts) >= 3 and _match(parts[1], "default-gateway") == "default-gateway":
            if not isinstance(self.device, Host):
                raise ValueError("ipv6 default-gateway only valid on a host")
            self.device.gateway6 = parts[2]
            return ""
        raise ValueError("Incomplete command")

    # -------------------------------------------------------------- ACL (cfg)
    def _require_router(self, feature: str) -> "Router":
        if not isinstance(self.device, Router):
            raise ValueError(f"{feature} only valid on a router")
        return self.device

    def _require_switch_iface(self, feature: str):
        if not isinstance(self.device, Switch):
            raise ValueError(f"{feature} only valid on a switch")
        if self.iface is None:
            raise ValueError("not in interface configuration mode")

    def _numbered_acl(self, parts):
        """access-list <n> {permit|deny} ... (standard 1-99/1300-1999, ext 100-199/2000-2699)."""
        self._require_router("access-list")
        if len(parts) < 4 or not parts[1].isdigit():
            raise ValueError("Incomplete command")
        num = int(parts[1])
        kind = "extended" if (100 <= num <= 199 or 2000 <= num <= 2699) else "standard"
        action = _match(parts[2], "permit", "deny")
        if action not in ("permit", "deny"):
            raise ValueError("expected permit or deny")
        acl = self.device.acls.setdefault(parts[1], {"kind": kind, "entries": []})
        entry = self._build_acl_entry(kind, action, parts[3:])
        acl["entries"].append(entry)
        return ""

    def _named_acl_header(self, parts):
        """ip access-list standard|extended NAME -> enter config-acl."""
        self._require_router("ip access-list")
        kind = _match(parts[2], "standard", "extended") if len(parts) >= 3 else None
        if kind not in ("standard", "extended") or len(parts) < 4:
            raise ValueError("Incomplete command")
        name = parts[3]
        self.device.acls.setdefault(name, {"kind": kind, "entries": []})
        self.acl_name = name
        self.mode = CONFIG_ACL
        return ""

    def _config_acl(self, parts):
        action = _match(parts[0], "permit", "deny")
        if action not in ("permit", "deny"):
            raise ValueError("expected permit or deny")
        acl = self.device.acls[self.acl_name]
        entry = self._build_acl_entry(acl["kind"], action, parts[1:])
        acl["entries"].append(entry)
        return ""

    def _build_acl_entry(self, kind: str, action: str, toks: list) -> AclEntry:
        if kind == "standard":
            src, wild, _rest = _parse_addr_spec(toks)
            return AclEntry(action=action, proto="_std", src=src, src_wild=wild)
        if not toks:
            raise ValueError("Incomplete command")
        proto = _match(toks[0], "ip", "icmp", "tcp", "udp") or toks[0]
        src, swild, rest = _parse_addr_spec(toks[1:])
        dst, dwild, rest = _parse_addr_spec(rest)
        port_op, port = None, None
        if rest and _match(rest[0], "eq") == "eq" and len(rest) >= 2:
            port_op, port = "eq", int(rest[1])
        return AclEntry(action=action, proto=proto, src=src, src_wild=swild,
                        dst=dst, dst_wild=dwild, dst_port_op=port_op, dst_port=port)

    # -------------------------------------------------------------- NAT (cfg)
    def _ip_nat(self, parts):
        rt = self._require_router("ip nat")
        sub = _match(parts[2], "inside", "outside", "pool") if len(parts) >= 3 else None
        if sub == "pool":
            return self._ip_nat_pool(parts)
        if sub != "inside" or len(parts) < 5 or _match(parts[3], "source") != "source":
            raise ValueError("Incomplete command")
        kind = _match(parts[4], "static", "list")
        if kind == "static" and len(parts) >= 7:
            rt.nat_static.append((parts[5], parts[6]))
            return ""
        if kind == "list" and len(parts) >= 6:
            acl = parts[5]
            rule = {"acl": acl, "pool": None, "interface": None, "overload": False}
            i = 6
            while i < len(parts):
                tok = _match(parts[i], "pool", "interface", "overload")
                if tok == "pool" and i + 1 < len(parts):
                    rule["pool"] = parts[i + 1]
                    i += 2
                elif tok == "interface" and i + 1 < len(parts):
                    rule["interface"] = parts[i + 1]
                    i += 2
                elif tok == "overload":
                    rule["overload"] = True
                    i += 1
                else:
                    i += 1
            rt.nat_dynamic.append(rule)
            return ""
        raise ValueError("Incomplete command")

    def _ip_nat_pool(self, parts):
        rt = self.device
        if len(parts) < 6:
            raise ValueError("Incomplete command")
        name, start, end = parts[3], parts[4], parts[5]
        prefix = 24
        if len(parts) >= 8:
            kw = _match(parts[6], "netmask", "prefix-length")
            if kw == "netmask":
                prefix = ipaddress.IPv4Network(f"0.0.0.0/{parts[7]}").prefixlen
            elif kw == "prefix-length":
                prefix = int(parts[7])
        rt.nat_pools[name] = {"start": start, "end": end, "prefix": prefix}
        return ""

    def _ip_dhcp(self, parts):
        if not isinstance(self.device, Router):
            raise ValueError("DHCP server only valid on a router")
        sub = _match(parts[2], "pool", "excluded-address")
        if sub == "pool" and len(parts) >= 4:
            name = parts[3]
            pool = self.device.dhcp_pools.get(name) or DhcpPool(name=name)
            self.device.dhcp_pools[name] = pool
            self.pool = pool
            self.mode = CONFIG_DHCP
            return ""
        if sub == "excluded-address" and len(parts) >= 4:
            lo = ipaddress.ip_address(parts[3])
            hi = ipaddress.ip_address(parts[4]) if len(parts) >= 5 else lo
            for n in range(int(lo), int(hi) + 1):
                self.device.dhcp_excluded.add(str(ipaddress.ip_address(n)))
            return ""
        raise ValueError("Incomplete command")

    def _config_dhcp(self, parts):
        cmd = _match(parts[0], "network", "default-router", "dns-server")
        if cmd == "network" and len(parts) >= 3:
            self.pool.network = parts[1]
            self.pool.prefix = (
                ipaddress.IPv4Network(f"0.0.0.0/{parts[2]}").prefixlen if "." in parts[2] else int(parts[2])
            )
            return ""
        if cmd == "default-router" and len(parts) >= 2:
            self.pool.gateway = parts[1]
            return ""
        if cmd == "dns-server" and len(parts) >= 2:
            self.pool.dns = parts[1]
            return ""
        raise ValueError("Incomplete command")

    def _router_proto(self, parts):
        if not isinstance(self.device, Router):
            raise ValueError("routing protocols only valid on a router")
        proto = _match(parts[1], "ospf", "bgp", "eigrp", "rip")
        if proto == "rip":
            self.device.rip_enabled = True
            self.router_proto = "rip"
            self.mode = CONFIG_ROUTER
            return ""
        if len(parts) < 3:
            raise ValueError("Incomplete command")
        if proto == "ospf":
            self.device.ospf_pid = int(parts[2])
            self.router_proto = "ospf"
        elif proto == "bgp":
            self.device.bgp_asn = int(parts[2])
            self.router_proto = "bgp"
        elif proto == "eigrp":
            self.device.eigrp_asn = int(parts[2])
            self.router_proto = "eigrp"
        else:
            raise ValueError("only router ospf|bgp|eigrp <id> or router rip is supported")
        self.mode = CONFIG_ROUTER
        return ""

    def _config_router(self, parts):
        if self.router_proto == "bgp":
            return self._config_router_bgp(parts)
        if self.router_proto in ("eigrp", "rip"):
            return self._config_router_igp(parts)
        cmd = _match(parts[0], "network", "no")
        if cmd == "network" and len(parts) >= 5 and _match(parts[3], "area") == "area":
            net, wildcard, area = parts[1], parts[2], int(parts[4])
            # convert wildcard mask (e.g. 0.0.0.255) to a prefix length
            inv = int(ipaddress.ip_address(wildcard))
            prefix = 32 - bin(inv).count("1")
            self.device.ospf_networks.append((net, prefix, area))
            return ""
        raise ValueError("Incomplete command")

    def _config_router_igp(self, parts):
        """EIGRP/RIP router-config: network, redistribute, and accepted no-ops."""
        target = self.router_proto  # "eigrp" | "rip"
        cmd = _match(parts[0], "network", "redistribute", "version", "no",
                     "auto-summary", "passive-interface", "default-metric")
        if cmd == "network" and len(parts) >= 2:
            net = parts[1]
            if len(parts) >= 3 and "." in parts[2]:  # EIGRP wildcard mask
                inv = int(ipaddress.ip_address(parts[2]))
                prefix = 32 - bin(inv).count("1")
            else:
                prefix = _classful_prefix(net)
            if target == "eigrp":
                self.device.eigrp_networks.append((net, prefix))
            else:
                self.device.rip_networks.append((net, prefix))
            return ""
        if cmd == "redistribute" and len(parts) >= 2:
            src = _match(parts[1], "connected", "static", "ospf", "bgp", "eigrp", "rip")
            if src is None:
                raise ValueError("unsupported redistribute source")
            self.device.redistribute.setdefault(target, set()).add(src)
            return ""
        if cmd in ("version", "auto-summary", "passive-interface", "default-metric", "no"):
            return ""  # accepted, no behavioural effect in this model
        raise ValueError("Incomplete command")

    def _config_router_bgp(self, parts):
        cmd = _match(parts[0], "neighbor", "network", "no")
        if cmd == "neighbor" and len(parts) >= 4 and _match(parts[2], "remote-as") == "remote-as":
            self.device.bgp_neighbors.append({"ip": parts[1], "remote_as": int(parts[3])})
            return ""
        if cmd == "network" and len(parts) >= 2:
            net = parts[1]
            if len(parts) >= 4 and _match(parts[2], "mask") == "mask":
                prefix = ipaddress.IPv4Network(f"0.0.0.0/{parts[3]}").prefixlen if "." in parts[3] else int(parts[3])
            else:
                # classful default when no mask given
                prefix = ipaddress.IPv4Network(f"{net}/24", strict=False).prefixlen
            self.device.bgp_networks.append((net, prefix))
            return ""
        raise ValueError("Incomplete command")

    def _config_no(self, parts):
        if len(parts) >= 2 and _match(parts[1], "hostname") == "hostname":
            self.device.hostname = self.device.name
            return ""
        return "% Invalid input - type ? for a list of commands"

    def _spanning_tree(self, parts):
        if not isinstance(self.device, Switch):
            raise ValueError("spanning-tree only valid on a switch")
        # spanning-tree mode pvst|rapid-pvst
        if len(parts) >= 3 and _match(parts[1], "mode") == "mode":
            mode = _match(parts[2], "pvst", "rapid-pvst", "mst")
            self.device.stp_mode = "rapid-pvst" if mode == "rapid-pvst" else "pvst"
            return ""
        # spanning-tree vlan <id> priority <n>  /  spanning-tree priority <n>
        toks = parts[1:]
        if toks and _match(toks[0], "vlan") == "vlan":
            toks = toks[2:] if len(toks) >= 2 else []
        if len(toks) >= 2 and _match(toks[0], "priority") == "priority":
            prio = int(toks[1])
            if prio % 4096 != 0:
                raise ValueError("Bridge priority must be a multiple of 4096")
            self.device.bridge_priority = prio
            return ""
        raise ValueError("Incomplete command")

    def _fhrp(self, parts, proto):
        """standby|vrrp <group> {ip <vip> | priority <n> | preempt}."""
        self._require_router("standby/vrrp")
        if self.iface is None:
            raise ValueError("not in interface configuration mode")
        if len(parts) < 3 or not parts[1].isdigit():
            raise ValueError("Incomplete command")
        group = int(parts[1])
        cfg = self.iface.hsrp.setdefault(group, {"vip": None, "priority": 100, "preempt": False, "proto": proto})
        cfg["proto"] = proto
        sub = _match(parts[2], "ip", "priority", "preempt")
        if sub == "ip" and len(parts) >= 4:
            cfg["vip"] = parts[3]
        elif sub == "priority" and len(parts) >= 4:
            cfg["priority"] = int(parts[3])
        elif sub == "preempt":
            cfg["preempt"] = True
        else:
            raise ValueError("Incomplete command")
        return ""

    def _channel_group(self, parts):
        """channel-group <n> [mode active|passive|on|desirable|auto]."""
        if self.iface is None:
            raise ValueError("not in interface configuration mode")
        if len(parts) < 2 or not parts[1].isdigit():
            raise ValueError("Incomplete command")
        self.iface.channel_group = int(parts[1])
        mode = "on"
        if len(parts) >= 4 and _match(parts[2], "mode") == "mode":
            mode = _match(parts[3], "active", "passive", "on", "desirable", "auto") or parts[3]
        self.iface.channel_mode = mode
        return ""

    def _config_if(self, parts):
        cmd = _match(parts[0], "ip", "ipv6", "no", "shutdown", "switchport",
                     "standby", "vrrp", "channel-group",
                     "zone-member", "dot1x", "authentication")
        if cmd == "zone-member":
            self._require_router("zone-member")
            # zone-member security <zone>
            if len(parts) >= 3 and _match(parts[1], "security") == "security":
                self.iface.zone = parts[2]
                return ""
            raise ValueError("zone-member security <zone>")
        if cmd == "dot1x":
            # dot1x pae authenticator / dot1x port-control auto
            self._require_switch_iface("dot1x")
            if len(parts) >= 2 and _match(parts[1], "port-control") == "port-control":
                self.iface.dot1x = True
            elif len(parts) >= 3 and _match(parts[1], "pae") == "pae":
                self.iface.dot1x = True
            else:
                self.iface.dot1x = True
            return ""
        if cmd == "authentication":
            # authentication port-control auto
            self._require_switch_iface("authentication")
            if len(parts) >= 3 and _match(parts[1], "port-control") == "port-control":
                self.iface.dot1x = True
                return ""
            return ""
        if cmd == "ipv6" and len(parts) >= 3 and _match(parts[1], "address") == "address":
            addr, plen = _split_v6_prefix(parts[2])
            self.iface.set_ipv6(addr, plen)
            return ""
        if cmd in ("standby", "vrrp"):
            return self._fhrp(parts, "vrrp" if cmd == "vrrp" else "hsrp")
        if cmd == "channel-group":
            return self._channel_group(parts)
        if cmd == "ip" and len(parts) >= 3 and _match(parts[1], "address") == "address":
            if parts[2].lower() == "dhcp":
                return self._ip_address_dhcp()
            if len(parts) >= 4:
                self.iface.set_ip(parts[2], parts[3])
                return ""
            raise ValueError("Incomplete command")
        if cmd == "ip" and len(parts) >= 3 and _match(parts[1], "helper-address") == "helper-address":
            if not isinstance(self.device, Router):
                raise ValueError("ip helper-address only valid on a router")
            self.device.helper_addresses[self.iface.name] = parts[2]
            return ""
        if cmd == "ip" and len(parts) >= 4 and _match(parts[1], "access-group") == "access-group":
            direction = _match(parts[3], "in", "out")
            if direction == "in":
                self.iface.acl_in = parts[2]
            elif direction == "out":
                self.iface.acl_out = parts[2]
            else:
                raise ValueError("expected in or out")
            return ""
        if (cmd == "ip" and len(parts) >= 4 and _match(parts[1], "dhcp") == "dhcp"
                and _match(parts[2], "snooping") == "snooping"
                and _match(parts[3], "trust") == "trust"):
            self.iface.dhcp_snoop_trust = True
            return ""
        if (cmd == "ip" and len(parts) >= 4 and _match(parts[1], "arp") == "arp"
                and _match(parts[2], "inspection") == "inspection"
                and _match(parts[3], "trust") == "trust"):
            self.iface.dhcp_snoop_trust = True  # DAI shares the snooping trust state
            return ""
        if (cmd == "ip" and len(parts) >= 3 and _match(parts[1], "verify") == "verify"
                and _match(parts[2], "source") == "source"):
            self.iface.ip_source_guard = True
            return ""
        if cmd == "ip" and len(parts) >= 3 and _match(parts[1], "nat") == "nat":
            if not isinstance(self.device, Router):
                raise ValueError("ip nat only valid on a router")
            role = _match(parts[2], "inside", "outside")
            if role not in ("inside", "outside"):
                raise ValueError("expected inside or outside")
            self.iface.nat_role = role
            return ""
        if cmd == "shutdown":
            self.iface.enabled = False
            return ""
        if cmd == "no" and len(parts) >= 2:
            sub = _match(parts[1], "shutdown", "ip")
            if sub == "shutdown":
                self.iface.enabled = True
                return ""
            if sub == "ip" and len(parts) >= 3 and _match(parts[2], "address") == "address":
                self.iface.ip = None
                self.iface.prefix = None
                return ""
        if cmd == "switchport":
            return self._switchport(parts)
        return "% Invalid input - type ? for a list of commands"

    def _switchport(self, parts):
        if not isinstance(self.device, Switch):
            raise ValueError("switchport only valid on a switch")
        if len(parts) >= 4 and _match(parts[1], "access") == "access" and _match(parts[2], "vlan") == "vlan":
            self.iface.vlan = int(parts[3])
            return ""
        if len(parts) >= 3 and _match(parts[1], "mode") == "mode":
            self.iface.mode = _match(parts[2], "access", "trunk") or parts[2]
            return ""
        if (len(parts) >= 5 and _match(parts[1], "trunk") == "trunk"
                and _match(parts[2], "native") == "native" and _match(parts[3], "vlan") == "vlan"):
            self.iface.vlan = int(parts[4])  # native vlan stored in iface.vlan for trunks
            return ""
        if _match(parts[1], "port-security") == "port-security":
            return self._port_security(parts)
        raise ValueError("Incomplete command")

    def _port_security(self, parts):
        """switchport port-security [maximum N | violation MODE |
        mac-address sticky | mac-address <mac>]."""
        i = self.iface
        if len(parts) == 2:  # bare 'switchport port-security' enables it
            i.port_security = True
            return ""
        sub = _match(parts[2], "maximum", "violation", "mac-address")
        if sub == "maximum" and len(parts) >= 4:
            i.port_security_max = int(parts[3])
        elif sub == "violation" and len(parts) >= 4:
            mode = _match(parts[3], "shutdown", "restrict", "protect")
            if mode is None:
                raise ValueError("violation must be shutdown|restrict|protect")
            i.port_security_violation = mode
        elif sub == "mac-address" and len(parts) >= 4:
            if _match(parts[3], "sticky") == "sticky":
                i.port_security_sticky = True
            else:
                i.port_security_macs.add(parts[3].upper())
        else:
            raise ValueError("Incomplete command")
        i.port_security = True
        return ""

    def _ip_address_dhcp(self):
        if not isinstance(self.device, Host):
            raise ValueError("ip address dhcp is only supported on hosts")
        self.device.dhcp_enabled = True
        self.iface.enabled = True
        lease = self.network.dhcp_request(self.device.name)
        if not lease:
            return "% DHCP: no offer received"
        return f"DHCP: assigned {lease['ip']}/{lease['prefix']}" + (
            f", gateway {lease['gateway']}" if lease.get("gateway") else "")

    # ------------------------------------------------------------------ ping
    def _ping(self, parts):
        if len(parts) < 2:
            raise ValueError("Incomplete command")
        if not isinstance(self.device, Host):
            return "% ping is only supported from hosts in this simulator"
        if ":" in parts[1]:  # IPv6 target
            res = self.network.ping6(self.device.name, parts[1], count=4)
            if not res["ok"]:
                return f"% {res['error']}"
            dots = "!!!!" if res["received"] == res["sent"] else "." * res["sent"]
            return (
                f"Pinging {parts[1]} with 4 packets:\n{dots}\n"
                f"Success rate is {100 - res['loss_pct']:.0f} percent "
                f"({res['received']}/{res['sent']})"
            )
        res = self.network.ping(self.device.name, parts[1], count=4)
        if not res["ok"]:
            return f"% {res['error']}"
        dots = "".join("!" if r["reply"] else "." for r in res["results"])
        return (
            f"Pinging {parts[1]} with 4 packets:\n{dots}\n"
            f"Success rate is {100 - res['loss_pct']:.0f} percent "
            f"({res['received']}/{res['sent']})"
        )

    # ------------------------------------------------------------ traceroute
    def _traceroute(self, parts):
        if len(parts) < 2:
            raise ValueError("Incomplete command")
        if not isinstance(self.device, Host):
            return "% traceroute is only supported from hosts in this simulator"
        res = self.network.traceroute(self.device.name, parts[1])
        if not res["ok"]:
            return f"% {res['error']}"
        rows = [f"Tracing the route to {parts[1]}", ""]
        for hop in res["hops"]:
            target = hop["hop"] if hop["hop"] else "* * *  Request timed out"
            rows.append(f"  {hop['ttl']:<3} {target}")
        if not res["reached"]:
            rows.append("  (destination not reached)")
        return "\n".join(rows)

    def _clear(self, parts):
        if (len(parts) >= 4 and _match(parts[1], "ip") == "ip"
                and _match(parts[2], "nat") == "nat"):
            if isinstance(self.device, Router):
                self.device.nat_table = []
                self.device.nat_pat_reverse = {}
                self.device.nat_pool_map = {}
            return ""
        return ""

    # ------------------------------------------------------------------ show
    def _show(self, parts):
        if len(parts) < 2:
            raise ValueError("Incomplete command")
        what = parts[1].lower()
        if what == "ipv6" and len(parts) >= 3 and parts[2].startswith("route"):
            return self._show_ipv6_route()
        if what == "ipv6" and len(parts) >= 3 and parts[2].startswith("int"):
            return self._show_ipv6_int_brief()
        if what.startswith("ip") and len(parts) >= 3 and parts[2].startswith("int"):
            return self._show_ip_int_brief()
        if what.startswith("ip") and len(parts) >= 3 and parts[2].startswith("route"):
            return self._show_ip_route()
        if what.startswith("ip") and len(parts) >= 4 and parts[2].startswith("eigrp") and parts[3].startswith("nei"):
            return self._show_ip_eigrp_neighbors()
        if what.startswith("ip") and len(parts) >= 4 and parts[2].startswith("ospf") and parts[3].startswith("nei"):
            return self._show_ip_ospf_neighbor()
        if what.startswith("ip") and len(parts) >= 4 and parts[2].startswith("dhcp") and parts[3].startswith("bind"):
            return self._show_ip_dhcp_binding()
        if what.startswith("ip") and len(parts) >= 4 and parts[2].startswith("nat") and parts[3].startswith("trans"):
            return self._show_ip_nat_translations()
        if (what.startswith("ip") and len(parts) >= 5 and parts[2].startswith("dhcp")
                and parts[3].startswith("snoop") and parts[4].startswith("bind")):
            return self._show_ip_dhcp_snooping_binding()
        if what.startswith("ip") and len(parts) >= 4 and parts[2].startswith("dhcp") and parts[3].startswith("snoop"):
            return self._show_ip_dhcp_snooping()
        if what.startswith("ip") and len(parts) >= 4 and parts[2].startswith("arp") and parts[3].startswith("insp"):
            return self._show_ip_arp_inspection()
        if what.startswith("ip") and len(parts) >= 4 and parts[2].startswith("verify") and parts[3].startswith("source"):
            return self._show_ip_verify_source()
        if what.startswith("ip") and len(parts) >= 3 and parts[2].startswith("ips"):
            return self._show_ip_ips()
        if what.startswith("port-security"):
            return self._show_port_security()
        if what.startswith("crypto"):
            return self._show_crypto_session()
        if what.startswith("zone-pair"):
            return self._show_zone_pair()
        if (what.startswith("auth") or what.startswith("dot1x")):
            return self._show_authentication_sessions()
        if what.startswith("ip") and len(parts) >= 3 and parts[2].startswith("access"):
            return self._show_ip_access_lists()
        if what.startswith("ip") and len(parts) >= 3 and parts[2].startswith("bgp"):
            if len(parts) >= 4 and parts[3].startswith("sum"):
                return self._show_ip_bgp_summary()
            return self._show_ip_bgp()
        if what.startswith("access-list"):
            return self._show_ip_access_lists()
        if what.startswith("standby"):
            return self._show_standby()
        if what.startswith("ether"):
            return self._show_etherchannel()
        if what.startswith("cdp") and len(parts) >= 3 and parts[2].startswith("nei"):
            return self._show_cdp_neighbors(detail="detail" in [p.lower() for p in parts[3:]])
        if what.startswith("lldp") and len(parts) >= 3 and parts[2].startswith("nei"):
            return self._show_lldp_neighbors()
        if what.startswith("span"):
            return self._show_spanning_tree()
        if what.startswith("vlan"):
            return self._show_vlan()
        if what.startswith("mac"):
            return self._show_mac_table()
        if what.startswith("arp"):
            return self._show_arp()
        if what.startswith("run"):
            return self._show_run()
        if what.startswith("ver"):
            return f"NetSim IOS (simulated)\n{self.device.hostname} uptime is 0 minutes"
        return "% Invalid input - type show ? for a list of options"

    def _show_ip_int_brief(self):
        rows = ["Interface              IP-Address      Status    Protocol"]
        for i in self.device.interfaces.values():
            ip = i.ip or "unassigned"
            status = "up" if i.enabled else "administratively down"
            proto = "up" if i.is_up else "down"
            rows.append(f"{i.name:<22} {ip:<15} {status:<9} {proto}")
        return "\n".join(rows)

    def _show_ip_route(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        self.network.compute_ospf()
        bgp_mod.compute(self.network)
        igp_mod.compute(self.network)
        rows = ["Codes: C - connected, S - static, O - OSPF, D - EIGRP, "
                "R - RIP, B - BGP", ""]
        body = []
        for i in self.device.interfaces.values():
            if i.is_up and i.network:
                body.append(f"C    {i.network} is directly connected, {i.name}")
        for net, prefix, nh in self.device.static_routes:
            body.append(f"S    {net}/{prefix} [1/0] via {nh}")
        for net, prefix, nh, cost in self.device.ospf_routes:
            body.append(f"O    {net}/{prefix} [110/{cost}] via {nh}")
        for net, prefix, nh, metric in self.device.eigrp_routes:
            body.append(f"D    {net}/{prefix} [90/{metric}] via {nh}")
        for net, prefix, nh, hops in self.device.rip_routes:
            body.append(f"R    {net}/{prefix} [120/{hops}] via {nh}")
        for net, prefix, nh, _as_path in self.device.bgp_routes:
            body.append(f"B    {net}/{prefix} [20/0] via {nh}")
        if not body:
            return "% No routes"
        return "\n".join(rows + body)

    def _show_ipv6_route(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        rows = ["IPv6 Routing Table", ""]
        body = []
        for i in self.device.interfaces.values():
            if i.is_up and i.network6:
                body.append(f"C   {i.network6} [0/0] via {i.name}, directly connected")
        for net, prefix, nh in self.device.static_routes6:
            body.append(f"S   {net}/{prefix} [1/0] via {nh}")
        if not body:
            return "% No IPv6 routes"
        return "\n".join(rows + body)

    def _show_ipv6_int_brief(self):
        rows = ["Interface              IPv6-Address                  Status"]
        for i in self.device.interfaces.values():
            addr = f"{i.ipv6}/{i.ipv6_prefix}" if i.ipv6 else "unassigned"
            status = "up" if i.is_up else ("down" if i.enabled else "admin down")
            rows.append(f"{i.name:<22} {addr:<29} {status}")
        return "\n".join(rows)

    def _show_ip_eigrp_neighbors(self):
        if not isinstance(self.device, Router) or self.device.eigrp_asn is None:
            return "% EIGRP not running"
        igp_mod.compute(self.network)
        nbrs = self.network.eigrp_neighbors(self.device)
        if not nbrs:
            return "% No EIGRP neighbors"
        rows = [f"EIGRP-IPv4 Neighbors for AS({self.device.eigrp_asn})",
                "Address          Interface"]
        for n in nbrs:
            rows.append(f"{n['address']:<16} {n['interface']}")
        return "\n".join(rows)

    def _show_ip_ospf_neighbor(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        if self.device.ospf_pid is None:
            return "% OSPF not running"
        neighbors = self.network.ospf_neighbors(self.device)
        if not neighbors:
            return "% No OSPF neighbors"
        rows = ["Neighbor ID     Address          Interface"]
        for n in neighbors:
            rows.append(f"{n['neighbor']:<15} {n['address']:<16} {n['interface']}")
        return "\n".join(rows)

    def _show_ip_dhcp_binding(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        if not self.device.dhcp_leases:
            return "% No DHCP bindings"
        rows = ["IP address       Hardware address   Pool"]
        for lease in self.device.dhcp_leases:
            rows.append(f"{lease['ip']:<16} {lease['mac']:<18} {lease['pool']}")
        return "\n".join(rows)

    def _show_ip_access_lists(self):
        if not isinstance(self.device, Router) or not self.device.acls:
            return "% No access lists configured"
        rows = []
        for name, acl in self.device.acls.items():
            label = name if name.isdigit() else f"{acl['kind']} IP access list {name}"
            if name.isdigit():
                label = f"{'Standard' if acl['kind'] == 'standard' else 'Extended'} IP access list {name}"
            rows.append(label)
            for n, entry in enumerate(acl["entries"], start=10):
                rows.append(f"    {n} {entry.text()}")
        return "\n".join(rows)

    def _show_ip_nat_translations(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        if not self.device.nat_table:
            return "% No NAT translations"
        rows = ["Pro   Inside global        Inside local         Outside"]
        for t in self.device.nat_table:
            rows.append(f"{t['pro']:<5} {t['inside_global']:<20} {t['inside_local']:<20} {t['outside']}")
        return "\n".join(rows)

    # ------------------------------------------------------- Phase 10 security
    def _show_port_security(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        rows = ["Secure Port  MaxSecureAddr  CurrentAddr  Violation     Port Status"]
        any_secured = False
        for i in self.device.interfaces.values():
            if not i.port_security:
                continue
            any_secured = True
            status = "err-disabled" if i.err_disabled else "secure-up"
            rows.append(f"{i.name:<12} {i.port_security_max:<14} {len(i.port_security_macs):<12} "
                        f"{i.port_security_violation:<13} {status}")
        if not any_secured:
            return "% No interfaces with port security enabled"
        return "\n".join(rows)

    def _show_ip_dhcp_snooping(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        sw = self.device
        state = "enabled" if sw.dhcp_snooping else "disabled"
        vlans = ",".join(str(v) for v in sorted(sw.dhcp_snoop_vlans)) or "none"
        rows = [f"Switch DHCP snooping is {state}",
                f"DHCP snooping is configured on following VLANs: {vlans}",
                "Interface            Trusted",
                "-------------------- -------"]
        for i in sw.interfaces.values():
            rows.append(f"{i.name:<20} {'yes' if i.dhcp_snoop_trust else 'no'}")
        return "\n".join(rows)

    def _show_ip_dhcp_snooping_binding(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        b = self.device.dhcp_snoop_bindings
        if not b:
            return "% No DHCP snooping bindings"
        rows = ["MacAddress          IpAddress        VLAN   Interface"]
        for e in b:
            rows.append(f"{e['mac']:<19} {e['ip']:<16} {e['vlan']:<6} {e['interface']}")
        return "\n".join(rows)

    def _show_ip_arp_inspection(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        sw = self.device
        vlans = ",".join(str(v) for v in sorted(sw.dai_vlans)) or "none"
        rows = [f"Source Mac Validation: {'enabled' if sw.dai else 'disabled'}",
                f"Dynamic ARP Inspection enabled on VLANs: {vlans}",
                "Interface            Trust State"]
        for i in sw.interfaces.values():
            rows.append(f"{i.name:<20} {'Trusted' if i.dhcp_snoop_trust else 'Untrusted'}")
        return "\n".join(rows)

    def _show_ip_verify_source(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        rows = ["Interface            Filter-type  Filter-mode"]
        for i in self.device.interfaces.values():
            if i.ip_source_guard:
                rows.append(f"{i.name:<20} ip           active")
        if len(rows) == 1:
            return "% IP source guard not configured"
        return "\n".join(rows)

    def _show_ip_ips(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        rt = self.device
        rows = ["Signatures:"]
        for s in rt.ips_signatures:
            extra = ""
            if "icmp_type" in s:
                extra = f" type {s['icmp_type']}"
            elif "port" in s:
                extra = f" port {s['port']}"
            rows.append(f"  [{s['id']}] {s.get('name', '-')} proto={s['proto']}{extra} action={s['action']}")
        rows.append("Alerts:")
        if not rt.ips_alerts:
            rows.append("  (none)")
        for a in rt.ips_alerts:
            rows.append(f"  sig={a['sig']} {a['src']} -> {a['dst']} action={a['action']}")
        return "\n".join(rows)

    def _show_crypto_session(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        sessions = self.network.crypto_sessions(self.device)
        if not sessions:
            return "% No crypto sessions"
        rows = []
        for s in sessions:
            rows.append(f"Peer: {s['peer']}  Status: {s['status']}")
            rows.append(f"  IPSEC FLOW: {s['local']} -> {s['remote']}")
        return "\n".join(rows)

    def _show_zone_pair(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        if not self.device.zone_pairs:
            return "% No zone-pairs configured"
        rows = ["Zone-pair                  Policy"]
        for (src, dst), action in self.device.zone_pairs.items():
            rows.append(f"{src}->{dst:<20} {action}")
        return "\n".join(rows)

    def _show_authentication_sessions(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        rows = ["Interface            802.1X  Status"]
        any_dot1x = False
        for i in self.device.interfaces.values():
            if not i.dot1x:
                continue
            any_dot1x = True
            status = "Authorized" if i.dot1x_authorized else "Unauthorized"
            rows.append(f"{i.name:<20} enabled {status}")
        if not any_dot1x:
            return "% No interfaces running 802.1X"
        return "\n".join(rows)

    def _show_cdp_neighbors(self, detail: bool = False):
        neighbors = self.network.neighbors(self.device)
        if not neighbors:
            return "% No CDP neighbors"
        if detail:
            blocks = []
            for n in neighbors:
                blocks.append(
                    f"Device ID: {n['neighbor']}\n"
                    f"  Platform: {n['platform']},  Capabilities: {n['capability']}\n"
                    f"  Interface: {n['local_interface']},  Port ID (outgoing port): {n['neighbor_interface']}"
                )
            return "\n-------------------------\n".join(blocks)
        rows = [
            "Capability Codes: R - Router, S - Switch, H - Host",
            "",
            "Device ID        Local Intrfce      Capability  Port ID",
        ]
        for n in neighbors:
            rows.append(
                f"{n['neighbor']:<16} {n['local_interface']:<18} {n['capability']:<11} {n['neighbor_interface']}"
            )
        return "\n".join(rows)

    def _show_lldp_neighbors(self):
        neighbors = self.network.neighbors(self.device)
        if not neighbors:
            return "% No LLDP neighbors"
        rows = ["Device ID        Local Intf         Port ID"]
        for n in neighbors:
            rows.append(f"{n['neighbor']:<16} {n['local_interface']:<18} {n['neighbor_interface']}")
        return "\n".join(rows)

    def _show_ip_bgp(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        if self.device.bgp_asn is None:
            return "% BGP not active"
        bgp_mod.compute(self.network)
        rows = [f"BGP table for AS {self.device.bgp_asn}",
                "   Network            Next Hop         Path"]
        for net, prefix, nh, as_path in self.device.bgp_routes:
            path = " ".join(str(a) for a in as_path) + " i"
            rows.append(f"*> {net}/{prefix:<14} {nh:<16} {path}")
        for net, prefix in self.device.bgp_networks:
            rows.append(f"*> {net}/{prefix:<14} {'0.0.0.0':<16} i (local)")
        if len(rows) == 2:
            return "% No BGP prefixes"
        return "\n".join(rows)

    def _show_ip_bgp_summary(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        if self.device.bgp_asn is None:
            return "% BGP not active"
        rows = [f"BGP router identifier {self.device.name}, local AS number {self.device.bgp_asn}",
                "Neighbor        V    AS  State/PfxRcd"]
        for r in bgp_mod.summary(self.network, self.device):
            state = str(r["prefixes"]) if r["state"] == "Established" else r["state"]
            rows.append(f"{r['neighbor']:<15} 4 {r['remote_as']:>5}  {state}")
        return "\n".join(rows)

    def _show_standby(self):
        if not isinstance(self.device, Router):
            return "% Not a router"
        rows = self.network.standby_state(self.device)
        if not rows:
            return "% No HSRP/VRRP groups configured"
        out = []
        for r in rows:
            out.append(
                f"{r['interface']} - Group {r['group']} ({r['proto']})\n"
                f"  State is {r['state']}\n"
                f"  Virtual IP address is {r['vip']}\n"
                f"  Priority {r['priority']}\n"
                f"  Active router is {r['active_router']}"
            )
        return "\n".join(out)

    def _show_etherchannel(self):
        rows = self.network.etherchannel_summary(self.device)
        if not rows:
            return "% No EtherChannels configured"
        out = ["Group  Protocol    Ports", "------+-----------+-----------------------------"]
        for r in rows:
            flag = "(U)" if r["up"] else "(D)"
            ports = " ".join(f"{m}{flag}" for m in r["members"])
            out.append(f"{r['group']:<6} {r['proto']:<11} {ports}")
        return "\n".join(out)

    def _show_spanning_tree(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        self.network.compute_spanning_tree()
        sw = self.device
        switches = [d for d in self.network.devices.values() if isinstance(d, Switch)]
        root = min(switches, key=lambda s: s.bridge_id) if switches else sw
        is_root = root is sw
        proto = "rstp" if sw.stp_mode == "rapid-pvst" else "ieee"
        role_abbr = {"root": "Root", "designated": "Desg", "alternate": "Altn"}
        rows = [
            "VLAN0001",
            f"  Spanning tree enabled protocol {proto}",
            f"  Bridge ID  Priority {sw.bridge_priority}  Address {sw.bridge_id[1]}",
            f"  Root ID    Priority {root.bridge_priority}  Address {root.bridge_id[1]}"
            + ("  (this bridge is the root)" if is_root else ""),
            "",
            "Interface           Role  Sts",
        ]
        for i in sw.interfaces.values():
            if not i.is_up:
                continue
            sts = "FWD" if i.stp_state == "forwarding" else "BLK"
            role = role_abbr.get(i.stp_role, "Desg")
            rows.append(f"{i.name:<19} {role:<5} {sts}")
        return "\n".join(rows)

    def _show_vlan(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        sw = self.device
        members: dict = {}
        for i in sw.interfaces.values():
            if i.mode == "access":
                members.setdefault(i.vlan, []).append(i.name)
        for vid in members:
            sw.vlans.setdefault(vid, f"VLAN{vid:04d}")
        rows = ["VLAN Name                             Ports"]
        for vid in sorted(sw.vlans):
            name = sw.vlans[vid] if vid != 1 else "default"
            ports = ", ".join(members.get(vid, []))
            rows.append(f"{vid:<4} {name:<32} {ports}")
        return "\n".join(rows)

    def _show_mac_table(self):
        if not isinstance(self.device, Switch):
            return "% Not a switch"
        rows = ["Vlan    Mac Address       Ports"]
        for (vlan, mac), port in self.device.mac_table.items():
            rows.append(f"{vlan:<7} {mac:<17} {port}")
        return "\n".join(rows) if len(rows) > 1 else "% MAC table empty"

    def _show_arp(self):
        table = getattr(self.device, "arp_table", {})
        rows = ["Protocol  Address          Hardware Addr"]
        for ip, mac in table.items():
            rows.append(f"Internet  {ip:<16} {mac}")
        return "\n".join(rows) if len(rows) > 1 else "% ARP cache empty"

    def _show_run(self):
        lines = [f"hostname {self.device.hostname}", "!"]
        dev = self.device
        if isinstance(dev, Switch) and dev.stp_mode == "rapid-pvst":
            lines.append("spanning-tree mode rapid-pvst")
        if isinstance(dev, Switch) and dev.bridge_priority != 32768:
            lines.append(f"spanning-tree vlan 1 priority {dev.bridge_priority}")
        for i in dev.interfaces.values():
            lines.append(f"interface {i.name}")
            if isinstance(dev, Switch):
                if i.mode == "trunk":
                    lines.append(" switchport mode trunk")
                elif i.vlan != 1:
                    lines.append(f" switchport access vlan {i.vlan}")
            if i.ip:
                mask = str(ipaddress.IPv4Network(f"0.0.0.0/{i.prefix}").netmask)
                lines.append(f" ip address {i.ip} {mask}")
            lines.extend(self._iface_sec_lines(i, indent=" "))
            lines.append(" no shutdown" if i.enabled else " shutdown")
            lines.append("!")
        for line in self._security_defs():
            lines.append(line)
        if isinstance(dev, Host) and dev.gateway:
            lines.append(f"ip default-gateway {dev.gateway}")
        if isinstance(dev, Host) and dev.gateway6:
            lines.append(f"ipv6 default-gateway {dev.gateway6}")
        if isinstance(dev, Router):
            for name, pool in dev.dhcp_pools.items():
                lines.append(f"ip dhcp pool {name}")
                if pool.network and pool.prefix:
                    mask = str(ipaddress.IPv4Network(f"0.0.0.0/{pool.prefix}").netmask)
                    lines.append(f" network {pool.network} {mask}")
                if pool.gateway:
                    lines.append(f" default-router {pool.gateway}")
                if pool.dns:
                    lines.append(f" dns-server {pool.dns}")
                lines.append("!")
            for net, prefix, nh in dev.static_routes:
                mask = str(ipaddress.IPv4Network(f"0.0.0.0/{prefix}").netmask)
                lines.append(f"ip route {net} {mask} {nh}")
            if dev.ospf_pid is not None:
                lines.append(f"router ospf {dev.ospf_pid}")
                for net, prefix, area in dev.ospf_networks:
                    wildcard = str(ipaddress.IPv4Address((1 << (32 - prefix)) - 1))
                    lines.append(f" network {net} {wildcard} area {area}")
                lines.append("!")
            if dev.bgp_asn is not None:
                lines.append(f"router bgp {dev.bgp_asn}")
                for nb in dev.bgp_neighbors:
                    lines.append(f" neighbor {nb['ip']} remote-as {nb['remote_as']}")
                for net, prefix in dev.bgp_networks:
                    mask = str(ipaddress.IPv4Network(f"0.0.0.0/{prefix}").netmask)
                    lines.append(f" network {net} mask {mask}")
                lines.append("!")
            for line in self._igp_v6_defs(indent=" "):
                lines.append(line)
            for line in self._acl_defs(indent=True):
                lines.append(line)
            for line in self._nat_defs():
                lines.append(line)
        return "\n".join(lines)

    def _running_config_lines(self):
        """Replayable CLI command list (drives lab apply / export)."""
        cmds = ["enable", "configure terminal"]
        dev = self.device
        cmds.append(f"hostname {dev.hostname}")
        if isinstance(dev, Switch) and dev.stp_mode == "rapid-pvst":
            cmds.append("spanning-tree mode rapid-pvst")
        if isinstance(dev, Switch) and dev.bridge_priority != 32768:
            cmds.append(f"spanning-tree vlan 1 priority {dev.bridge_priority}")
        for i in dev.interfaces.values():
            cmds.append(f"interface {i.name}")
            if isinstance(dev, Switch):
                if i.mode == "trunk":
                    cmds.append("switchport mode trunk")
                elif i.vlan != 1:
                    cmds.append(f"switchport access vlan {i.vlan}")
            if i.ip:
                mask = str(ipaddress.IPv4Network(f"0.0.0.0/{i.prefix}").netmask)
                cmds.append(f"ip address {i.ip} {mask}")
            cmds.extend(self._iface_sec_lines(i))
            cmds.append("no shutdown" if i.enabled else "shutdown")
            cmds.append("exit")
        cmds.extend(self._security_defs())
        if isinstance(dev, Host) and dev.gateway:
            cmds.append(f"ip default-gateway {dev.gateway}")
        if isinstance(dev, Host) and dev.gateway6:
            cmds.append(f"ipv6 default-gateway {dev.gateway6}")
        if isinstance(dev, Router):
            for name, pool in dev.dhcp_pools.items():
                cmds.append(f"ip dhcp pool {name}")
                if pool.network and pool.prefix:
                    mask = str(ipaddress.IPv4Network(f"0.0.0.0/{pool.prefix}").netmask)
                    cmds.append(f"network {pool.network} {mask}")
                if pool.gateway:
                    cmds.append(f"default-router {pool.gateway}")
                if pool.dns:
                    cmds.append(f"dns-server {pool.dns}")
                cmds.append("exit")
            for net, prefix, nh in dev.static_routes:
                mask = str(ipaddress.IPv4Network(f"0.0.0.0/{prefix}").netmask)
                cmds.append(f"ip route {net} {mask} {nh}")
            if dev.ospf_pid is not None:
                cmds.append(f"router ospf {dev.ospf_pid}")
                for net, prefix, area in dev.ospf_networks:
                    wildcard = str(ipaddress.IPv4Address((1 << (32 - prefix)) - 1))
                    cmds.append(f"network {net} {wildcard} area {area}")
                cmds.append("exit")
            if dev.bgp_asn is not None:
                cmds.append(f"router bgp {dev.bgp_asn}")
                for nb in dev.bgp_neighbors:
                    cmds.append(f"neighbor {nb['ip']} remote-as {nb['remote_as']}")
                for net, prefix in dev.bgp_networks:
                    mask = str(ipaddress.IPv4Network(f"0.0.0.0/{prefix}").netmask)
                    cmds.append(f"network {net} mask {mask}")
                cmds.append("exit")
            cmds.extend(self._igp_v6_defs(indent="", replay=True))
        if isinstance(dev, Router):
            cmds.extend(self._acl_defs(indent=False))
            cmds.extend(self._nat_defs())
        cmds.append("end")
        return cmds

    def _igp_v6_defs(self, indent: str = "", replay: bool = False) -> list:
        """IPv6 static routes + EIGRP/RIP router config (show_run + replay)."""
        dev = self.device
        if not isinstance(dev, Router):
            return []
        term = "exit" if replay else "!"
        out = []
        for net, prefix, nh in dev.static_routes6:
            out.append(f"ipv6 route {net}/{prefix} {nh}")
        if dev.eigrp_asn is not None:
            out.append(f"router eigrp {dev.eigrp_asn}")
            for net, prefix in dev.eigrp_networks:
                wildcard = str(ipaddress.IPv4Address((1 << (32 - prefix)) - 1))
                out.append(f"{indent}network {net} {wildcard}")
            for src in sorted(dev.redistribute.get("eigrp", set())):
                out.append(f"{indent}redistribute {src}")
            out.append(term)
        if dev.rip_enabled:
            out.append("router rip")
            out.append(f"{indent}version 2")
            for net, _prefix in dev.rip_networks:
                out.append(f"{indent}network {net}")
            for src in sorted(dev.redistribute.get("rip", set())):
                out.append(f"{indent}redistribute {src}")
            out.append(term)
        return out

    def _security_defs(self) -> list:
        """Global Phase 10 security config (works for both show_run and replay)."""
        dev = self.device
        out = []
        if isinstance(dev, Switch):
            if dev.dhcp_snooping:
                out.append("ip dhcp snooping")
                for v in sorted(dev.dhcp_snoop_vlans):
                    out.append(f"ip dhcp snooping vlan {v}")
            if dev.dai:
                for v in sorted(dev.dai_vlans):
                    out.append(f"ip arp inspection vlan {v}")
            if dev.dot1x_system:
                out.append("dot1x system-auth-control")
            for user, pw in dev.aaa_users.items():
                out.append(f"username {user} password {pw}")
        if isinstance(dev, Router):
            if dev.aaa_enabled:
                out.append("aaa new-model")
            for user, pw in dev.aaa_users.items():
                out.append(f"username {user} password {pw}")
            for (src, dst), action in dev.zone_pairs.items():
                out.append(f"zone-pair security {src} {dst} {action}")
            for t in dev.crypto_tunnels:
                out.append(f"crypto tunnel {t['peer']} {t['local_net']}/{t['local_prefix']} "
                           f"{t['remote_net']}/{t['remote_prefix']}")
            for s in dev.ips_signatures:
                extra = ""
                if "icmp_type" in s:
                    extra = f" type {s['icmp_type']}"
                elif "port" in s:
                    extra = f" port {s['port']}"
                name = f" name {s['name']}" if s.get("name") else ""
                out.append(f"ip ips signature {s['id']} {s['proto']}{extra} {s['action']}{name}")
        return out

    def _iface_sec_lines(self, i, indent: str = "") -> list:
        """Interface-level ACL / NAT / FHRP / EtherChannel lines (show_run + replay)."""
        out = []
        if i.ipv6:
            out.append(f"{indent}ipv6 address {i.ipv6}/{i.ipv6_prefix}")
        if i.channel_group is not None:
            out.append(f"{indent}channel-group {i.channel_group} mode {i.channel_mode or 'on'}")
        if isinstance(self.device, Switch):
            if i.port_security:
                out.append(f"{indent}switchport port-security")
                if i.port_security_max != 1:
                    out.append(f"{indent}switchport port-security maximum {i.port_security_max}")
                if i.port_security_violation != "shutdown":
                    out.append(f"{indent}switchport port-security violation {i.port_security_violation}")
                if i.port_security_sticky:
                    out.append(f"{indent}switchport port-security mac-address sticky")
            if i.dhcp_snoop_trust:
                out.append(f"{indent}ip dhcp snooping trust")
            if i.ip_source_guard:
                out.append(f"{indent}ip verify source")
            if i.dot1x:
                out.append(f"{indent}authentication port-control auto")
        if i.zone:
            out.append(f"{indent}zone-member security {i.zone}")
        if not isinstance(self.device, Router):
            return out
        if i.acl_in:
            out.append(f"{indent}ip access-group {i.acl_in} in")
        if i.acl_out:
            out.append(f"{indent}ip access-group {i.acl_out} out")
        if i.nat_role:
            out.append(f"{indent}ip nat {i.nat_role}")
        for group, cfg in sorted(i.hsrp.items()):
            verb = "vrrp" if cfg.get("proto") == "vrrp" else "standby"
            if cfg.get("vip"):
                out.append(f"{indent}{verb} {group} ip {cfg['vip']}")
            if cfg.get("priority", 100) != 100:
                out.append(f"{indent}{verb} {group} priority {cfg['priority']}")
            if cfg.get("preempt"):
                out.append(f"{indent}{verb} {group} preempt")
        return out

    def _acl_defs(self, indent: bool) -> list:
        """ACL definition lines. ``indent`` => show-style (entries indented);
        otherwise replayable commands using config-acl mode + exit."""
        out = []
        for name, acl in self.device.acls.items():
            if name.isdigit():
                for e in acl["entries"]:
                    out.append(f"access-list {name} {e.text()}")
            else:
                out.append(f"ip access-list {acl['kind']} {name}")
                for e in acl["entries"]:
                    out.append(f" {e.text()}" if indent else e.text())
                if not indent:
                    out.append("exit")
        return out

    def _nat_defs(self) -> list:
        out = []
        dev = self.device
        for name, pool in dev.nat_pools.items():
            out.append(f"ip nat pool {name} {pool['start']} {pool['end']} prefix-length {pool['prefix']}")
        for inside_local, inside_global in dev.nat_static:
            out.append(f"ip nat inside source static {inside_local} {inside_global}")
        for r in dev.nat_dynamic:
            s = f"ip nat inside source list {r['acl']}"
            if r.get("pool"):
                s += f" pool {r['pool']}"
            if r.get("interface"):
                s += f" interface {r['interface']}"
            if r.get("overload"):
                s += " overload"
            out.append(s)
        return out
