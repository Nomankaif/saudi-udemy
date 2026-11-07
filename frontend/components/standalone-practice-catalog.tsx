"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { api, messageOf } from "@/lib/api";
import type { PracticeKind } from "@/lib/standalone-practice";
import { practiceLabel } from "@/lib/standalone-practice";

type Summary = { _id: string; title: string; category: string; subcategory: string; prompt: string; shortDescription?: string; imageUrl?: string; questionCount?: number };

export function StandalonePracticeCatalog({ kind }: { kind: PracticeKind }) {
  const [items, setItems] = useState<Summary[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    api<Summary[]>(`/practice-items/${kind}`).then(data => { if (active) setItems(data); }).catch(cause => { if (active) setError(messageOf(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind]);
  return <main className="min-h-[70vh] bg-slate-50 py-16"><div className="portal-container"><p className="text-xs font-bold uppercase tracking-[.2em] text-amber-700">Practice questions</p><h1 className="mt-3 text-4xl font-bold text-slate-950">{practiceLabel(kind)}</h1><p className="mt-3 max-w-2xl text-slate-600">Work through interactive questions and review your result.</p>
    {error && <p role="alert" className="mt-8 rounded-lg border border-rose-200 bg-white p-5 text-rose-700">{error}</p>}
    {loading ? <p className="mt-8 text-slate-500">Loading questions…</p> : !items.length && !error ? <p className="mt-8 rounded-xl border border-slate-200 bg-white p-6 text-slate-600">No published questions yet.</p> : <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{items.map(item => <Link key={item._id} href={`/${kind}/${item._id}`} className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-400">{kind === "drag-drop" && item.imageUrl && <Image unoptimized src={item.imageUrl} alt="" width={600} height={338} className="aspect-video w-full object-cover" />}<div className="flex flex-1 flex-col p-6"><span className="text-xs font-bold uppercase text-blue-700">{[item.category, item.subcategory].filter(Boolean).join(" / ")}</span><h2 className="mt-4 text-xl font-bold text-slate-950">{item.title}</h2><p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">{kind === "drag-drop" ? item.shortDescription || `${item.questionCount || 1} interactive questions` : item.prompt}</p><span className="mt-5 text-sm font-bold text-blue-700 group-hover:underline">{kind === "drag-drop" ? `Open ${item.questionCount || 1} questions` : "Open question"} →</span></div></Link>)}</div>}
  </div></main>;
}
