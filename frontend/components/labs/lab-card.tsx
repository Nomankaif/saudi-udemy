"use client";
import Image from "next/image";
import { ArrowUpRight, Clock3, ListChecks, Network } from "lucide-react";
import type { Lab } from "./types";

export function LabCard({ lab, busy, onOpen }: { lab: Lab; busy: boolean; onOpen: (lab: Lab) => void }) {
  return <article className="portal-card">
    <button type="button" aria-label={`Open ${lab.title}`} disabled={busy} onClick={() => onOpen(lab)} className="portal-card-cover">
      {lab.imageUrl ? <Image unoptimized src={lab.imageUrl} alt="" fill sizes="(max-width: 600px) 100vw, (max-width: 1150px) 50vw, 33vw" /> : <div className="portal-card-fallback"><div><small>HANDS-ON LAB</small><Network size={23} /></div><strong>{lab.subcategory || lab.category}</strong></div>}
    </button>
    <div className="portal-card-body"><p className="portal-card-category">{lab.category}{lab.subcategory ? ` / ${lab.subcategory}` : ""}</p><h3><button disabled={busy} onClick={() => onOpen(lab)} className="text-left">{lab.title}</button></h3>
      <p className="portal-card-description">{lab.engine === "netsim-series-v1" ? "Complete each network exercise in one session. Every question has its own topology and console." : "Work through guided tasks, configure your environment and verify your results."}</p>
      <div className="portal-card-meta"><span><ListChecks size={14} />{lab.taskCount ?? 0} {lab.engine === "netsim-series-v1" ? "questions" : (lab.taskCount ?? 0) === 1 ? "task" : "tasks"}</span><span><Clock3 size={14} />{lab.durationMinutes} min</span></div>
      <div className="portal-card-extra"><Network size={13} />{lab.engine === "netsim-series-v1" ? "Separate simulation for every question" : `${lab.deviceCount ?? 0} ${(lab.deviceCount ?? 0) === 1 ? "device" : "devices"} · Simulated environment`}</div>
      <div className="portal-card-footer"><span>{lab.access === "PREMIUM" ? "Premium lab" : "Free lab"}</span><button disabled={busy} onClick={() => onOpen(lab)}>Open lab <ArrowUpRight size={15} /></button></div>
    </div>
  </article>;
}
