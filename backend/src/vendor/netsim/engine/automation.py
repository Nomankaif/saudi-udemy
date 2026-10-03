"""Phase 11: network-automation surface.

Pure, framework-free helpers that give the simulator an automation story
comparable to what an automation engineer actually uses:

* a structured (RESTCONF/NETCONF/YANG-ish) JSON view of a device's config, and
  the reverse translation back into CLI (``device_intent`` / ``intent_to_cli``);
* a minimal Jinja-style template renderer for intent-driven config generation
  (``render_template``) -- no external dependency, so it stays Scalingo-free;
* config snapshots + drift detection (``snapshot`` / ``diff_snapshots``);
* a Batfish-style compliance validator (``validate``).

The REST endpoints in ``app.main`` are thin wrappers over these functions.
"""
from __future__ import annotations

import ipaddress
import re
from typing import TYPE_CHECKING, Dict, List

from .models import Host, Router, Switch

if TYPE_CHECKING:
    from .simulator import Network


# --------------------------------------------------------------------------- #
# running-config snapshot + drift
# --------------------------------------------------------------------------- #
def running_config(net: "Network", device: str) -> List[str]:
    """Running-config lines for one device (empty list if it does not exist)."""
    from .cli import CLISession  # local import: cli imports models/simulator

    dev = net.devices.get(device)
    if dev is None:
        return []
    return CLISession(dev, net)._running_config_lines()


def snapshot(net: "Network") -> Dict[str, List[str]]:
    """A {device: running-config-lines} snapshot of the whole topology."""
    return {name: running_config(net, name) for name in net.devices}


def diff_snapshots(baseline: Dict[str, List[str]],
                   current: Dict[str, List[str]]) -> Dict[str, dict]:
    """Per-device config drift between two snapshots.

    Returns only devices that changed; each entry has ``added`` (lines now
    present that were not in the baseline) and ``removed`` (the converse).
    """
    drift: Dict[str, dict] = {}
    for name in sorted(set(baseline) | set(current)):
        base = baseline.get(name, [])
        cur = current.get(name, [])
        added = [ln for ln in cur if ln not in base]
        removed = [ln for ln in base if ln not in cur]
        if added or removed:
            drift[name] = {"added": added, "removed": removed}
    return drift


# --------------------------------------------------------------------------- #
# structured intent  <->  CLI
# --------------------------------------------------------------------------- #
def _mask_dotted(prefix: int) -> str:
    return str(ipaddress.IPv4Network(f"0.0.0.0/{prefix}").netmask)


def device_intent(dev) -> dict:
    """A structured (YANG-ish) view of a device's config."""
    intent: dict = {"name": dev.name, "kind": dev.kind, "hostname": dev.hostname,
                    "interfaces": []}
    for i in dev.interfaces.values():
        iface: dict = {"name": i.name, "enabled": i.enabled}
        if i.ip and i.prefix is not None:
            iface["ipv4"] = {"address": i.ip, "prefix": i.prefix,
                             "mask": _mask_dotted(i.prefix)}
        if i.ipv6 and i.ipv6_prefix is not None:
            iface["ipv6"] = {"address": i.ipv6, "prefix": i.ipv6_prefix}
        if isinstance(dev, Switch):
            iface["switchport"] = {"mode": i.mode, "vlan": i.vlan}
        intent["interfaces"].append(iface)

    if isinstance(dev, Host) and dev.gateway:
        intent["default_gateway"] = dev.gateway
    if isinstance(dev, Router):
        intent["static_routes"] = [
            {"network": n, "prefix": p, "mask": _mask_dotted(p), "next_hop": nh}
            for (n, p, nh) in dev.static_routes
        ]
        if dev.ospf_pid is not None:
            intent["ospf"] = {
                "process_id": dev.ospf_pid,
                "networks": [{"network": n, "prefix": p, "area": a}
                             for (n, p, a) in dev.ospf_networks],
            }
    return intent


