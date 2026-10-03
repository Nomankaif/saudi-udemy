// Original SVG artwork, shared by student topology and the admin preview.
// Decorative details do not represent live interface/link status.
export function DeviceSymbol({ type }: { type: string }) {
  if (type === "host" || type === "pc") return <g aria-hidden="true" data-device-symbol="pc">
    <ellipse cx="0" cy="43" rx="45" ry="4" fill="#0f172a" opacity=".07" />
    <path d="M-6 13H6L8 28H-8Z" fill="#94a3b8" stroke="#64748b" />
    <path d="M-17 26H17L22 30H-22Z" fill="#cbd5e1" stroke="#64748b" strokeLinejoin="round" />
    <rect x="-37" y="-34" width="74" height="51" rx="4" fill="#334155" stroke="#1e293b" strokeWidth="1.5" />
    <rect x="-32" y="-29" width="64" height="36" rx="1" fill="#dbeafe" />
    <path d="M-32-29H10L-18 7H-32Z" fill="#eff6ff" />
    <path d="M-23-20H-6M-23-14H-13" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
    <path d="M-37 10H37V13Q37 17 33 17H-33Q-37 17-37 13Z" fill="#cbd5e1" />
    <circle cx="29" cy="13" r="1.4" fill="#64748b" />
    <path d="M-36 33H30L40 42H-45Z" fill="#e2e8f0" stroke="#64748b" strokeLinejoin="round" />
    <path d="M-29 36H25M-34 39H29M-24 36V39M-15 36V39M-6 36V39M3 36V39M12 36V39M21 36V39" stroke="#94a3b8" strokeWidth="1" />
  </g>;

  if (type === "switch") return <g aria-hidden="true" data-device-symbol="switch">
    <ellipse cx="0" cy="32" rx="47" ry="5" fill="#0f172a" opacity=".07" />
    <path d="M-45-8L-32-25H45L32-8Z" fill="#cbd5e1" stroke="#64748b" strokeLinejoin="round" />
    <path d="M32-8L45-25V9L32 26Z" fill="#64748b" stroke="#475569" strokeLinejoin="round" />
    <rect x="-45" y="-8" width="77" height="34" rx="2" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
    <path d="M-32-20H29M-35-16H26" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round" />
    {[0, 1].flatMap(row => Array.from({ length: 6 }, (_, col) => <g key={`${row}-${col}`} transform={`translate(${-37 + col * 9},${row * 12 - 1})`}>
      <rect width="7" height="8" rx=".7" fill="#334155" />
      <path d="M2 1H5M2 3H5" stroke="#94a3b8" strokeWidth=".8" />
      <path d="M2 7H5" stroke="#cbd5e1" strokeWidth="1" />
    </g>))}
    <rect x="21" y="1" width="5" height="4" rx="1" fill="#64748b" />
    <path d="M21 11H26M21 15H26M21 19H26" stroke="#94a3b8" strokeLinecap="round" />
  </g>;

  return <g aria-hidden="true" data-device-symbol="router">
    <ellipse cx="0" cy="32" rx="41" ry="5" fill="#0f172a" opacity=".07" />
    <path d="M-40-9V12C-40 23-22 31 0 31S40 23 40 12V-9Z" fill="#7da4c5" stroke="#406888" strokeWidth="1.5" />
    <path d="M-39 10C-31 25 31 25 39 10" fill="none" stroke="#abc7dd" strokeWidth="2" />
    <ellipse cx="0" cy="-9" rx="40" ry="20" fill="#dcecf7" stroke="#406888" strokeWidth="1.5" />
    <ellipse cx="0" cy="-10" rx="34" ry="15" fill="#eaf3fa" />
    <g transform="translate(0 -9) scale(1 .58)" fill="none" stroke="#315f85" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-7 0H-27M-21-6L-27 0L-21 6M7 0H27M21-6L27 0L21 6M0-7V-23M-6-17L0-23L6-17M0 7V23M-6 17L0 23L6 17" />
    </g>
    <path d="M-24 15V19M-19 17V21M-14 18V22" stroke="#406888" strokeWidth="1.5" strokeLinecap="round" />
  </g>;
}
