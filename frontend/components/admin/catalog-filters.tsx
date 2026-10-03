"use client";
import { Search } from "lucide-react";

export function CatalogFilters({ kind, query, status, onQuery, onStatus }: {
  kind: string; query: string; status: string;
  onQuery: (value: string) => void; onStatus: (value: string) => void;
}) {
  return <div className="flex flex-wrap items-center gap-3">
    <div className="relative w-full max-w-lg"><Search size={18} className="pointer-events-none absolute left-4 top-3.5 text-slate-400" /><input aria-label={`Search ${kind} by title`} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-violet-600" value={query} onChange={e => onQuery(e.target.value)} placeholder={`Search ${kind} by title`} /></div>
    <select aria-label="Publication status" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-violet-600" value={status} onChange={e => onStatus(e.target.value)}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select>
    {(query || status) && <button className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-violet-700" onClick={() => { onQuery(""); onStatus(""); }}>Clear filters</button>}
  </div>;
}
