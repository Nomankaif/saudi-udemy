// Escaped, inert SVG. Edges come from explicit ports, never guessed IP subnets.
export function renderLabTopology(lab) {
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
  const positions = new Map(lab.devices.map((d, i) => {
    const angle = 2 * Math.PI * i / lab.devices.length - Math.PI / 2;
    return [d.name, { x: 330 + 235 * Math.cos(angle), y: 230 + 155 * Math.sin(angle) }];
  }));
  const edges = lab.links.map(l => {
    const a = positions.get(l.fromDevice), b = positions.get(l.toDevice);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#94a3b8" stroke-width="2"/><text x="${a.x * .73 + b.x * .27}" y="${a.y * .73 + b.y * .27 - 9}" font-size="10" fill="#475569">${esc(l.fromInterface)}</text><text x="${a.x * .27 + b.x * .73}" y="${a.y * .27 + b.y * .73 - 9}" font-size="10" fill="#475569">${esc(l.toInterface)}</text>`;
  }).join("");
  const nodes = lab.devices.map(d => { const p = positions.get(d.name); return `<g transform="translate(${p.x},${p.y})"><rect x="-33" y="-23" width="66" height="46" rx="${d.type === "router" ? 23 : 7}" fill="#fff" stroke="#334155" stroke-width="2"/><text y="5" font-size="14" font-weight="600" fill="#0f172a">${esc(d.name)}</text><text y="41" font-size="11" fill="#64748b">${d.type === "host" ? "PC" : esc(d.type)}</text></g>`; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 460" font-family="Arial,sans-serif" text-anchor="middle"><rect width="660" height="460" fill="#f8fafc"/>${edges}${nodes}</svg>`;
}
