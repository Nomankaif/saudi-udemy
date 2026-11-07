type ServiceKind = "paths" | "exams" | "labs" | "progress";

export function ServiceArtwork({ kind }: { kind: ServiceKind }) {
  return <svg viewBox="0 0 320 360" fill="none" aria-hidden="true" focusable="false" className="portal-service-artwork">
    <circle cx="272" cy="52" r="115" stroke="#91BFDE" strokeOpacity=".15" />
    <circle cx="39" cy="309" r="92" stroke="#91BFDE" strokeOpacity=".13" />
    <path d="M0 330h320M0 25h320" stroke="#FFFFFF" strokeOpacity=".08" />
    {kind === "paths" && <>
      <path d="M58 113v148c0 18 14 32 32 32h19" stroke="#F0C75E" strokeWidth="2" strokeDasharray="5 6" />
      <circle cx="58" cy="113" r="6" fill="#F0C75E" /><circle cx="58" cy="194" r="6" fill="#F0C75E" /><circle cx="109" cy="293" r="6" fill="#F0C75E" />
      <g transform="rotate(-5 165 112)"><rect x="82" y="64" width="207" height="99" rx="10" fill="#EAF3FB" /><rect x="98" y="80" width="41" height="41" rx="7" fill="#D6E7F6" /><circle cx="113" cy="93" r="4" fill="#2C6FA9" /><circle cx="126" cy="103" r="4" fill="#2C6FA9" /><circle cx="111" cy="111" r="4" fill="#2C6FA9" /><path d="m113 93 13 10-15 8" stroke="#2C6FA9" strokeWidth="2" /><path d="M151 91h105M151 105h75" stroke="#6685A4" strokeWidth="5" strokeLinecap="round" /><rect x="98" y="136" width="175" height="5" rx="2.5" fill="#C6D8E8" /><rect x="98" y="136" width="106" height="5" rx="2.5" fill="#E4B740" /></g>
      <g transform="rotate(4 191 217)"><rect x="86" y="179" width="205" height="79" rx="10" fill="#F7FAFE" /><rect x="102" y="196" width="37" height="37" rx="7" fill="#FEF1D0" /><path d="m120 201 11 4v8c0 7-6 11-11 13-5-2-11-6-11-13v-8l11-4Z" stroke="#B58A23" strokeWidth="2" /><path d="M152 204h108M152 218h70" stroke="#6685A4" strokeWidth="5" strokeLinecap="round" /></g>
      <rect x="105" y="273" width="172" height="62" rx="9" fill="#DBEBF8" /><rect x="120" y="288" width="31" height="31" rx="6" fill="#B7D6EC" /><path d="M125 309h22a7 7 0 0 0-2-12 9 9 0 0 0-16 2 6 6 0 0 0-4 10Z" stroke="#2C6FA9" strokeWidth="2" /><path d="M164 295h89M164 308h58" stroke="#6685A4" strokeWidth="5" strokeLinecap="round" />
    </>}
    {kind === "exams" && <>
      <rect x="65" y="51" width="198" height="281" rx="12" fill="#DDEAF5" transform="rotate(7 65 51)" />
      <rect x="55" y="47" width="211" height="279" rx="12" fill="#F7FAFE" />
      <rect x="77" y="70" width="166" height="35" rx="5" fill="#DFECF8" />
      <path d="M89 82h89M89 93h62" stroke="#4C7197" strokeWidth="5" strokeLinecap="round" />
      <path d="M78 124h143M78 134h108" stroke="#9DB5CC" strokeWidth="4" strokeLinecap="round" />
      <circle cx="88" cy="163" r="10" stroke="#6A8BA9" strokeWidth="2" /><path d="M108 160h108M108 169h72" stroke="#A8C0D2" strokeWidth="4" strokeLinecap="round" />
      <circle cx="88" cy="208" r="10" fill="#F0C75E" /><path d="m83 208 4 4 7-8" stroke="#214A6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M108 205h108M108 214h81" stroke="#A8C0D2" strokeWidth="4" strokeLinecap="round" />
      <circle cx="88" cy="253" r="10" stroke="#6A8BA9" strokeWidth="2" /><path d="M108 250h108M108 259h59" stroke="#A8C0D2" strokeWidth="4" strokeLinecap="round" />
      <rect x="185" y="290" width="98" height="43" rx="8" fill="#F0C75E" /><path d="M205 311h52m-18-9 10 9-10 9" stroke="#204260" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>}
    {kind === "labs" && <>
      <circle cx="103" cy="84" r="27" fill="#DCEBFA" /><circle cx="220" cy="84" r="27" fill="#DCEBFA" />
      <path d="M130 84h63" stroke="#F0C75E" strokeWidth="3" strokeLinecap="round" /><circle cx="162" cy="84" r="4" fill="#F0C75E" />
      <path d="M89 84h28m-14-14v28m103-14h28m-14-14v28" stroke="#27699E" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M103 111v29m117-29v29" stroke="#8FC0DE" strokeWidth="2" strokeDasharray="4 5" />
      <rect x="40" y="139" width="240" height="182" rx="11" fill="#102B48" stroke="#8CB4D1" />
      <path d="M40 172h240" stroke="#4A6E8F" /><circle cx="59" cy="156" r="3" fill="#F0C75E" /><circle cx="71" cy="156" r="3" fill="#8BB7D5" /><circle cx="83" cy="156" r="3" fill="#8BB7D5" />
      <path d="M62 201h14m9 0h91M62 224h14m9 0h142M62 247h14m9 0h112" stroke="#B5D2E7" strokeWidth="5" strokeLinecap="round" /><path d="M85 270h65m-65 15h111" stroke="#6CC2A8" strokeWidth="5" strokeLinecap="round" />
      <rect x="229" y="266" width="73" height="67" rx="10" fill="#EAF6F0" /><circle cx="265" cy="298" r="15" fill="#D2EBDC" /><path d="m257 298 6 6 11-13" stroke="#358B68" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </>}
    {kind === "progress" && <>
      <rect x="40" y="56" width="240" height="248" rx="12" fill="#F5F9FE" />
      <rect x="59" y="76" width="202" height="33" rx="5" fill="#E2EDF7" /><path d="M73 88h105M73 98h65" stroke="#6F91AF" strokeWidth="5" strokeLinecap="round" />
      <path d="M69 253h174M69 210h174M69 167h174" stroke="#D5E2ED" strokeWidth="1.5" />
      <rect x="83" y="211" width="24" height="42" rx="4" fill="#79AAD1" /><rect x="124" y="188" width="24" height="65" rx="4" fill="#4D91C3" /><rect x="165" y="155" width="24" height="98" rx="4" fill="#2A70AB" /><rect x="206" y="126" width="24" height="127" rx="4" fill="#F0C75E" />
      <path d="m95 192 41-24 41-31 41-27" stroke="#285B88" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="95" cy="192" r="4" fill="#285B88" /><circle cx="136" cy="168" r="4" fill="#285B88" /><circle cx="177" cy="137" r="4" fill="#285B88" /><circle cx="218" cy="110" r="4" fill="#285B88" />
      <circle cx="247" cy="284" r="42" fill="#F0C75E" /><circle cx="247" cy="284" r="29" stroke="#9E791E" strokeWidth="2" /><path d="m232 284 10 10 20-22" stroke="#214765" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m230 318-10 32 26-14m18-18 10 32-26-14" fill="#D8A93D" />
    </>}
  </svg>;
}
