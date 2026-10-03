"""Phase 12: wireless (802.11) modelling.

Pure functions over the topology objects that model the wireless *control and
auth plane* the way a wireless engineer reasons about it:

* an **RF model** (free-space path loss) -> per-link RSSI and AP coverage radius;
* **802.11 association**: scan -> select best AP -> authenticate;
* **security**: open / WPA2-PSK (4-way handshake) / WPA3-SAE (dragonfly);
* **CAPWAP/WLC**: lightweight APs join a controller and inherit its WLANs;
* **roaming** between APs with hysteresis as a client moves;
* **WMM** QoS access-category classification.

No external dependencies, so it runs on Scalingo's free tier unchanged.
"""
from __future__ import annotations

import math
from typing import TYPE_CHECKING, List, Optional

from .models import AccessPoint, WirelessClient, WirelessLANController

if TYPE_CHECKING:
    from .simulator import Network

RX_SENSITIVITY = -82.0  # dBm; below this a client cannot decode the AP
ROAM_HYSTERESIS = 8.0    # dB a candidate AP must beat the current one by to roam


# --------------------------------------------------------------------------- #
# RF model
# --------------------------------------------------------------------------- #
def distance(a, b) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def path_loss(d: float, band: str = "2.4") -> float:
    """Log-distance path loss in dB. ~40 dB at 1 m for 2.4 GHz, +6.6 dB for 5 GHz."""
    d = max(d, 1.0)
    base = 40.05 + 20.0 * math.log10(d)
    return base + (6.6 if str(band).startswith("5") else 0.0)


def rssi(ap: AccessPoint, client: WirelessClient) -> float:
    """Received signal strength (dBm) of ``ap`` as seen by ``client``."""
    return round(ap.tx_power - path_loss(distance(ap, client), ap.band), 1)


def in_range(ap: AccessPoint, client: WirelessClient) -> bool:
    return rssi(ap, client) >= RX_SENSITIVITY


def coverage_radius(ap: AccessPoint) -> float:
    """Distance (model units) at which RSSI drops to the receive sensitivity."""
    budget = ap.tx_power - RX_SENSITIVITY - (6.6 if str(ap.band).startswith("5") else 0.0)
    return round(10.0 ** ((budget - 40.05) / 20.0), 1)


# --------------------------------------------------------------------------- #
# advertised SSIDs (local + WLC-pushed)
# --------------------------------------------------------------------------- #
def advertised_ssids(ap: AccessPoint) -> dict:
    """SSIDs an AP is currently broadcasting (its own; a CAPWAP-joined AP runs
    the controller's WLANs, already copied into ``ap.ssids`` on join)."""
    return dict(ap.ssids)


# --------------------------------------------------------------------------- #
# scan / associate / authenticate
# --------------------------------------------------------------------------- #
def scan(net: "Network", client: WirelessClient) -> List[dict]:
    """All APs the client can hear, with the SSIDs each advertises, by RSSI."""
    found = []
    for dev in net.devices.values():
        if not isinstance(dev, AccessPoint):
            continue
        if not in_range(dev, client):
            continue
        sig = rssi(dev, client)
        for ssid, cfg in advertised_ssids(dev).items():
            if cfg.get("hidden"):
                continue
            found.append({"ap": dev.name, "ssid": ssid, "rssi": sig,
                          "auth": cfg.get("auth", "open"), "band": dev.band,
                          "channel": dev.channel})
    found.sort(key=lambda r: r["rssi"], reverse=True)
    return found


