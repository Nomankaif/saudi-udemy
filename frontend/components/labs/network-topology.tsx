"use client";
import { Device, LabLink } from "./types";
import { DeviceSymbol } from "./device-symbol";

// Clip cables to the device silhouette instead of drawing through its centre.
export function deviceAnchor(type: string, from: { x: number; y: number }, to: { x: number; y: number }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!dx && !dy) return from;
  let scale = 1 / Math.sqrt((dx / 40) ** 2 + (dy / 30) ** 2);
  if (type !== "router") {
    const corners = type === "switch" ? [[-45, -8], [-32, -25], [45, -25], [45, 9], [32, 26], [-45, 26]] : [[-37, -34], [37, -34], [37, 17], [-37, 17]];
    for (let i = 0; i < corners.length; i++) {
      const [x, y] = corners[i]!, [nextX, nextY] = corners[(i + 1) % corners.length]!;
      const sx = nextX! - x!, sy = nextY! - y!, denominator = dx * sy - dy * sx;
      if (Math.abs(denominator) < .001) continue;
      const distance = (x! * sy - y! * sx) / denominator, segment = (x! * dy - y! * dx) / denominator;
      if (distance > 0 && segment >= 0 && segment <= 1) { scale = distance; break; }
    }
  }
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

export function NetworkTopology({ devices, links, active, onSelect }: { devices: Device[]; links: LabLink[]; active?: string; onSelect?: (name: string) => void }) {
  const positions = new Map(devices.map((d, i) => {
    const angle = 2 * Math.PI * i / Math.max(devices.length, 1) - Math.PI / 2;
    return [d.name, { x: devices.length === 1 ? 330 : 330 + 220 * Math.cos(angle), y: devices.length === 1 ? 200 : 202 + 118 * Math.sin(angle), type: d.type }];
  }));
  const short = (name: string) => name.replace("GigabitEthernet", "Gi").replace("FastEthernet", "Fa").replace("Ethernet", "Eth");
  return <svg role="group" aria-label="Physical network topology" viewBox="0 0 660 440" className="w-full rounded-lg border border-slate-200 bg-white" fontFamily="Arial, sans-serif">
    {links.map((l, i) => { const a = positions.get(l.fromDevice), b = positions.get(l.toDevice); if (!a || !b) return null;
      const pair = [l.fromDevice, l.toDevice].sort().join("|");
      const parallel = links.map((edge, index) => ({ edge, index })).filter(({ edge }) => [edge.fromDevice, edge.toDevice].sort().join("|") === pair);
      const slot = parallel.findIndex(edge => edge.index === i) - (parallel.length - 1) / 2;
      const direction = l.fromDevice < l.toDevice ? 1 : -1;
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const offsetX = -(b.y - a.y) / length * slot * 60 * direction, offsetY = (b.x - a.x) / length * slot * 60 * direction;
      const control = { x: (a.x + b.x) / 2 + offsetX, y: (a.y + b.y) / 2 + offsetY };
      const start = deviceAnchor(a.type, a, control), end = deviceAnchor(b.type, b, control);
      return <g key={i}>
      <path d={`M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`} fill="none" stroke="#94a3b8" strokeWidth={1.8} />
      <text textAnchor="middle" x={a.x * .67 + b.x * .33 + offsetX * .55} y={a.y * .67 + b.y * .33 + offsetY * .55 - 10} fontSize={11} fill="#475569" stroke="white" strokeWidth={5} paintOrder="stroke" strokeLinejoin="round">{short(l.fromInterface)}</text>
      <text textAnchor="middle" x={a.x * .33 + b.x * .67 + offsetX * .55} y={a.y * .33 + b.y * .67 + offsetY * .55 - 10} fontSize={11} fill="#475569" stroke="white" strokeWidth={5} paintOrder="stroke" strokeLinejoin="round">{short(l.toInterface)}</text>
    </g>; })}
    {devices.map(d => { const p = positions.get(d.name)!; const enabled = Boolean(onSelect) && d.console !== false; const label = d.type === "host" || d.type === "pc" ? "PC" : d.type === "switch" ? "Switch" : "Router"; return <g key={d.name} transform={`translate(${p.x},${p.y})`} role={enabled ? "button" : "img"} aria-pressed={enabled ? active === d.name : undefined} aria-label={`${d.name}, ${label}${d.console === false ? ", preconfigured" : enabled ? ", open console" : ""}`} tabIndex={enabled ? 0 : undefined} onClick={() => { if (enabled) onSelect?.(d.name); }} onKeyDown={e => { if (enabled && ["Enter", " "].includes(e.key)) { e.preventDefault(); onSelect?.(d.name); } }} className={enabled ? "group cursor-pointer outline-none" : ""}>
      <title>{`${d.name} · ${label}${d.console === false ? " · Preconfigured device" : enabled ? " · Open console" : ""}`}</title>
      <rect x={-54} y={-43} width={108} height={94} rx={12} fill={active === d.name ? "#eff6ff" : "white"} fillOpacity={active === d.name ? .55 : 0} stroke={active === d.name ? "#2563eb" : "transparent"} strokeWidth={1.5} className="group-hover:stroke-blue-300 group-focus-visible:stroke-blue-600 group-focus-visible:stroke-[3]" />
      <DeviceSymbol type={d.type} />
      <text textAnchor="middle" y={66} fontSize={14} fontWeight={600} fill={active === d.name ? "#1d4ed8" : "#0f172a"} stroke="white" strokeWidth={5} paintOrder="stroke" strokeLinejoin="round">{d.name.length > 20 ? `${d.name.slice(0, 18)}…` : d.name}</text>
      <text textAnchor="middle" y={82} fontSize={11} fill="#64748b" stroke="white" strokeWidth={4} paintOrder="stroke">{label}{d.console === false ? " · Locked" : ""}</text>
    </g>; })}
  </svg>;
}
