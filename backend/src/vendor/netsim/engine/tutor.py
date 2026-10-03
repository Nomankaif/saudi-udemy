"""Lab tutor: a deterministic rule-based network analyzer plus an optional
Cloudflare Workers AI explanation layer.

The analyzer encodes common CCNA misconfigurations (interfaces down, subnet
mismatches, missing gateways, OSPF area/network mismatches, duplicate IPs). It
works fully offline. When Cloudflare credentials are configured the same
analysis is handed to a free Workers AI model to phrase a friendly explanation;
otherwise we return a deterministic explanation built from the findings."""
from __future__ import annotations

import ipaddress
import json
import os
import urllib.error
import urllib.request
from typing import List, Optional

from . import wireless as wifi_mod
from .models import AccessPoint, Host, Router, Switch, WirelessClient
from .simulator import Network

CF_MODEL = "@cf/meta/llama-3.1-8b-instruct"


def _iface_subnet(iface) -> Optional[ipaddress.IPv4Network]:
    return iface.network


def analyze(net: Network) -> List[str]:
    """Return a list of human-readable findings about the current topology."""
    findings: List[str] = []

    # duplicate IPs
    seen: dict = {}
    for dev in net.devices.values():
        for i in dev.interfaces.values():
            if i.ip:
                seen.setdefault(i.ip, []).append(f"{dev.name} {i.name}")
    for ip, owners in seen.items():
        if len(owners) > 1:
            findings.append(f"Duplicate IP {ip} configured on {', '.join(owners)}.")

    # hosts: interface down / no gateway
    for dev in net.devices.values():
        if not isinstance(dev, Host):
            continue
        i = dev.primary
        if i.ip and not i.enabled:
            findings.append(f"{dev.name} has an IP but {i.name} is administratively down (run 'no shutdown').")
        if i.ip and i.link is None:
            findings.append(f"{dev.name} {i.name} is not connected to anything.")
        if i.ip and not dev.gateway:
            findings.append(f"{dev.name} has no default-gateway, so it cannot reach other subnets.")

    # point-to-point subnet mismatch between directly connected L3 interfaces
    for ln in net.links:
        a, b = ln.a, ln.b
        if a.ip and b.ip and a.network and b.network and a.network != b.network:
            findings.append(
                f"Subnet mismatch on link {a.device.name} {a.name} ({a.ip}/{a.prefix}) "
                f"<-> {b.device.name} {b.name} ({b.ip}/{b.prefix})."
            )

    # OSPF area mismatch on a shared subnet
    routers = [d for d in net.devices.values() if isinstance(d, Router) and d.ospf_pid is not None]
    for idx, r1 in enumerate(routers):
        for r2 in routers[idx + 1:]:
            for i in r1.interfaces.values():
                for j in r2.interfaces.values():
                    if not (i.is_up and j.is_up and i.network and i.network == j.network):
                        continue
                    a1 = _area_for(r1, i)
                    a2 = _area_for(r2, j)
                    if a1 is not None and a2 is not None and a1 != a2:
                        findings.append(
                            f"OSPF neighbors {r1.name}/{r2.name} won't form on {i.network}: "
                            f"area {a1} != area {a2}."
                        )
                    if (a1 is None) != (a2 is None):
                        missing = r1.name if a1 is None else r2.name
                        findings.append(
                            f"OSPF: {missing} has no 'network' statement covering {i.network}, "
                            "so no adjacency forms there."
                        )

    # ACL applied that permits nothing (implicit deny drops everything)
    for r in [d for d in net.devices.values() if isinstance(d, Router)]:
        for i in r.interfaces.values():
            for acl_name, direction in ((i.acl_in, "in"), (i.acl_out, "out")):
                if not acl_name:
                    continue
                acl = r.acls.get(acl_name)
                if acl is None:
                    findings.append(
                        f"{r.name} {i.name} references undefined access-list {acl_name} ({direction})."
                    )
                elif not any(e.action == "permit" for e in acl.get("entries", [])):
                    findings.append(
                        f"ACL {acl_name} on {r.name} {i.name} ({direction}) has no permit entries; "
                        "the implicit deny drops all traffic."
                    )

    # NAT inside/outside asymmetry
    for r in [d for d in net.devices.values() if isinstance(d, Router)]:
        roles = {i.nat_role for i in r.interfaces.values() if i.nat_role}
        has_rules = bool(r.nat_static or r.nat_dynamic)
        if has_rules and "inside" in roles and "outside" not in roles:
            findings.append(f"{r.name} has NAT rules and an inside interface but no 'ip nat outside' interface.")
        if has_rules and "outside" in roles and "inside" not in roles:
            findings.append(f"{r.name} has NAT rules and an outside interface but no 'ip nat inside' interface.")

    # BGP neighbour problems: unreachable peer or mismatched remote-as
    bgp_routers = [d for d in net.devices.values() if isinstance(d, Router) and d.bgp_asn is not None]
    for r in bgp_routers:
        for nb in r.bgp_neighbors:
            owner = next(
                ((d, i) for d in net.devices.values() if isinstance(d, Router)
                 for i in d.interfaces.values() if i.is_up and i.ip == nb["ip"]),
                None,
            )
            if owner is None:
                findings.append(
                    f"{r.name} BGP neighbor {nb['ip']} is unreachable (no up interface owns it)."
                )
                continue
            peer, _pi = owner
            if peer.bgp_asn != nb.get("remote_as"):
                findings.append(
                    f"{r.name} BGP neighbor {nb['ip']} remote-as {nb.get('remote_as')} "
                    f"!= {peer.name}'s actual AS {peer.bgp_asn}; session stays Idle."
                )

    # HSRP/VRRP: virtual IP must differ from real IPs and groups must agree
    for r in [d for d in net.devices.values() if isinstance(d, Router)]:
        for i in r.interfaces.values():
            for group, cfg in i.hsrp.items():
                vip = cfg.get("vip")
                if not vip:
                    findings.append(f"{r.name} {i.name} standby {group} has no virtual IP set.")
                    continue
                if i.network and ipaddress.ip_address(vip) not in i.network:
                    findings.append(
                        f"{r.name} {i.name} standby {group} VIP {vip} is not in the "
                        f"interface subnet {i.network}."
                    )

    # EIGRP: neighbours on a shared subnet must share the same AS number
    eigrp_routers = [d for d in net.devices.values()
                     if isinstance(d, Router) and d.eigrp_asn is not None]
    for r in eigrp_routers:
        for i in r.interfaces.values():
            if not (i.is_up and i.network and i.ip):
                continue
            peer_if = i.peer()
            peer = peer_if.device if peer_if else None
            if (isinstance(peer, Router) and peer.eigrp_asn is not None
                    and peer.eigrp_asn != r.eigrp_asn and peer_if.network == i.network):
                findings.append(
                    f"{r.name} and {peer.name} are on {i.network} but run EIGRP in "
                    f"different ASes ({r.eigrp_asn} vs {peer.eigrp_asn}); no adjacency forms."
                )

    # IPv6: host with a v6 address off-link needs a v6 default-gateway
    for dev in net.devices.values():
        if not isinstance(dev, Host):
            continue
        if dev.primary.ipv6 and not dev.gateway6:
            findings.append(
                f"{dev.name} has an IPv6 address but no 'ipv6 default-gateway'; "
                f"it cannot reach other IPv6 subnets."
            )

    # IPv6 subnet mismatch across a directly-connected link
    for ln in net.links:
        a, b = ln.a, ln.b
        if a.ipv6 and b.ipv6 and a.network6 and b.network6 and a.network6 != b.network6:
            findings.append(
                f"IPv6 subnet mismatch on link {a.device.name} {a.name} "
                f"({a.ipv6}/{a.ipv6_prefix}) <-> {b.device.name} {b.name} "
                f"({b.ipv6}/{b.ipv6_prefix})."
            )

    findings.extend(_security_findings(net))
    findings.extend(_wireless_findings(net))
    return findings