def intent_to_cli(intent: dict) -> List[str]:
    """Translate a structured intent into config-mode CLI lines.

    The lines are body-only (no ``enable``/``configure terminal``/``end``); the
    caller wraps them, mirroring how netmiko's ``send_config_set`` enters and
    leaves config mode for you.
    """
    lines: List[str] = []
    if intent.get("hostname"):
        lines.append(f"hostname {intent['hostname']}")

    for iface in intent.get("interfaces", []):
        lines.append(f"interface {iface['name']}")
        if iface.get("description"):
            lines.append(f" description {iface['description']}")
        sp = iface.get("switchport")
        if sp:
            if sp.get("mode"):
                lines.append(f" switchport mode {sp['mode']}")
            if sp.get("mode") == "access" and sp.get("vlan"):
                lines.append(f" switchport access vlan {sp['vlan']}")
        v4 = iface.get("ipv4")
        if v4:
            mask = v4.get("mask") or _mask_dotted(int(v4["prefix"]))
            lines.append(f" ip address {v4['address']} {mask}")
        v6 = iface.get("ipv6")
        if v6:
            lines.append(f" ipv6 address {v6['address']}/{v6['prefix']}")
        lines.append(" no shutdown" if iface.get("enabled", True) else " shutdown")
        lines.append("exit")

    if intent.get("default_gateway"):
        lines.append(f"ip default-gateway {intent['default_gateway']}")

    for r in intent.get("static_routes", []):
        mask = r.get("mask") or _mask_dotted(int(r["prefix"]))
        lines.append(f"ip route {r['network']} {mask} {r['next_hop']}")

    ospf = intent.get("ospf")
    if ospf:
        lines.append(f"router ospf {ospf['process_id']}")
        for n in ospf.get("networks", []):
            wild = n.get("wildcard")
            if wild is None:
                # derive wildcard from prefix
                net = ipaddress.IPv4Network(f"{n['network']}/{n['prefix']}", strict=False)
                wild = str(net.hostmask)
            lines.append(f" network {n['network']} {wild} area {n['area']}")
        lines.append("exit")
    return lines


# --------------------------------------------------------------------------- #
# minimal Jinja-style template renderer
# --------------------------------------------------------------------------- #
_TOKEN = re.compile(r"{%\s*(?P<tag>.*?)\s*%}|{{\s*(?P<var>.*?)\s*}}", re.S)


def _lookup(expr: str, scope: dict):
    expr = expr.strip()
    parts = expr.split(".")
    val = scope.get(parts[0])
    for p in parts[1:]:
        if val is None:
            return None
        val = val.get(p) if isinstance(val, dict) else getattr(val, p, None)
    return val


def _truthy(cond: str, scope: dict) -> bool:
    cond = cond.strip()
    neg = False
    if cond.startswith("not "):
        neg, cond = True, cond[4:].strip()
    for op in ("==", "!="):
        if op in cond:
            left, right = (s.strip() for s in cond.split(op, 1))
            lv = _lookup(left, scope)
            rv = right.strip("'\"") if right[:1] in "'\"" else _lookup(right, scope)
            res = (str(lv) == str(rv)) if op == "==" else (str(lv) != str(rv))
            return (not res) if neg else res
    res = bool(_lookup(cond, scope))
    return (not res) if neg else res


def _tokenize(template: str):
    tokens, pos = [], 0
    for m in _TOKEN.finditer(template):
        if m.start() > pos:
            tokens.append(("text", template[pos:m.start()]))
        if m.group("tag") is not None:
            tokens.append(("tag", m.group("tag").strip()))
        else:
            tokens.append(("var", m.group("var").strip()))
        pos = m.end()
    if pos < len(template):
        tokens.append(("text", template[pos:]))
    return tokens


def _parse(tokens, i, stop):
    """Recursive-descent parse into a node tree until a stop tag is hit."""
    nodes = []
    while i < len(tokens):
        kind, val = tokens[i]
        if kind == "text":
            nodes.append(("text", val))
            i += 1
        elif kind == "var":
            nodes.append(("var", val))
            i += 1
        else:  # tag
            head = val.split()[0]
            if stop and head in stop:
                return nodes, i
            if head == "for":
                m = re.match(r"for\s+(\w+)\s+in\s+(.+)", val)
                if not m:
                    raise ValueError(f"bad for tag: {val!r}")
                body, i = _parse(tokens, i + 1, {"endfor"})
                i += 1  # consume endfor
                nodes.append(("for", m.group(1), m.group(2).strip(), body))
            elif head == "if":
                cond = val[2:].strip()
                body, i = _parse(tokens, i + 1, {"else", "endif"})
                else_body = []
                if i < len(tokens) and tokens[i][1].split()[0] == "else":
                    else_body, i = _parse(tokens, i + 1, {"endif"})
                i += 1  # consume endif
                nodes.append(("if", cond, body, else_body))
            else:
                raise ValueError(f"unknown tag: {val!r}")
    return nodes, i


