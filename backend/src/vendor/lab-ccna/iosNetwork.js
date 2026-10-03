// iosNetwork.js — ping and traceroute simulation

export function doPing(parts, state) {
  const target = parts[1] || "?";
  if (target === "?") return { output: "  WORD  Ping destination address or hostname", state };
  // Validate IP format
  const ipMatch = target.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipMatch) return { output: `Translating "${target}"...domain server (255.255.255.255)\n% Unrecognized host or address, or protocol not running.`, state };

  const targetIp = target;
  const targetOctets = ipMatch.slice(1).map(Number);
  if (targetOctets.some(o => o > 255)) {
    return { output: `% Invalid address: ${target}`, state };
  }

  // Helper: convert IP+mask to network
  const ipToNum = (ip) => { const p = ip.split(".").map(Number); return ((p[0]<<24)|(p[1]<<16)|(p[2]<<8)|p[3]) >>> 0; };
  const cidrToMask = (cidr) => cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0;
  const maskToCidr = (mask) => {
    const m = ipToNum(mask);
    let bits = 0; let n = m;
    while (n) { bits += n & 1; n >>>= 1; }
    return bits;
  };
  const targetNum = ipToNum(targetIp);

  // Check directly connected subnets
  let reachable = false;
  let viaInterface = null;

  for (const [ifName, ifInfo] of Object.entries(state.interfaces)) {
    if (!ifInfo.ip || ifInfo.ip === "dhcp" || ifInfo.status === "administratively down") continue;
    const ipParts = ifInfo.ip.split("/");
    const ifIp = ipParts[0];
    const cidr = parseInt(ipParts[1] || "24");
    const ifNum = ipToNum(ifIp);
    const mask = cidrToMask(cidr);

    // Ping own interface
    if (ifIp === targetIp) { reachable = true; viaInterface = ifName; break; }
    // Same subnet
    if ((ifNum & mask) === (targetNum & mask)) { reachable = true; viaInterface = ifName; break; }
  }

  // Check static routes
  if (!reachable) {
    for (const route of state.staticRoutes) {
      // route format: "ip route <network> <mask> <nexthop> [<ad>]"
      const rp = route.split(/\s+/);
      if (rp.length >= 5) {
        const netNum = ipToNum(rp[2]);
        const maskNum = ipToNum(rp[3]);
        if ((targetNum & maskNum) === (netNum & maskNum)) {
          reachable = true;
          viaInterface = "static route → " + rp[4];
          break;
        }
      }
    }
  }

  // Check default route (0.0.0.0 0.0.0.0)
  if (!reachable) {
    const hasDefault = state.staticRoutes.some(r => r.includes("0.0.0.0 0.0.0.0"));
    if (hasDefault) { reachable = true; viaInterface = "default route"; }
  }

  // Check OSPF networks (simplified: if we have OSPF config, assume learned routes work)
  if (!reachable && state.ospfConfig.networks && state.ospfConfig.networks.length > 0) {
    reachable = true;
    viaInterface = "OSPF";
  }

  // Check loopback (always pingable from self)
  if (!reachable) {
    if (targetIp === "127.0.0.1") { reachable = true; viaInterface = "loopback"; }
  }

  if (reachable) {
    const rtt1 = Math.floor(Math.random() * 4) + 1;
    const rtt2 = Math.floor(Math.random() * 4) + 1;
    const rtt3 = Math.floor(Math.random() * 4) + 2;
    return {
      output: `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${targetIp}, timeout is 2 seconds:\n!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = ${rtt1}/${rtt2}/${rtt3} ms`,
      state
    };
  } else {
    return {
      output: `Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ${targetIp}, timeout is 2 seconds:\n.....\nSuccess rate is 0 percent (0/5)`,
      state
    };
  }
}

export function doTraceroute(parts, state) {
  const target = parts[1] || "?";
  if (target === "?") return { output: "  WORD  Trace route to destination address", state };
  // Use doPing logic simplified
  const pingResult = doPing(parts, state);
  if (pingResult.output.includes("100 percent")) {
    return {
      output: `Type escape sequence to abort.\nTracing the route to ${target}\nVRF info: (vrf in name/id, vrf out name/id)\n  1 ${target} 4 msec 4 msec 4 msec`,
      state
    };
  }
  return {
    output: `Type escape sequence to abort.\nTracing the route to ${target}\nVRF info: (vrf in name/id, vrf out name/id)\n  1  *  *  *\n  2  *  *  *\n  3  *  *  *`,
    state
  };
}