def _wireless_findings(net: Network) -> List[str]:
    """Phase 12 wireless misconfiguration hints."""
    out: List[str] = []
    for dev in net.devices.values():
        if isinstance(dev, AccessPoint):
            if not dev.ssids:
                out.append(f"AP {dev.name} broadcasts no SSID; clients have nothing to join.")
            if not dev.uplink.is_up:
                out.append(
                    f"AP {dev.name}'s wired uplink is down; associated clients can't reach the LAN."
                )
            for ssid, cfg in dev.ssids.items():
                if cfg.get("auth", "open") != "open" and not cfg.get("psk"):
                    out.append(f"AP {dev.name} SSID '{ssid}' uses {cfg['auth']} but has no PSK set.")
        if isinstance(dev, WirelessClient) and dev.assoc is None:
            heard = wifi_mod.scan(net, dev)
            if not heard:
                out.append(
                    f"Client {dev.name} is not associated and hears no AP in range "
                    f"(move it closer or raise AP tx-power)."
                )
            else:
                known = [r for r in heard if r["auth"] == "open" or r["ssid"] in dev.profiles]
                if not known:
                    out.append(
                        f"Client {dev.name} hears {len(heard)} SSID(s) but has no matching "
                        f"credentials; add a profile for one of: "
                        f"{', '.join(sorted({r['ssid'] for r in heard}))}."
                    )
                else:
                    for r in known:
                        ap = net.devices.get(r["ap"])
                        cfg = ap.ssids.get(r["ssid"], {}) if isinstance(ap, AccessPoint) else {}
                        if (cfg.get("auth", "open") != "open"
                                and dev.profiles.get(r["ssid"]) != cfg.get("psk")):
                            out.append(
                                f"Client {dev.name} has wrong credentials for '{r['ssid']}' on "
                                f"{r['ap']}; the PSK does not match (auth will fail)."
                            )
    return out