def _render_nodes(nodes, scope) -> str:
    out = []
    for node in nodes:
        if node[0] == "text":
            out.append(node[1])
        elif node[0] == "var":
            val = _lookup(node[1], scope)
            out.append("" if val is None else str(val))
        elif node[0] == "for":
            _, var, listexpr, body = node
            seq = _lookup(listexpr, scope) or []
            for item in seq:
                child = dict(scope)
                child[var] = item
                out.append(_render_nodes(body, child))
        elif node[0] == "if":
            _, cond, body, else_body = node
            out.append(_render_nodes(body if _truthy(cond, scope) else else_body, scope))
    return "".join(out)


def render_template(template: str, variables: dict) -> str:
    """Render a template with ``{{ var }}``, ``{% for %}`` and ``{% if %}``."""
    nodes, _ = _parse(_tokenize(template), 0, None)
    return _render_nodes(nodes, dict(variables or {}))


# --------------------------------------------------------------------------- #
# Batfish-style compliance validation
# --------------------------------------------------------------------------- #
def _route_present(net: "Network", dev: Router, network: str) -> bool:
    from . import bgp as bgp_mod
    from . import igp as igp_mod

    net.compute_ospf()
    bgp_mod.compute(net)
    igp_mod.compute(net)
    target = ipaddress.ip_network(network, strict=False)
    for i in dev.interfaces.values():
        if i.is_up and i.network == target:
            return True
    tables = (
        [(n, p) for (n, p, _nh) in dev.static_routes]
        + [(n, p) for (n, p, _nh, _c) in dev.ospf_routes]
        + [(n, p) for (n, p, _nh, _m) in dev.eigrp_routes]
        + [(n, p) for (n, p, _nh, _h) in dev.rip_routes]
        + [(n, p) for (n, p, _nh, _ap) in dev.bgp_routes]
    )
    return any(ipaddress.ip_network(f"{n}/{p}", strict=False) == target for n, p in tables)


def _no_duplicate_ip(net: "Network") -> dict:
    seen: Dict[str, str] = {}
    dupes = []
    for dev in net.devices.values():
        for i in dev.interfaces.values():
            if not i.ip:
                continue
            owner = f"{dev.name}/{i.name}"
            if i.ip in seen:
                dupes.append(f"{i.ip} on {seen[i.ip]} and {owner}")
            else:
                seen[i.ip] = owner
    return {"passed": not dupes,
            "detail": "no duplicate IPs" if not dupes else "; ".join(dupes)}


def validate(net: "Network", assertions: List[dict]) -> dict:
    """Run config-compliance assertions. Returns per-assertion results, a score
    and an overall ``compliant`` flag (Batfish-style policy checking)."""
    results = []
    for a in assertions:
        t = a.get("type")
        if t == "no_duplicate_ip":
            r = _no_duplicate_ip(net)
        elif t == "reachable":
            res = net.ping(a["src"], a["dst"], a.get("count", 2))
            ok = bool(res.get("ok")) and res.get("received", 0) > 0
            want = a.get("expect", True)
            r = {"passed": ok == want, "detail": f"received {res.get('received', 0)}"}
        elif t in ("interface_ip", "interface_up"):
            dev = net.devices.get(a["device"])
            iface = dev.get_interface(a["interface"]) if dev else None
            if iface is None:
                r = {"passed": False, "detail": "no such interface"}
            elif t == "interface_up":
                r = {"passed": iface.is_up, "detail": "up" if iface.is_up else "down"}
            else:
                r = {"passed": iface.ip == a["ip"], "detail": f"ip={iface.ip}"}
        elif t == "route_present":
            dev = net.devices.get(a["device"])
            if not isinstance(dev, Router):
                r = {"passed": False, "detail": "not a router"}
            else:
                present = _route_present(net, dev, a["network"])
                want = a.get("expect_present", True)
                r = {"passed": present == want,
                     "detail": f"route {'present' if present else 'absent'}"}
        else:
            r = {"passed": False, "detail": f"unknown assertion type {t}"}
        results.append({"assertion": a, **r})

    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    return {
        "compliant": passed == total and total > 0,
        "passed": passed,
        "total": total,
        "score": round(100 * passed / total) if total else 0,
        "results": results,
    }
