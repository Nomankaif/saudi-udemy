"""Phase 13: WAN / SD-WAN / QoS / data-center & cloud overlays.

Self-contained, dependency-free models of the technologies a WAN / SD-WAN /
solution-architect engineer works with. Each area is a set of pure functions
over plain dicts/dataclasses so it is fully unit-testable and safe to expose
over the API without touching the L2/L3 data-plane engine:

* **PPP / PPPoE** -- LCP -> (PAP/CHAP) auth -> IPCP, and PPPoE discovery (PADI/
  PADO/PADR/PADS).
* **QoS** -- classification, DSCP marking, single-rate token-bucket policing,
  shaping, and LLQ/CBWFQ scheduling.
* **SD-WAN** -- TLOCs, OMP best-path, BFD liveness per transport, and
  application-aware (SLA) path selection across MPLS/Internet/LTE.
* **VXLAN / EVPN** -- VTEPs, VNIs, BGP-EVPN type-2 MAC learning and VXLAN
  forwarding / BUM flooding.
* **MPLS / Segment Routing** -- LDP label assignment along an LSP (with PHP)
  and SR SID-list -> label-stack resolution.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple


# --------------------------------------------------------------------------- #
# PPP / PPPoE
# --------------------------------------------------------------------------- #
def ppp_negotiate(auth: str = "none",
                  client: Optional[dict] = None,
                  server_users: Optional[dict] = None) -> dict:
    """Bring up a PPP link: LCP -> optional PAP/CHAP auth -> IPCP.

    ``client`` = {"username","password"}; ``server_users`` = {user: password}.
    """
    steps = ["LCP-ConfReq", "LCP-ConfAck"]
    auth = (auth or "none").lower()
    if auth in ("pap", "chap"):
        steps.append(f"auth-{auth}-challenge" if auth == "chap" else "auth-pap-request")
        ok = bool(client and server_users
                  and server_users.get(client.get("username")) == client.get("password"))
        if not ok:
            return {"up": False, "auth": auth, "phase": "terminate",
                    "steps": steps + [f"auth-{auth}-nak"]}
        steps.append(f"auth-{auth}-ack")
    steps += ["IPCP-ConfReq", "IPCP-ConfAck"]
    return {"up": True, "auth": auth, "phase": "IPCP-open", "steps": steps}


def pppoe_session(auth: str = "none",
                  client: Optional[dict] = None,
                  server_users: Optional[dict] = None,
                  session_id: int = 1) -> dict:
    """PPPoE: discovery (PADI/PADO/PADR/PADS) then a PPP session on top."""
    discovery = ["PADI", "PADO", "PADR", "PADS"]
    ppp = ppp_negotiate(auth, client, server_users)
    return {"discovery": discovery, "session_id": session_id,
            "up": ppp["up"], "ppp": ppp}


# --------------------------------------------------------------------------- #
# QoS
# --------------------------------------------------------------------------- #
def classify(packet: dict, classes: List[dict]) -> str:
    """Return the first matching class name (Cisco MQC), else 'class-default'.

    A class is {"name", "match": {"dscp"?, "protocol"?, "port"?}}; all present
    match keys must equal the packet's fields.
    """
    for cls in classes:
        m = cls.get("match", {})
        if all(packet.get(k) == v for k, v in m.items()):
            return cls["name"]
    return "class-default"


def mark_dscp(name: str) -> int:
    """Map a common PHB name to its DSCP value."""
    table = {"ef": 46, "af11": 10, "af21": 18, "af31": 26, "af41": 34,
             "cs1": 8, "cs5": 40, "cs6": 48, "default": 0, "be": 0}
    return table.get(name.lower(), 0)


def police(packets: List[Tuple[float, int]], cir_bps: int, bc_bytes: int) -> dict:
    """Single-rate token-bucket policer.

    ``packets`` = [(arrival_time_s, size_bytes), ...] in time order. Tokens
    refill at ``cir_bps`` and the bucket holds ``bc_bytes``. Conforming packets
    are forwarded; exceeding packets are dropped.
    """
    tokens = float(bc_bytes)
    last = packets[0][0] if packets else 0.0
    conform = exceed = 0
    conform_bytes = exceed_bytes = 0
    for t, size in packets:
        tokens = min(float(bc_bytes), tokens + (cir_bps / 8.0) * (t - last))
        last = t
        if tokens >= size:
            tokens -= size
            conform += 1
            conform_bytes += size
        else:
            exceed += 1
            exceed_bytes += size
    return {"conform": conform, "exceed": exceed,
            "conform_bytes": conform_bytes, "exceed_bytes": exceed_bytes,
            "tokens_left": round(tokens, 2)}


def llq_schedule(queues: List[dict], rounds: int = 1) -> List[str]:
    """Low-Latency Queueing: strict-priority queues drain fully first, then the
    rest are serviced by weight (CBWFQ). Returns the dequeue order of packets.

    ``queues`` = [{"name", "priority": bool, "weight": int, "packets": int}].
    """
    order: List[str] = []
    for q in sorted(queues, key=lambda x: not x.get("priority")):
        if q.get("priority"):
            order += [q["name"]] * int(q.get("packets", 0))
    # remaining (non-priority) queues: weighted round robin
    cbwfq = [dict(q) for q in queues if not q.get("priority")]
    for _ in range(rounds):
        for q in cbwfq:
            take = min(int(q.get("weight", 1)), q["packets"])
            order += [q["name"]] * take
            q["packets"] -= take
    return order


# --------------------------------------------------------------------------- #
# SD-WAN
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Tloc:
    system_ip: str
    color: str          # mpls | biz-internet | lte | public-internet ...
    encap: str = "ipsec"  # ipsec | gre


@dataclass
class SdwanPath:
    tloc: Tloc
    loss: float = 0.0      # percent
    latency: float = 0.0   # ms
    jitter: float = 0.0    # ms
    up: bool = True
    preference: int = 0    # OMP/control preference (higher wins)


def bfd_state(path: SdwanPath, transport_up: bool = True) -> str:
    """A tunnel's BFD session is 'up' only if the transport is up and the path
    is administratively up."""
    return "up" if (transport_up and path.up) else "down"


def omp_best_path(paths: List[SdwanPath]) -> Optional[SdwanPath]:
    """OMP best-path: only up paths, highest preference, then lowest latency,
    then lowest loss (a simplified but faithful tie-break order)."""
    live = [p for p in paths if p.up]
    if not live:
        return None
    return sorted(live, key=lambda p: (-p.preference, p.latency, p.loss))[0]


def meets_sla(path: SdwanPath, sla: dict) -> bool:
    return (path.loss <= sla.get("max_loss", 100)
            and path.latency <= sla.get("max_latency", 1e9)
            and path.jitter <= sla.get("max_jitter", 1e9))


def app_aware_route(paths: List[SdwanPath], sla: dict,
                    preferred_colors: Optional[List[str]] = None) -> dict:
    """Application-aware routing: among up paths that meet the SLA, prefer the
    listed colors in order; otherwise pick the OMP best path. Falls back to the
    best available (least-bad) path if none meet the SLA (brown-out)."""
    live = [p for p in paths if p.up]
    eligible = [p for p in live if meets_sla(p, sla)]
    pool = eligible or live
    chosen = None
    if preferred_colors:
        for color in preferred_colors:
            for p in pool:
                if p.tloc.color == color:
                    chosen = p
                    break
            if chosen:
                break
    if chosen is None:
        chosen = omp_best_path(pool)
    return {
        "chosen": chosen,
        "sla_met": bool(chosen and meets_sla(chosen, sla)),
        "fallback": bool(chosen and not eligible),
        "eligible_colors": [p.tloc.color for p in eligible],
    }


# --------------------------------------------------------------------------- #
# VXLAN / EVPN
# --------------------------------------------------------------------------- #
@dataclass
class VxlanFabric:
    vteps: Dict[str, str] = field(default_factory=dict)      # vtep name -> loopback IP
    # EVPN type-2 (MAC) table: (vni, mac) -> vtep name
    mac_table: Dict[Tuple[int, str], str] = field(default_factory=dict)
    vni_members: Dict[int, set] = field(default_factory=dict)  # vni -> {vtep names}

    def add_vtep(self, name: str, ip: str, vnis: List[int]) -> None:
        self.vteps[name] = ip
        for vni in vnis:
            self.vni_members.setdefault(vni, set()).add(name)

    def evpn_advertise(self, vtep: str, vni: int, mac: str) -> dict:
        """BGP-EVPN type-2 route: VTEP advertises a locally-learned MAC."""
        self.mac_table[(vni, mac.upper())] = vtep
        return {"route_type": 2, "vni": vni, "mac": mac.upper(), "next_hop": vtep}

    def forward(self, src_vtep: str, vni: int, dst_mac: str) -> dict:
        """VXLAN forwarding decision for a frame entering at ``src_vtep``."""
        remote = self.mac_table.get((vni, dst_mac.upper()))
        if remote is None:
            flood = sorted(self.vni_members.get(vni, set()) - {src_vtep})
            return {"action": "flood", "vni": vni, "vteps": flood}
        if remote == src_vtep:
            return {"action": "local", "vni": vni, "vtep": remote}
        return {"action": "unicast", "vni": vni,
                "encap": {"outer_src": self.vteps[src_vtep],
                          "outer_dst": self.vteps[remote], "vni": vni}}


# --------------------------------------------------------------------------- #
# MPLS / Segment Routing
# --------------------------------------------------------------------------- #
def ldp_lsp(path: List[str], fec: str, base_label: int = 16,
            php: bool = True) -> dict:
    """Assign LDP labels along an ordered router path for one FEC and return the
    per-hop label operation (push at ingress, swap in the core, pop/PHP at the
    penultimate hop)."""
    n = len(path)
    # each router (except egress) allocates a local label for the FEC
    labels = {path[i]: base_label + i for i in range(max(n - 1, 0))}
    hops = []
    for i in range(n - 1):
        here, nxt = path[i], path[i + 1]
        is_penultimate = (i == n - 2)
        if i == 0:
            op = "push"
            out = "implicit-null" if (is_penultimate and php) else labels.get(nxt)
        elif is_penultimate and php:
            op = "pop"  # penultimate hop popping (PHP)
            out = "implicit-null"
        else:
            op = "swap"
            out = labels.get(nxt)
        hops.append({"router": here, "op": op, "in_label": labels.get(here),
                     "out_label": out, "next_hop": nxt})
    return {"fec": fec, "path": path, "egress": path[-1] if path else None,
            "hops": hops}


def sr_resolve(sid_list: List[dict], node_sids: Dict[str, int]) -> dict:
    """Resolve a Segment Routing SID list into an MPLS label stack.

    ``sid_list`` entries are {"type":"node"|"adj","node"?,"label"?}. Node SIDs
    are looked up in ``node_sids`` (prefix-SID = base + index style already
    resolved by the caller); adjacency SIDs carry an explicit label.
    """
    stack = []
    for sid in sid_list:
        if sid["type"] == "node":
            label = node_sids[sid["node"]]
        elif sid["type"] == "adj":
            label = sid["label"]
        else:
            raise ValueError(f"unknown SID type {sid['type']}")
        stack.append(label)
    return {"label_stack": stack, "top_label": stack[0] if stack else None,
            "segments": len(stack)}
