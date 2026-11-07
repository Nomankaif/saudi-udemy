"use client";
import Link from "next/link";
import { LabCard } from "./lab-card";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Network, LockKeyhole, ArrowRight, X, Search, SlidersHorizontal } from "lucide-react";
import { api, ApiError, messageOf } from "@/lib/api";
import { Lab, Session, field, button, primary } from "./types";
import { CatalogFilters } from "../catalog-filters";
import { CatalogHeading } from "../catalog-heading";
import { CatalogCategoryFields } from "../catalog-category-fields";

export function LabCatalog({ initialFilters }: { initialFilters: { query: string; category: string; subcategory: string; access: string; sort: string } }) {
  const router = useRouter();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(initialFilters.query);
  const [accessFilter, setAccessFilter] = useState(initialFilters.access);
  const [sort, setSort] = useState(initialFilters.sort);
  const filters = initialFilters;
  function clearFilters() {
    router.push("/labs");
  }
  const filtered = labs.filter(lab =>
    lab.title.toLowerCase().includes(filters.query.trim().toLowerCase()) &&
    (!filters.category || lab.category === filters.category) &&
    (!filters.subcategory || lab.subcategory === filters.subcategory) &&
    (!filters.access || lab.access === filters.access)
  ).sort((a, b) => filters.sort === "tasks"
    ? (b.taskCount || 0) - (a.taskCount || 0) || a.title.localeCompare(b.title)
    : filters.sort === "duration"
      ? a.durationMinutes - b.durationMinutes || a.title.localeCompare(b.title)
      : a.title.localeCompare(b.title));
  const hasFilters = Boolean(filters.query || filters.category || filters.subcategory || filters.access || filters.sort !== "title");
  const [selected, setSelected] = useState<Lab | null>(null);
  const [mode, setMode] = useState("PRACTICE");
  const [duration, setDuration] = useState(60);
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { api<Lab[]>("/labs").then(setLabs).catch(e => setError(messageOf(e))).finally(() => setLoading(false)); }, []);
  async function open(lab: Lab) {
    setBusy(true); setError(""); setNotice("");
    try {
      const access = await api<{ allowed: boolean }>(`/labs/${lab._id}/availability`);
      setAllowed(access.allowed); setDuration(lab.durationMinutes); setSelected(lab);
    } catch (e) { if (e instanceof ApiError && e.status === 401) router.push("/login"); else setError(messageOf(e)); }
    finally { setBusy(false); }
  }
  async function start() {
    if (!selected) return;
    setBusy(true); setError("");
    try { const session = await api<Session>(`/labs/${selected._id}/start`, { method: "POST", body: JSON.stringify({ mode, durationMinutes: duration }) }); router.push(`/labs/session/${session._id}`); }
    catch(e) { setError(messageOf(e)); setBusy(false); }
  }
  async function requestAccess() {
    setBusy(true);
    try { await api("/access-requests", { method: "POST", body: JSON.stringify({ examId: selected?.examId, userMessage: `Access to networking lab: ${selected?.title}` }) }); setNotice("Request sent. You can follow its status in Access requests."); }
    catch(e) { setNotice(messageOf(e)); } finally { setBusy(false); }
  }
  return <section className="bg-slate-50 pb-20">
    <CatalogHeading kind="labs" />
    <div className="portal-container portal-catalog-layout">
      <CatalogFilters kind="labs">
        <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const params = new URLSearchParams({ q: query, category: String(data.get("category") || ""), subcategory: String(data.get("subcategory") || ""), access: accessFilter, sort }); router.push(`/labs?${params}`); }}>
          <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4 text-sm font-semibold"><SlidersHorizontal size={17} className="text-violet-700" />Search and filter labs</div>
          <div className="flex flex-col gap-5">
            <label className="text-xs font-semibold text-slate-600">Search<div className="relative mt-2"><Search size={18} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input className={`${field} pl-10`} placeholder="Search by lab title" value={query} onChange={e => setQuery(e.target.value)} /></div></label>
            <CatalogCategoryFields items={labs} initialCategory={filters.category} initialSubcategory={filters.subcategory} fieldClass={`${field} mt-2`} />
            <label className="text-xs font-semibold text-slate-600">Access<select className={`${field} mt-2`} value={accessFilter} onChange={e => setAccessFilter(e.target.value)}><option value="">All labs</option><option value="FREE">Free labs</option><option value="PREMIUM">Premium labs</option></select></label>
            <label className="text-xs font-semibold text-slate-600">Sort by<select className={`${field} mt-2`} value={sort} onChange={e => setSort(e.target.value)}><option value="title">Name: A–Z</option><option value="tasks">Most tasks</option><option value="duration">Shortest duration</option></select></label>
            <button type="submit" className="min-h-11 w-full rounded-md bg-violet-700 px-6 text-sm font-semibold text-white hover:bg-violet-800">Apply filters</button>
          </div>
        </form>
      </CatalogFilters>
      <div className="min-w-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-2xl font-bold">{filters.subcategory || filters.category || "All labs"}</h2><p role="status" className="mt-1 text-sm text-slate-500">{loading ? "Loading labs…" : `${filtered.length} of ${labs.length} labs`}{filters.query.trim() ? ` matching “${filters.query.trim()}”` : ""}</p></div>{hasFilters && <button onClick={clearFilters} className={button}>Clear filters</button>}</div>
        {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
    {loading ? <p className="py-12 text-slate-500">Loading labs…</p> : !filtered.length ? <div className="rounded-lg border border-slate-200 p-12 text-center"><Network className="mx-auto mb-4 text-slate-400" /><h2 className="font-semibold">No labs found</h2><p className="mt-2 text-sm text-slate-500">Try another search or clear your filters.</p></div> : <div className="portal-catalog-grid">{filtered.map(l => <LabCard key={l._id} lab={l} busy={busy} onOpen={open} />)}</div>}
      </div>
    </div>
    {selected && <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/40 p-5" role="dialog" aria-modal="true" aria-labelledby="lab-setup-title"><div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-7 shadow-xl"><div className="mb-5 flex justify-between gap-4"><h2 id="lab-setup-title" className="text-xl font-semibold">{selected.title}</h2><button className="self-start p-1" aria-label="Close lab setup" onClick={() => setSelected(null)}><X size={20} /></button></div>{allowed ? <><div className="space-y-3">{[["PRACTICE", "Practice", "Check tasks and view solutions while you work."], ["EXAM", "Timed assessment", "Results and solutions appear after submission."]].map(([value, title, description]) => <label key={value} className={`flex cursor-pointer gap-3 rounded-md border p-4 ${mode === value ? "border-slate-800 bg-slate-50" : "border-slate-200"}`}><input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value || "PRACTICE")} /><span className="text-sm"><strong className="block">{title}</strong><span className="mt-1 block text-slate-500">{description}</span></span></label>)}</div>{mode === "EXAM" && <label className="mt-5 block text-sm font-medium">Time limit (minutes){["netsim-v1", "netsim-series-v1"].includes(selected.engine || "") && <span className="ml-2 text-xs font-normal text-slate-500">Set by the lab author</span>}<input className={`${field} mt-2`} type="number" min={1} max={1440} disabled={["netsim-v1", "netsim-series-v1"].includes(selected.engine || "")} value={duration} onChange={e => setDuration(Number(e.target.value))} /></label>}<button className={`${primary} mt-6 w-full`} disabled={busy} onClick={start}>Start {selected.engine === "netsim-series-v1" ? `${selected.taskCount} questions` : "lab"} <ArrowRight size={16} /></button></> : <div className="space-y-4"><LockKeyhole className="text-amber-600" /><p className="text-sm text-slate-600">This lab uses the linked exam’s premium access. Request approval from your administrator to continue.</p><button className={primary} disabled={busy || Boolean(notice)} onClick={requestAccess}>Request access</button><Link className="block text-sm underline" href="/dashboard/access-requests">View access requests</Link></div>}{notice && <p role="status" className="mt-4 text-sm text-slate-600">{notice}</p>}{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}</div></div>}
  </section>;
}
