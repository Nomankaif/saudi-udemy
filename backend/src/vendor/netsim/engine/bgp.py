"""A compact path-vector BGP (eBGP) model.

Routers with a `bgp_asn` form sessions with configured neighbours that are
directly reachable on a shared, up subnet and that name them back with the
matching remote-as. Originated `network` statements are flooded across the
session graph; each hop prepends its own AS to the AS-path, which both gives a
shortest-AS-path tie-break and prevents loops. Installed routes get admin
distance 20 in the routing table."""
from __future__ import annotations

import ipaddress
from typing import TYPE_CHECKING, Dict, List, Tuple

if TYPE_CHECKING:
    from .models import Router
    from .simulator import Network


def _bgp_routers(net: "Network") -> List["Router"]:
    from .models import Router
    return [d for d in net.devices.values() if isinstance(d, Router) and d.bgp_asn is not None]


def _owner_iface(net: "Network", ip: str):
    """Return (router, interface) whose up interface owns `ip`, else None."""
    from .models import Router
    for d in net.devices.values():
        if not isinstance(d, Router):
            continue
        for i in d.interfaces.values():
            if i.is_up and i.ip == ip:
                return d, i
    return None


def sessions(net: "Network") -> List[Tuple["Router", str, "Router", str]]:
    """Established eBGP sessions as (r1, local_ip, r2, peer_ip).

    Requires reciprocal neighbour config, matching remote-as, and the peer IP
    reachable on a shared connected subnet."""
    routers = _bgp_routers(net)
    out = []
    seen = set()
    for r in routers:
        for nb in r.bgp_neighbors:
            peer_ip = nb["ip"]
            owner = _owner_iface(net, peer_ip)
            if owner is None:
                continue
            peer, peer_iface = owner
            if peer is r or peer.bgp_asn != nb.get("remote_as"):
                continue
            # local interface on the same subnet as the peer
            local_iface = next(
                (i for i in r.interfaces.values()
                 if i.is_up and i.network and peer_iface.network == i.network),
                None,
            )
            if local_iface is None:
                continue
            # peer must name us back with our AS
            if not any(n["ip"] == local_iface.ip and n.get("remote_as") == r.bgp_asn
                       for n in peer.bgp_neighbors):
                continue
            key = frozenset((id(r), id(peer)))
            if key in seen:
                continue
            seen.add(key)
            out.append((r, local_iface.ip, peer, peer_ip))
    return out


def compute(net: "Network") -> None:
    routers = _bgp_routers(net)
    for r in routers:
        r.bgp_routes = []
    if len(routers) < 2:
        return

    sess = sessions(net)
    # adjacency: router -> list of (peer, local_ip_on_link, peer_ip_on_link)
    adj: Dict[int, list] = {id(r): [] for r in routers}
    for r1, ip1, r2, ip2 in sess:
        adj[id(r1)].append((r2, ip1, ip2))
        adj[id(r2)].append((r1, ip2, ip1))

    # rib[id(router)][prefix] = {"as_path": [...], "next_hop": ip or None}
    rib: Dict[int, Dict[str, dict]] = {id(r): {} for r in routers}
    for r in routers:
        for netw, prefix in r.bgp_networks:
            block = ipaddress.ip_network(f"{netw}/{prefix}", strict=False)
            rib[id(r)][str(block)] = {"as_path": [], "next_hop": None}

    # iterate to convergence (bounded by router count)
    for _ in range(len(routers) + 1):
        changed = False
        for r in routers:
            for peer, local_ip, _peer_ip in adj[id(r)]:
                for prefix, route in list(rib[id(r)].items()):
                    out_path = [r.bgp_asn] + route["as_path"]
                    if peer.bgp_asn in out_path:  # loop prevention
                        continue
                    # do not advertise a prefix the peer already owns/connects
                    block = ipaddress.ip_network(prefix)
                    if _is_connected(peer, block):
                        continue
                    cur = rib[id(peer)].get(prefix)
                    cand = {"as_path": out_path, "next_hop": local_ip}
                    if cur is None or len(out_path) < len(cur["as_path"]) or (
                        len(out_path) == len(cur["as_path"]) and out_path < cur["as_path"]
                    ):
                        # don't override a locally originated route
                        if cur is not None and not cur["as_path"]:
                            continue
                        rib[id(peer)][prefix] = cand
                        changed = True
        if not changed:
            break

    for r in routers:
        for prefix, route in rib[id(r)].items():
            if not route["as_path"] or route["next_hop"] is None:
                continue  # locally originated / connected
            block = ipaddress.ip_network(prefix)
            r.bgp_routes.append(
                (str(block.network_address), block.prefixlen, route["next_hop"], list(route["as_path"]))
            )


def _is_connected(router: "Router", block: ipaddress.IPv4Network) -> bool:
    for i in router.interfaces.values():
        if i.is_up and i.network and i.network == block:
            return True
    return False


def summary(net: "Network", rt: "Router") -> List[dict]:
    """`show ip bgp summary` rows: neighbour, remote-as, state, prefixes received."""
    compute(net)
    established = set()
    for r1, _ip1, r2, _ip2 in sessions(net):
        established.add((id(r1), id(r2)))
        established.add((id(r2), id(r1)))
    rows = []
    for nb in rt.bgp_neighbors:
        owner = _owner_iface(net, nb["ip"])
        up = owner is not None and (id(rt), id(owner[0])) in established
        received = sum(1 for _n, _p, nh, _ap in rt.bgp_routes
                       if owner and nh in {i.ip for i in owner[0].interfaces.values()})
        rows.append({
            "neighbor": nb["ip"],
            "remote_as": nb.get("remote_as"),
            "state": "Established" if up else "Idle",
            "prefixes": received if up else 0,
        })
    return rows