def _authenticate(ap: AccessPoint, client: WirelessClient, ssid: str) -> dict:
    """Run the auth/key exchange for one (ap, ssid). Returns a result dict with
    the 802.11 state-machine steps so it can be visualised."""
    cfg = ap.ssids.get(ssid)
    steps = ["probe-request", "probe-response", "open-auth", "assoc-request",
             "assoc-response"]
    auth = cfg.get("auth", "open")
    if auth == "open":
        return {"ok": True, "authenticated": True, "key_installed": False,
                "sae": False, "steps": steps}

    supplied = client.profiles.get(ssid)
    if supplied is None:
        return {"ok": False, "reason": "no credentials for SSID", "steps": steps}
    if supplied != cfg.get("psk"):
        return {"ok": False, "reason": "PSK mismatch (auth failed)",
                "steps": steps + ["4way-msg1", "4way-msg2-deauth"]}

    if auth == "wpa3-sae":
        steps += ["sae-commit", "sae-confirm", "4way-msg1", "4way-msg2",
                  "4way-msg3", "4way-msg4"]
        return {"ok": True, "authenticated": True, "key_installed": True,
                "sae": True, "steps": steps}
    # wpa2-psk: PSK -> PMK -> 4-way handshake derives PTK
    steps += ["4way-msg1", "4way-msg2", "4way-msg3", "4way-msg4"]
    return {"ok": True, "authenticated": True, "key_installed": True,
            "sae": False, "steps": steps}


def associate(net: "Network", client_name: str, ssid: Optional[str] = None) -> dict:
    """Associate a client to the best in-range AP for an SSID it knows.

    If ``ssid`` is None, the strongest SSID the client has a profile for (or any
    open SSID) is chosen."""
    client = net.devices.get(client_name)
    if not isinstance(client, WirelessClient):
        return {"ok": False, "error": "not a wireless client"}

    candidates = scan(net, client)
    if ssid is not None:
        candidates = [c for c in candidates if c["ssid"] == ssid]
    else:
        candidates = [c for c in candidates
                      if c["auth"] == "open" or c["ssid"] in client.profiles]
    if not candidates:
        client.assoc = None
        return {"ok": False, "error": "no suitable AP/SSID in range"}

    best = candidates[0]
    ap = net.devices[best["ap"]]
    res = _authenticate(ap, client, best["ssid"])
    if not res["ok"]:
        client.assoc = None
        ap.associations.pop(client_name, None)
        return {"ok": False, "error": res.get("reason", "auth failed"),
                "ap": ap.name, "ssid": best["ssid"], "steps": res["steps"]}

    record = {"ap": ap.name, "ssid": best["ssid"], "rssi": best["rssi"],
              "authenticated": res["authenticated"],
              "key_installed": res["key_installed"], "sae": res["sae"]}
    client.assoc = record
    ap.associations[client_name] = {k: record[k] for k in
                                    ("ssid", "rssi", "authenticated", "key_installed", "sae")}
    return {"ok": True, "steps": res["steps"], **record}


def roam(net: "Network", client_name: str) -> dict:
    """Re-evaluate the best AP for the client's current SSID; switch if another
    AP beats the current one by the roaming hysteresis (or current is gone)."""
    client = net.devices.get(client_name)
    if not isinstance(client, WirelessClient) or client.assoc is None:
        return {"ok": False, "error": "client not associated"}

    ssid = client.assoc["ssid"]
    cur_ap = client.assoc["ap"]
    cands = [c for c in scan(net, client) if c["ssid"] == ssid]
    if not cands:
        # current AP out of range and nothing else -> disassociate
        old = client.assoc
        client.assoc = None
        ap = net.devices.get(cur_ap)
        if isinstance(ap, AccessPoint):
            ap.associations.pop(client_name, None)
        return {"ok": True, "roamed": False, "disassociated": True, "from": old["ap"]}

    best = cands[0]
    cur_rssi = next((c["rssi"] for c in cands if c["ap"] == cur_ap), -999.0)
    if best["ap"] != cur_ap and best["rssi"] >= cur_rssi + ROAM_HYSTERESIS:
        old_ap = net.devices.get(cur_ap)
        if isinstance(old_ap, AccessPoint):
            old_ap.associations.pop(client_name, None)
        res = associate(net, client_name, ssid)
        client.roam_log.append({"from": cur_ap, "to": best["ap"], "ssid": ssid,
                                "rssi": best["rssi"]})
        return {"ok": res["ok"], "roamed": True, "from": cur_ap, "to": best["ap"],
                "rssi": best["rssi"]}
    # stay; refresh signal
    client.assoc["rssi"] = cur_rssi
    return {"ok": True, "roamed": False, "ap": cur_ap, "rssi": cur_rssi}


