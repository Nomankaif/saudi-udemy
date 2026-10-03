"""Lab-as-code: auto-grading checks against a live topology.

A lab spec is JSON: devices, links, per-device config (CLI lines) and a list of
`checks`. Applying a spec rebuilds the topology and runs the config; grading runs
the checks and returns a pass/fail report plus a score."""
from __future__ import annotations

import ipaddress
from typing import TYPE_CHECKING, List

from . import bgp as bgp_mod
from . import igp as igp_mod
from .models import Router

if TYPE_CHECKING:
    from .simulator import Network


def _check_ping(net: "Network", check: dict) -> dict:
    expect = check.get("expect", "success")
    res = net.ping(check["src"], check["dst"], check.get("count", 4))
    if not res.get("ok"):
        passed = expect == "fail"
        return {"passed": passed, "detail": res.get("error", "ping failed to start")}
    success = res["received"] > 0
    passed = success if expect == "success" else not success
    return {"passed": passed, "detail": f"{res['received']}/{res['sent']} replies"}


def _check_route(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if not isinstance(dev, Router):
        return {"passed": False, "detail": "not a router"}
    net.compute_ospf()
    bgp_mod.compute(net)
    igp_mod.compute(net)
    target = ipaddress.ip_network(check["network"], strict=False)
    found = False
    for i in dev.interfaces.values():
        if i.is_up and i.network == target:
            found = True
    for n, p, _nh in dev.static_routes:
        if ipaddress.ip_network(f"{n}/{p}", strict=False) == target:
            found = True
    for n, p, _nh, _c in dev.ospf_routes:
        if ipaddress.ip_network(f"{n}/{p}", strict=False) == target:
            found = True
    for n, p, _nh, _m in dev.eigrp_routes:
        if ipaddress.ip_network(f"{n}/{p}", strict=False) == target:
            found = True
    for n, p, _nh, _m in dev.rip_routes:
        if ipaddress.ip_network(f"{n}/{p}", strict=False) == target:
            found = True
    for n, p, _nh, _ap in dev.bgp_routes:
        if ipaddress.ip_network(f"{n}/{p}", strict=False) == target:
            found = True
    expect = check.get("expect_present", True)
    return {"passed": found == expect, "detail": f"route {'present' if found else 'absent'}"}


def _check_ping6(net: "Network", check: dict) -> dict:
    expect = check.get("expect", "success")
    res = net.ping6(check["src"], check["dst"], check.get("count", 4))
    if not res.get("ok"):
        return {"passed": expect == "fail", "detail": res.get("error", "ping6 failed to start")}
    success = res["received"] > 0
    passed = success if expect == "success" else not success
    return {"passed": passed, "detail": f"{res['received']}/{res['sent']} replies"}


def _check_interface_up(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if dev is None:
        return {"passed": False, "detail": "no such device"}
    iface = dev.get_interface(check["interface"])
    if iface is None:
        return {"passed": False, "detail": "no such interface"}
    return {"passed": iface.is_up, "detail": "up" if iface.is_up else "down"}


def _check_stp_blocking(net: "Network", check: dict) -> dict:
    net.compute_spanning_tree()
    blocked = sum(
        1 for d in net.devices.values() for i in d.interfaces.values()
        if getattr(i, "stp_state", None) == "blocking"
    )
    min_blocked = check.get("min_blocked", 1)
    return {"passed": blocked >= min_blocked, "detail": f"{blocked} port(s) blocking"}


def _check_traceroute(net: "Network", check: dict) -> dict:
    res = net.traceroute(check["src"], check["dst"])
    if not res.get("ok"):
        return {"passed": False, "detail": res.get("error", "traceroute failed to start")}
    expect = check.get("expect_reached", True)
    passed = res["reached"] == expect
    return {"passed": passed, "detail": f"{len(res['hops'])} hops, reached={res['reached']}"}


def _check_nat_translation(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if not isinstance(dev, Router):
        return {"passed": False, "detail": "not a router"}
    # exercise the data path so translations are populated
    if check.get("src") and check.get("dst"):
        net.ping(check["src"], check["dst"], check.get("count", 1))
    inside_local = check.get("inside_local")
    found = any(
        (inside_local is None or t["inside_local"] == inside_local)
        for t in dev.nat_table
    )
    expect = check.get("expect_present", True)
    return {"passed": found == expect, "detail": f"translation {'present' if found else 'absent'}"}


def _check_hsrp_active(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if not isinstance(dev, Router):
        return {"passed": False, "detail": "not a router"}
    rows = net.standby_state(dev)
    group = check.get("group")
    rows = [r for r in rows if group is None or r["group"] == group]
    if not rows:
        return {"passed": False, "detail": "no matching standby group"}
    expect = check.get("expect_state", "Active")
    state = rows[0]["state"]
    return {"passed": state == expect, "detail": f"state={state}"}


def _check_etherchannel(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if dev is None:
        return {"passed": False, "detail": "no such device"}
    rows = net.etherchannel_summary(dev)
    group = check.get("group")
    rows = [r for r in rows if group is None or r["group"] == group]
    if not rows:
        return {"passed": False, "detail": "no matching channel-group"}
    row = rows[0]
    min_members = check.get("min_members", 2)
    ok = row["up"] and len(row["members"]) >= min_members
    return {"passed": ok, "detail": f"{len(row['members'])} members, up={row['up']}"}


def _check_port_security(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if dev is None:
        return {"passed": False, "detail": "no such device"}
    iface = dev.get_interface(check["interface"])
    if iface is None:
        return {"passed": False, "detail": "no such interface"}
    # optionally exercise traffic to trigger a violation
    if check.get("src") and check.get("dst"):
        net.ping(check["src"], check["dst"], check.get("count", 1))
    expect = check.get("expect_err_disabled", True)
    return {"passed": iface.err_disabled == expect,
            "detail": f"err_disabled={iface.err_disabled}"}


def _check_dhcp_snoop_binding(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if dev is None or not hasattr(dev, "dhcp_snoop_bindings"):
        return {"passed": False, "detail": "not a switch"}
    if check.get("client"):
        net.dhcp_request(check["client"])
    ip = check.get("ip")
    found = any(ip is None or b["ip"] == ip for b in dev.dhcp_snoop_bindings)
    expect = check.get("expect_present", True)
    return {"passed": found == expect, "detail": f"binding {'present' if found else 'absent'}"}


def _check_crypto_session(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if not isinstance(dev, Router):
        return {"passed": False, "detail": "not a router"}
    sessions = net.crypto_sessions(dev)
    peer = check.get("peer")
    sessions = [s for s in sessions if peer is None or s["peer"] == peer]
    if not sessions:
        return {"passed": False, "detail": "no matching crypto session"}
    expect = check.get("expect_status", "UP-ACTIVE")
    status = sessions[0]["status"]
    return {"passed": status == expect, "detail": f"status={status}"}


def _check_ips_alert(net: "Network", check: dict) -> dict:
    dev = net.devices.get(check["device"])
    if not isinstance(dev, Router):
        return {"passed": False, "detail": "not a router"}
    if check.get("src") and check.get("dst"):
        net.ping(check["src"], check["dst"], check.get("count", 1))
    expect = check.get("expect_alert", True)
    fired = bool(dev.ips_alerts)
    return {"passed": fired == expect, "detail": f"{len(dev.ips_alerts)} alerts"}


def _check_wifi_associated(net: "Network", check: dict) -> dict:
    from . import wireless as wifi_mod

    client = check["client"]
    if check.get("associate", True):
        wifi_mod.associate(net, client, check.get("ssid"))
    dev = net.devices.get(client)
    assoc = getattr(dev, "assoc", None)
    expect = check.get("expect_associated", True)
    ok = assoc is not None
    if ok and check.get("ap"):
        ok = assoc["ap"] == check["ap"]
    if ok and check.get("require_online"):
        ok = wifi_mod.client_online(net, client)["online"]
    detail = f"associated to {assoc['ap']}" if assoc else "not associated"
    return {"passed": ok == expect, "detail": detail}


_CHECKS = {
    "ping": _check_ping,
    "wifi_associated": _check_wifi_associated,
    "ping6": _check_ping6,
    "route": _check_route,
    "interface_up": _check_interface_up,
    "traceroute": _check_traceroute,
    "stp_blocking": _check_stp_blocking,
    "nat_translation": _check_nat_translation,
    "hsrp_active": _check_hsrp_active,
    "etherchannel": _check_etherchannel,
    "port_security": _check_port_security,
    "dhcp_snoop_binding": _check_dhcp_snoop_binding,
    "crypto_session": _check_crypto_session,
    "ips_alert": _check_ips_alert,
}


def grade_lab(net: "Network", checks: List[dict]) -> dict:
    results = []
    for check in checks:
        fn = _CHECKS.get(check.get("type"))
        name = check.get("name", check.get("type", "check"))
        if fn is None:
            results.append({"name": name, "passed": False, "detail": f"unknown check {check.get('type')}"})
            continue
        try:
            outcome = fn(net, check)
        except (KeyError, ValueError) as exc:
            outcome = {"passed": False, "detail": f"error: {exc}"}
        results.append({"name": name, **outcome})
    passed = sum(1 for r in results if r["passed"])
    total = len(results)
    return {
        "results": results,
        "passed": passed,
        "total": total,
        "score": round(100 * passed / total) if total else 0,
    }
