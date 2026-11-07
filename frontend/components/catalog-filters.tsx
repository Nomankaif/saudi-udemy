"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export function CatalogFilters({ kind, children }: { kind: "exams" | "labs"; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return <aside aria-label={kind === "labs" ? "Lab filters" : "Exam filters"} className="portal-filter-panel min-w-0 border border-slate-200 bg-white">
    <button type="button" className="portal-filter-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><SlidersHorizontal size={17} />Search & filter {kind}<ChevronDown size={17} className={open ? "rotate-180" : ""} /></button>
    <div id={id} className="portal-filter-content" data-open={open}>{children}</div>
  </aside>;
}
