"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowDown, ArrowUp } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import { button, field, primary } from "./types";

type Row = { _id: string; title: string; category: string; subcategory?: string; status: string; importSourceNumber?: number; draft?: { engine?: string }; sourceReview?: { status?: string } };
type Draft = { title: string; category: string; subcategory: string; labIds: string[]; durationMinutes: number; access: "FREE" };
const empty: Draft = { title: "", category: "", subcategory: "", labIds: [], durationMinutes: 60, access: "FREE" };

export function LabCollectionEditor({ id }: { id: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [status, setStatus] = useState("DRAFT");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([api<Row[]>("/labs/admin/all"), id === "new" ? Promise.resolve(null) : api<{ draft: Draft; status: string }>(`/labs/admin/${id}`)])
      .then(([items, current]) => { setRows(items.filter(item => item.draft?.engine === "netsim-v1")); if (current) { setDraft(current.draft); setStatus(current.status); } setReady(true); })
      .catch(error => setMessage(messageOf(error)));
  }, [id]);
  const categories = [...new Set(rows.map(row => row.category))].sort();
  const subcategories = [...new Set(rows.filter(row => row.category === draft.category).map(row => row.subcategory || ""))].sort();
  const available = rows.filter(row => row.category === draft.category && (row.subcategory || "") === draft.subcategory).sort((a, b) => (a.importSourceNumber ?? 10000) - (b.importSourceNumber ?? 10000) || a.title.localeCompare(b.title));
  const selected = draft.labIds.map(value => rows.find(row => row._id === value)).filter((row): row is Row => Boolean(row));
  function toggle(value: string) { setDraft(current => ({ ...current, labIds: current.labIds.includes(value) ? current.labIds.filter(id => id !== value) : [...current.labIds, value] })); }
  function move(index: number, direction: number) { setDraft(current => { const labIds = [...current.labIds]; const target = index + direction; if (target < 0 || target >= labIds.length) return current; [labIds[index], labIds[target]] = [labIds[target]!, labIds[index]!]; return { ...current, labIds }; }); }
  async function save(action: "save" | "preview" | "publish") {
    setBusy(true); setMessage("");
    try {
      const result = await api<{ _id: string }>(id === "new" ? "/labs/admin/collections" : `/labs/admin/collections/${id}`, { method: id === "new" ? "POST" : "PUT", body: JSON.stringify(draft) });
      if (action === "preview") { const attempt = await api<{ _id: string }>(`/labs/admin/collections/${result._id}/preview`, { method: "POST" }); router.push(`/labs/session/${attempt._id}`); return; }
      if (action === "publish") { await api(`/labs/admin/${result._id}/publish`, { method: "POST" }); setStatus("PUBLISHED"); setMessage("Collection published. Students can now start all questions in one session."); }
      else setMessage("Collection draft saved.");
      if (id === "new") router.replace(`/admin/labs/collections/${result._id}`);
    } catch (error) { setMessage(messageOf(error)); } finally { setBusy(false); }
  }
  return <section className="mx-auto max-w-5xl space-y-6"><Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600" href="/admin/labs"><ArrowLeft size={16} />Labs</Link><div><p className="text-xs font-bold uppercase tracking-widest text-violet-700">Lab studio</p><h1 className="mt-2 text-3xl font-bold">{id === "new" ? "Create lab collection" : draft.title}</h1><p className="mt-2 text-sm text-slate-600">One student session with a separate topology, console and task list for every question. {id !== "new" ? `Status: ${status.toLowerCase()}.` : ""}</p></div>
    {message && <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">{message}</p>}
    {!ready ? <p className="text-sm text-slate-500">Loading labs…</p> : <>
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"><label className="block text-sm font-semibold">Collection title<input className={`${field} mt-2`} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="CCNA practice labs" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Category<select className={`${field} mt-2`} value={draft.category} onChange={event => setDraft(current => ({ ...current, category: event.target.value, subcategory: "", labIds: [] }))}><option value="">Select category</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label><label className="block text-sm font-semibold">Subcategory<select className={`${field} mt-2`} value={draft.subcategory} disabled={!draft.category} onChange={event => setDraft(current => ({ ...current, subcategory: event.target.value, labIds: [] }))}><option value="">Select subcategory</option>{subcategories.filter(Boolean).map(value => <option key={value}>{value}</option>)}</select></label></div><label className="block text-sm font-semibold">Session duration in assessment mode<input className={`${field} mt-2 max-w-40`} type="number" min={1} max={1440} value={draft.durationMinutes} onChange={event => setDraft(current => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label></div>
      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Available labs</h2><p className="mt-1 text-xs text-slate-500">Choose the exercises to include.</p><div className="mt-4 max-h-[500px] space-y-2 overflow-y-auto">{available.map(row => <label key={row._id} className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-100 p-3 text-sm"><input type="checkbox" className="mt-1" checked={draft.labIds.includes(row._id)} onChange={() => toggle(row._id)} /><span><strong className="block">{row.importSourceNumber ? `${row.importSourceNumber}. ` : ""}{row.title}</strong><span className={`text-xs ${row.status === "PUBLISHED" ? "text-emerald-700" : "text-amber-700"}`}>{row.status === "PUBLISHED" ? "Published" : "Draft; must be reviewed and published before the collection goes live"}</span></span></label>)}{!available.length && <p className="text-sm text-slate-500">Select a category and subcategory with network simulation labs.</p>}</div></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Question order · {selected.length}</h2><p className="mt-1 text-xs text-slate-500">Each question has its own configuration. Use arrows to change the order.</p><ol className="mt-4 max-h-[500px] space-y-2 overflow-y-auto">{selected.map((row, index) => <li key={row._id} className="flex items-center gap-3 rounded-md border border-slate-100 p-2 text-sm"><span className="w-7 shrink-0 text-center font-bold text-[#0e537f]">{index + 1}</span><span className="min-w-0 flex-1 truncate" title={row.title}>{row.title}</span><button type="button" className="p-1 disabled:opacity-30" disabled={index === 0} aria-label={`Move question ${index + 1} up`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" className="p-1 disabled:opacity-30" disabled={index === selected.length - 1} aria-label={`Move question ${index + 1} down`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button></li>)}</ol></section></div>
      <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={busy || selected.length < 2} onClick={() => void save("save")}>Save draft</button><button className={button} disabled={busy || selected.length < 2} onClick={() => void save("preview")}>Preview {selected.length} questions</button><button className={primary} disabled={busy || selected.length < 2} onClick={() => void save("publish")}>{status === "PUBLISHED" ? "Republish collection" : "Publish collection"}</button></div>
      <p className="text-xs text-slate-500">Publication requires each source lab to be reviewed and published. The preview uses current drafts for admin testing.</p>
    </>}
  </section>;
}
