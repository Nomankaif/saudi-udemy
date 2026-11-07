"use client";

import { useEffect, useRef, useState } from "react";

type StatKind = "exams" | "questions" | "labs" | "providers";
export type HomeStat = { kind: StatKind; label: string; value: number | null };

function StatArtwork({ kind }: { kind: StatKind }) {
  return <svg className="portal-stat-artwork" viewBox="0 0 96 76" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === "exams" && <>
      <path d="M24 9h36l12 12v45H24zM60 9v12h12M33 30h29M33 37h18M33 53l5 5 9-12" />
      <circle cx="39" cy="52" r="15" strokeOpacity=".35" />
      <path d="M55 52h8M55 59h8" />
    </>}
    {kind === "questions" && <>
      <path d="M16 18h56v38H41L29 65v-9H16zM33 28h25M33 36h19" />
      <circle cx="66" cy="51" r="16" fill="#f8fbfd" />
      <path d="M62 47a5 5 0 1 1 7 5c-2 1-3 2-3 4M66 61h.01" strokeWidth="2" />
      <path d="M23 11h8M35 11h5" strokeOpacity=".55" />
    </>}
    {kind === "labs" && <>
      <path d="M16 19h64v42H16zM11 65h74l-4 5H15zM42 26h12M48 26v10M27 44h42" />
      <circle cx="28" cy="32" r="5" /><circle cx="48" cy="41" r="5" /><circle cx="68" cy="32" r="5" />
      <path d="m32 36 12 3m8 0 12-3M24 55h22M51 55h15" />
    </>}
    {kind === "providers" && <>
      <circle cx="48" cy="38" r="21" /><circle cx="48" cy="38" r="14" />
      <path d="m41 38 5 5 10-11M35 56l-5 15 12-6 6 5 6-5 12 6-5-15" />
      <path d="m20 12 2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1zm28-9 2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1zm28 9 2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1z" />
    </>}
  </svg>;
}

function CountUp({ value }: { value: number | null }) {
  const ref = useRef<HTMLElement>(null);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === null) return;
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.IntersectionObserver) {
      frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }
    let started = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || started) return;
      started = true;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / 1400, 1);
        setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.35 });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);
  return <strong ref={ref} className="portal-stat-number"><span className="sr-only">{value === null ? "Unavailable" : value.toLocaleString("en-US")}</span><span aria-hidden="true">{value === null ? "—" : display.toLocaleString("en-US")}</span></strong>;
}

export function HomeStats({ stats }: { stats: HomeStat[] }) {
  return <section className="portal-home-stats" aria-label="Practice library at a glance"><div className="portal-container portal-home-stats-grid">
    {stats.map(stat => <div className="portal-home-stat" key={stat.kind}><StatArtwork kind={stat.kind} /><CountUp value={stat.value} /><span className="portal-stat-label">{stat.label}</span></div>)}
  </div></section>;
}