def _security_findings(net: Network) -> List[str]:
    """Phase 10 security misconfiguration hints."""
    out: List[str] = []
    for dev in net.devices.values():
        if isinstance(dev, Switch):
            for i in dev.interfaces.values():
                if i.err_disabled:
                    out.append(
                        f"{dev.name} {i.name} is err-disabled by a port-security violation; "
                        f"clear it and check the allowed MAC/maximum."
                    )
                if i.dot1x and not i.dot1x_authorized:
                    out.append(
                        f"{dev.name} {i.name} runs 802.1X but the supplicant is unauthorized; "
                        f"no data passes until it authenticates."
                    )
            # DAI on a vlan with no bindings + only untrusted access ports drops ARP
            if dev.dai and not dev.dhcp_snoop_bindings:
                untrusted = [i.name for i in dev.interfaces.values()
                             if i.link is not None and not i.dhcp_snoop_trust]
                if untrusted:
                    out.append(
                        f"{dev.name} has Dynamic ARP Inspection enabled but no DHCP snooping "
                        f"bindings; ARP on untrusted ports ({', '.join(untrusted)}) will be dropped."
                    )
        if isinstance(dev, Router):
            zoned = [i for i in dev.interfaces.values() if i.zone]
            zones = {i.zone for i in zoned}
            if len(zones) >= 2 and not dev.zone_pairs:
                out.append(
                    f"{dev.name} has interfaces in different security zones but no zone-pair "
                    f"policy; inter-zone traffic is denied by default."
                )
    return out


def _area_for(router: Router, iface) -> Optional[int]:
    if not iface.ip:
        return None
    for net, prefix, area in router.ospf_networks:
        if ipaddress.ip_address(iface.ip) in ipaddress.ip_network(f"{net}/{prefix}", strict=False):
            return area
    return None


def _topology_summary(net: Network) -> str:
    lines = []
    for dev in net.devices.values():
        ifaces = ", ".join(
            f"{i.name}={i.ip}/{i.prefix}({'up' if i.is_up else 'down'})"
            for i in dev.interfaces.values() if i.ip
        )
        lines.append(f"{dev.kind} {dev.name}: {ifaces or 'no L3 addresses'}")
    return "\n".join(lines)


def cf_config() -> Optional[dict]:
    token = os.environ.get("CF_API_TOKEN")
    account = os.environ.get("CF_ACCOUNT_ID")
    if token and account:
        return {"token": token, "account": account}
    return None


def _call_cloudflare(cfg: dict, system: str, user: str) -> Optional[str]:
    url = f"https://api.cloudflare.com/client/v4/accounts/{cfg['account']}/ai/run/{CF_MODEL}"
    payload = json.dumps({
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    }).encode()
    req = urllib.request.Request(
        url, data=payload,
        headers={"Authorization": f"Bearer {cfg['token']}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
        result = data.get("result", {})
        return result.get("response") or None
    except (urllib.error.URLError, ValueError, KeyError):
        return None


def explain(net: Network, question: str) -> dict:
    findings = analyze(net)
    cfg = cf_config()
    summary = _topology_summary(net)
    if cfg:
        system = (
            "You are a concise CCNA networking tutor for a browser network simulator. "
            "Explain in plain English what is misconfigured and how to fix it using Cisco IOS commands. "
            "Be brief and practical."
        )
        user = (
            f"Topology:\n{summary}\n\n"
            f"Automated findings:\n" + ("\n".join(f"- {f}" for f in findings) or "- none") + "\n\n"
            f"Student question: {question or 'Why is my lab not working?'}"
        )
        answer = _call_cloudflare(cfg, system, user)
        if answer:
            return {"answer": answer, "findings": findings, "source": "cloudflare"}

    # deterministic fallback
    if findings:
        answer = "I found these likely issues:\n" + "\n".join(f"- {f}" for f in findings)
    else:
        answer = (
            "No obvious misconfiguration detected. Check that interfaces are 'no shutdown', "
            "IP/subnets match on each link, hosts have a default-gateway, and routing "
            "(static or OSPF) covers the destination network."
        )
    return {"answer": answer, "findings": findings, "source": "rules"}
