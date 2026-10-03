"use client";
import Image from "next/image";
import { Clock3, ListChecks, Network } from "lucide-react";
import type { Lab } from "./types";

export function LabCard({ lab, busy, onOpen }: { lab: Lab; busy: boolean; onOpen: (lab: Lab) => void }) {
  return <article className="group flex min-w-0 flex-col border border-slate-200 bg-white transition duration-200 hover:-translate-y-1 hover:shadow-xl">
    <button type="button" aria-label={`Open ${lab.title}`} disabled={busy} onClick={() => onOpen(lab)} className="relative block h-48 w-full shrink-0 overflow-hidden bg-slate-200 disabled:cursor-wait">
      {lab.imageUrl ? <Image unoptimized src={lab.imageUrl} alt="" fill sizes="(max-width: 800px) 100vw, 33vw" className="object-cover transition duration-300 group-hover:scale-[1.025]" /> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-950 to-violet-700 text-white"><Network size={56} /></div>}
    </button>
    <div className="flex flex-1 flex-col p-5">
      <p className="m-0 text-xs font-extrabold uppercase tracking-wider text-violet-600">{lab.category}</p>
      <h3 className="my-2 text-lg font-bold leading-snug tracking-tight"><button disabled={busy} onClick={() => onOpen(lab)} className="text-left hover:text-violet-700">{lab.title}</button></h3>
      <p className="line-clamp-2 min-h-12 text-sm leading-6 text-slate-500">Configure devices and verify your work in a guided networking simulator.</p>
      <div className="flex flex-wrap gap-5 py-3 text-xs text-slate-600"><span className="flex items-center gap-1"><ListChecks size={16} />{lab.taskCount ?? 0} {(lab.taskCount ?? 0) === 1 ? "task" : "tasks"}</span><span className="flex items-center gap-1"><Clock3 size={16} />{lab.durationMinutes} min</span></div>
      <p className="flex items-center gap-1 text-xs text-slate-500"><Network size={16} />{lab.deviceCount ?? 0} {(lab.deviceCount ?? 0) === 1 ? "device" : "devices"}</p>
      <div className="mt-auto pt-4"><div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs text-slate-500"><span className={lab.access === "PREMIUM" ? "font-semibold text-amber-700" : ""}>{lab.access === "PREMIUM" ? "Premium lab" : "Free lab"}</span><button disabled={busy} onClick={() => onOpen(lab)} className="font-extrabold text-violet-600 hover:text-violet-800 disabled:opacity-50">Open lab</button></div></div>
    </div>
  </article>;
}
