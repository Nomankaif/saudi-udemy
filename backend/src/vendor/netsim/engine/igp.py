"""Distance-vector IGPs: EIGRP and RIP, plus simple route redistribution.

Both protocols share one compute kernel: routers running the protocol form
adjacencies on shared subnets that match a `network` statement on both ends;
shortest paths by hop metric then install routes (EIGRP admin distance 90,
RIP 120 with a 15-hop diameter limit). Redistribution lets a router inject
prefixes it knows from another source (connected, static, ospf, bgp, the other
IGP) so peers in the target protocol learn them too."""
from __future__ import annotations

import heapq
import ipaddress
from typing import TYPE_CHECKING, Dict, List, Tuple

if TYPE_CHECKING:
    from .models import Router
    from .simulator import Network

RIP_INFINITY = 16  # hop count that means unreachable


def _running(net: "Network", proto: str) -> List["Router"]:
    from .models import Router
    out = []
    for d in net.devices.values():
        if not isinstance(d, Router):
            continue
        if proto == "eigrp" and d.eigrp_asn is not None:
            out.append(d)
        elif proto == "rip" and d.rip_enabled:
            out.append(d)
    return out


def _networks(r: "Router", proto: str) -> List[tuple]:
    return r.eigrp_networks if proto == "eigrp" else r.rip_networks


def _participates(r: "Router", iface, proto: str) -> bool:
    """True if `iface` is covered by one of the protocol's network statements."""
    if not (iface.is_up and iface.network and iface.ip):
        return False
    for netw, prefix in _networks(r, proto):
        block = ipaddress.ip_network(f"{netw}/{prefix}", strict=False)
        if ipaddress.ip_address(iface.ip) in block:
            return True
    return False


def _participating(r: "Router", proto: str) -> List:
    """All up interfaces on `r` covered by `proto`'s network statements."""
    return [i for i in r.interfaces.values() if _participates(r, i, proto)]


def _redistributed_origins(net: "Network", r: "Router", proto: str) -> Dict[str, int]:
    """Prefixes router `r` injects into `proto` from other sources -> seed metric."""
    sources = r.redistribute.get(proto, set())
    if not sources:
        return {}
    out: Dict[str, int] = {}
    if "connected" in sources:
        for i in r.interfaces.values():
            if i.is_up and i.network and not _participates(r, i, proto):
                out[str(i.network)] = 1
    if "static" in sources:
        for n, p, _nh in r.static_routes:
            out[str(ipaddress.ip_network(f"{n}/{p}", strict=False))] = 1
    if "ospf" in sources:
        for n, p, _nh, _c in r.ospf_routes:
            out[str(ipaddress.ip_network(f"{n}/{p}", strict=False))] = 1
    if "bgp" in sources:
        for n, p, _nh, _ap in r.bgp_routes:
            out[str(ipaddress.ip_network(f"{n}/{p}", strict=False))] = 1
    if "eigrp" in sources:
        for n, p, _nh, _m in r.eigrp_routes:
            out[str(ipaddress.ip_network(f"{n}/{p}", strict=False))] = 1
    if "rip" in sources:
        for n, p, _nh, _m in r.rip_routes:
            out[str(ipaddress.ip_network(f"{n}/{p}", strict=False))] = 1
    return out


def _compute(net: "Network", proto: str) -> None:
    routers = _running(net, proto)
    attr = "eigrp_routes" if proto == "eigrp" else "rip_routes"
    for r in routers:
        setattr(r, attr, [])
    if len(routers) < 2:
        return

    parts = {r.name: [i for i in r.interfaces.values() if _participates(r, i, proto)]
             for r in routers}
    # adjacency: router -> [(neighbour, next_hop_ip_on_link)]
    adj: Dict[str, list] = {r.name: [] for r in routers}
    for r in routers:
        for i in parts[r.name]:
            for r2 in routers:
                if r2 is r:
                    continue
                for j in parts[r2.name]:
                    if j.network == i.network:
                        adj[r.name].append((r2, j.ip))

    # origin prefixes each router advertises: connected participating subnets
    # (seed 0) plus anything redistributed in (seed 1).
    origins: Dict[str, Dict[str, int]] = {}
    for r in routers:
        o: Dict[str, int] = {str(i.network): 0 for i in parts[r.name]}
        for pfx, seed in _redistributed_origins(net, r, proto).items():
            o.setdefault(pfx, seed)
        origins[r.name] = o

    for src in routers:
        dist = {src.name: 0}
        next_hop = {src.name: None}
        heap = [(0, src.name)]
        while heap:
            d, rn = heapq.heappop(heap)
            if d > dist.get(rn, float("inf")):
                continue
            for nb, nh_ip in adj[rn]:
                nd = d + 1
                if nd < dist.get(nb.name, float("inf")):
                    dist[nb.name] = nd
                    next_hop[nb.name] = nh_ip if rn == src.name else next_hop[rn]
                    heapq.heappush(heap, (nd, nb.name))

        local = {str(i.network) for i in src.interfaces.values() if i.is_up and i.network}
        best: Dict[str, Tuple[int, str]] = {}
        for r in routers:
            if r is src or r.name not in dist:
                continue
            for pfx, seed in origins[r.name].items():
                if pfx in local:
                    continue
                metric = dist[r.name] + seed
                if proto == "rip" and metric >= RIP_INFINITY:
                    continue
                nh = next_hop[r.name]
                if nh and (pfx not in best or metric < best[pfx][0]):
                    best[pfx] = (metric, nh)
        routes = []
        for pfx, (metric, nh) in best.items():
            block = ipaddress.ip_network(pfx)
            routes.append((str(block.network_address), block.prefixlen, nh, metric))
        setattr(src, attr, routes)


def compute(net: "Network") -> None:
    _compute(net, "eigrp")
    _compute(net, "rip")