def move(net: "Network", client_name: str, x: float, y: float) -> dict:
    """Move a client and auto-roam (or associate if it wasn't connected)."""
    client = net.devices.get(client_name)
    if not isinstance(client, WirelessClient):
        return {"ok": False, "error": "not a wireless client"}
    client.x, client.y = float(x), float(y)
    if client.assoc is None:
        return associate(net, client_name)
    return roam(net, client_name)


# --------------------------------------------------------------------------- #
# CAPWAP / WLC
# --------------------------------------------------------------------------- #
def capwap_join(net: "Network", ap_name: str, wlc_name: str) -> dict:
    """Lightweight AP joins a WLC: Idle -> Discovery -> Join -> Run, then the
    controller's WLANs are pushed onto the AP."""
    ap = net.devices.get(ap_name)
    wlc = net.devices.get(wlc_name)
    if not isinstance(ap, AccessPoint):
        return {"ok": False, "error": "not an AP"}
    if not isinstance(wlc, WirelessLANController):
        return {"ok": False, "error": "not a WLC"}
    ap.wlc = wlc_name
    ap.capwap_state = "Run"
    if ap_name not in wlc.aps:
        wlc.aps.append(ap_name)
    # push WLANs from controller to AP
    for ssid, cfg in wlc.wlans.items():
        ap.ssids[ssid] = dict(cfg)
    states = ["Idle", "Discovery", "Join", "Image-Data", "Config", "Run"]
    return {"ok": True, "ap": ap_name, "wlc": wlc_name, "state": "Run",
            "transitions": states, "pushed_ssids": list(wlc.wlans)}


# --------------------------------------------------------------------------- #
# WMM (Wi-Fi Multimedia) QoS access categories
# --------------------------------------------------------------------------- #
_WMM_AC = {  # DSCP -> access category
    46: "voice", 34: "video", 26: "video", 0: "best-effort", 8: "background",
}


def wmm_access_category(dscp: int) -> str:
    """Map a DSCP marking to a WMM access category (AC_VO/VI/BE/BK)."""
    if dscp in _WMM_AC:
        return _WMM_AC[dscp]
    if dscp >= 40:
        return "voice"
    if dscp >= 24:
        return "video"
    if dscp <= 8 and dscp > 0:
        return "background"
    return "best-effort"


# --------------------------------------------------------------------------- #
# data-plane reachability gate
# --------------------------------------------------------------------------- #
def client_online(net: "Network", client_name: str) -> dict:
    """Whether an associated client is actually on the network: associated,
    authenticated, key installed (for secured SSIDs) and the AP's wired uplink
    is up."""
    client = net.devices.get(client_name)
    if not isinstance(client, WirelessClient) or client.assoc is None:
        return {"online": False, "reason": "not associated"}
    a = client.assoc
    ap = net.devices.get(a["ap"])
    if not isinstance(ap, AccessPoint):
        return {"online": False, "reason": "AP missing"}
    cfg = ap.ssids.get(a["ssid"], {})
    secured = cfg.get("auth", "open") != "open"
    if secured and not a.get("key_installed"):
        return {"online": False, "reason": "keys not installed"}
    if not a.get("authenticated"):
        return {"online": False, "reason": "not authenticated"}
    if not ap.uplink.is_up:
        return {"online": False, "reason": "AP uplink down"}
    return {"online": True, "ap": ap.name, "ssid": a["ssid"], "rssi": a["rssi"]}


def status(net: "Network") -> dict:
    """Summary of all wireless devices for `show`-style output / the API."""
    aps, clients, wlcs = [], [], []
    for dev in net.devices.values():
        if isinstance(dev, AccessPoint):
            aps.append({"name": dev.name, "band": dev.band, "channel": dev.channel,
                        "tx_power": dev.tx_power, "wlc": dev.wlc,
                        "capwap": dev.capwap_state, "ssids": list(dev.ssids),
                        "coverage_radius": coverage_radius(dev),
                        "clients": list(dev.associations)})
        elif isinstance(dev, WirelessClient):
            clients.append({"name": dev.name, "assoc": dev.assoc,
                            "online": client_online(net, dev.name)["online"],
                            "roams": len(dev.roam_log)})
        elif isinstance(dev, WirelessLANController):
            wlcs.append({"name": dev.name, "wlans": list(dev.wlans), "aps": dev.aps})
    return {"aps": aps, "clients": clients, "wlcs": wlcs}
