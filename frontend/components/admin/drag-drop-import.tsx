"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Template is a downloadable API attachment. */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Upload, X } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import type { Question } from "@/lib/types";
import { CategoryFields } from "./category-fields";
import { QuestionEditor } from "./question-editor";
import { ImportReviewControls } from "./import-review-controls";
import { primaryButton, secondaryButton } from "./ui";

type Candidate = { sourceNumber: number; sourcePages: number[]; answerPages?: number[]; title: string; question: Question; errors: string[]; warnings: string[]; reviewed: boolean; exhibitPage?: number; exhibitRect?: { left: number; top: number; width: number; height: number } | null };
type ImportJob = { id: string; filename: string; sourceKind: "pdf" | "json"; bankId?: string; status: "QUEUED" | "PROCESSING" | "READY" | "FAILED"; processedPages: number; totalPages: number; expectedItems: number; error: string; candidates: Candidate[] };
type ReviewFilter = "all" | "ready" | "doubtful" | "fix";
type AnswerFilter = "all" | "parsed" | "missing";
const PAGE_SIZE = 20;
const statusOf = (row: Candidate) => row.errors.length ? "fix" : row.reviewed ? "ready" : "doubtful";
const hasUsableAnswer = (question: Question) => {
  const items = new Set(question.options.map(item => item.id));
  const targets = question.dropTargets || [];
  const placements = question.correctPlacements || [];
  const counts = new Map(targets.map(target => [target.id, 0]));
  if (!placements.length || new Set(placements.map(placement => placement.itemId)).size !== placements.length) return false;
  for (const placement of placements) {
    if (!items.has(placement.itemId) || !counts.has(placement.targetId)) return false;
    counts.set(placement.targetId, (counts.get(placement.targetId) || 0) + 1);
  }
  return targets.length > 0 && targets.every(target => counts.get(target.id) === target.capacity);
};

export function DragDropImport({ onImported, initialCategory = "", initialSubcategory = "", bankId }: { onImported: (count: number) => void; initialCategory?: string; initialSubcategory?: string; bankId?: string }) {
  const [format, setFormat] = useState<"pdf" | "json">("pdf");
  const [category, setCategory] = useState(initialCategory);
  const [subcategory, setSubcategory] = useState(initialSubcategory);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [sourcePage, setSourcePage] = useState(0);
  const [crop, setCrop] = useState({ left: 1, top: 15, width: 48, height: 32 });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalNotice, setModalNotice] = useState("");
  const initializedJob = useRef("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const storageKey = bankId ? `drag-drop-import-bank-${bankId}` : "drag-drop-import-job";
  const load = useCallback(async (id: string) => {
    try { const data = await api<ImportJob>(`/practice-items/drag-drop/admin/imports/${id}`); if (String(data.bankId || "") !== String(bankId || "")) throw new Error("This import belongs to a different Drag and Drop bank"); setJob(data); if (data.status === "READY" && initializedJob.current !== data.id) { initializedJob.current = data.id; setSelected(data.candidates.flatMap((row, index) => row.reviewed && !row.errors.length ? [index] : [])); } if (data.status === "FAILED") setMessage(data.error || "Extraction failed"); }
    catch (error) { setMessage(messageOf(error)); }
  }, [bankId]);
  useEffect(() => {
    const id = window.localStorage.getItem(storageKey);
    if (id) { const timer = setTimeout(() => void load(id), 0); return () => clearTimeout(timer); }
  }, [load, storageKey]);
  useEffect(() => {
    if (!job || !["QUEUED", "PROCESSING"].includes(job.status)) return;
    const timer = window.setInterval(() => void load(job.id), 2000);
    return () => window.clearInterval(timer);
  }, [job, load]);
  useEffect(() => {
    if (editing === null) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setEditing(null); }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable.item(0), last = focusable.item(focusable.length - 1);
      if (!first || !last) return;
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [editing]);
  const rows = job?.candidates || [];
  const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
    const term = query.trim().toLowerCase();
    return (filter === "all" || statusOf(row) === filter) && (answerFilter === "all" || (hasUsableAnswer(row.question) ? "parsed" : "missing") === answerFilter) && (!term || row.title.toLowerCase().includes(term) || row.question.text.toLowerCase().includes(term) || String(row.sourceNumber).includes(term));
  });
  const validRows = rows.flatMap((row, index) => row.errors.length ? [] : [index]);
  const cleanRows = rows.flatMap((row, index) => statusOf(row) === "ready" ? [index] : []);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const invalid = selected.filter(index => !rows[index] || rows[index].errors.length > 0).length;
  const unreviewed = selected.filter(index => rows[index] && !rows[index].reviewed).length;
  async function upload(file?: File) {
    if (!file) return;
    if (!category) { setMessage("Select a category and subcategory before uploading."); return; }
    setBusy(true); setMessage(""); setJob(null); setSelected([]); setPage(1); setFilter("all"); setAnswerFilter("all"); setQuery(""); initializedJob.current = "";
    try {
      const body = new FormData(); body.set("file", file); body.set("category", category); body.set("subcategory", subcategory); if (bankId) body.set("bankId", bankId);
      const result = await api<{ id: string }>("/practice-items/drag-drop/admin/imports", { method: "POST", body });
      window.localStorage.setItem(storageKey, result.id);
      await load(result.id);
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }
  function changeFilter(next: ReviewFilter, nextAnswer: AnswerFilter, text: string) {
    setFilter(next); setAnswerFilter(nextAnswer); setQuery(text); setPage(1);
    setSelected(rows.flatMap((row, index) => (next === "all" || statusOf(row) === next) && (nextAnswer === "all" || (hasUsableAnswer(row.question) ? "parsed" : "missing") === nextAnswer) && (!text.trim() || row.title.toLowerCase().includes(text.trim().toLowerCase()) || row.question.text.toLowerCase().includes(text.trim().toLowerCase()) || String(row.sourceNumber).includes(text.trim())) && !row.errors.length ? [index] : []));
  }
  function open(index: number) {
    const row = rows[index];
    if (!row) return;
    setEditing(index); setTitle(row.title); setSourcePage(row.exhibitPage || row.sourcePages[0] || 0);
    setCrop({ left: Math.round((row.exhibitRect?.left || 0.01) * 100), top: Math.round((row.exhibitRect?.top || 0.15) * 100), width: Math.round((row.exhibitRect?.width || 0.48) * 100), height: Math.round((row.exhibitRect?.height || 0.32) * 100) });
    setModalError(""); setModalNotice("");
  }
  async function save(question: Question) {
    if (editing === null || !job) return;
    setBusy(true); setModalError("");
    try {
      const row = await api<Candidate>(`/practice-items/drag-drop/admin/imports/${job.id}/candidates/${editing}`, { method: "PATCH", body: JSON.stringify({ title, question, reviewed: true }) });
      setJob({ ...job, candidates: rows.map((item, index) => index === editing ? row : item) });
      if (row.reviewed) { setSelected(current => current.includes(editing) ? current : [...current, editing]); setEditing(null); }
      else setModalError(row.errors.join(" · ") || "Check the question against its source before saving.");
    } catch (error) { setModalError(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function saveCrop() {
    if (editing === null || !job) return;
    setBusy(true); setModalError("");
    try {
      const row = await api<Candidate>(`/practice-items/drag-drop/admin/imports/${job.id}/candidates/${editing}/crop`, { method: "POST", body: JSON.stringify({ page: sourcePage, rect: { left: crop.left / 100, top: crop.top / 100, width: crop.width / 100, height: crop.height / 100 } }) });
      setJob({ ...job, candidates: rows.map((item, index) => index === editing ? row : item) });
      setRevision(value => value + 1);
      setModalNotice("Exhibit saved. Review the answer and save this question to mark it ready.");
    } catch (error) { setModalError(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!job || !selected.length || invalid) return;
    if (unreviewed && !window.confirm(`${unreviewed} selected question${unreviewed === 1 ? "" : "s"} have not been individually reviewed against the source. Confirm bulk source review and import them as drafts?`)) return;
    setBusy(true); setMessage("");
    try {
      const result = await api<{ imported: number }>(`/practice-items/drag-drop/admin/imports/${job.id}/commit`, { method: "POST", body: JSON.stringify({ selected, confirmReview: unreviewed > 0 }) });
      window.localStorage.removeItem(storageKey); setJob(null); setSelected([]);
      onImported(result.imported);
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }
  const row = editing === null ? null : rows[editing];
  return <section className="space-y-6">
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-widest text-violet-700">Bring your question bank</p><h2 className="mt-2 text-2xl font-bold">Import, review, then save</h2><p className="mt-2 text-sm text-slate-600">Both methods use the same correction and selection steps. Imported questions remain drafts until published.</p>
      <div role="tablist" aria-label="Drag and Drop import format" className="mt-6 flex gap-6 border-b border-slate-200">{(["pdf", "json"] as const).map(kind => <button type="button" role="tab" aria-selected={format === kind} onClick={() => setFormat(kind)} key={kind} className={`border-b-2 pb-3 text-sm font-semibold ${format === kind ? "border-violet-700 text-slate-950" : "border-transparent text-slate-500"}`}>{kind === "pdf" ? "PDF extraction" : "JSON file"}</button>)}</div>
      <div className="mt-5">{bankId ? <p className="text-sm text-slate-600">Importing into {category}{subcategory ? ` / ${subcategory}` : ""}</p> : <CategoryFields category={category} subcategory={subcategory} onChange={(parent, child) => { setCategory(parent); setSubcategory(child); }} />}</div>
      {format === "pdf" ? <p className="mt-5 text-sm text-slate-600">Scanned pages are read with offline OCR. Check every item and answer view; watermarks and screenshots can make extraction uncertain. Maximum 50 MB and 300 pages.</p> : <><p className="mt-5 text-sm text-slate-600">Download the template, fill in the items, destination groups, and correct mappings, then upload it here. Add exhibit images during review.</p><a href="/api/backend/practice-items/drag-drop/admin/import/template" className={`${secondaryButton} mt-4 inline-flex rounded-lg`}><FileText size={16} />Download JSON template</a></>}
      <label className="mt-5 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-8 text-center"><Upload className="text-violet-700" /><strong>{busy ? "Processing…" : `Choose a ${format.toUpperCase()} file`}</strong><input type="file" aria-label={`Import ${format.toUpperCase()} file`} accept={format === "pdf" ? ".pdf,application/pdf" : ".json,application/json"} disabled={busy} className="max-w-full text-sm" onChange={event => void upload(event.target.files?.[0])} /></label>
    </div>
    {message && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    {job && <div className="rounded-2xl border border-slate-200 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">Review {job.filename}</h3><p className="mt-1 text-sm text-slate-500">{job.status === "READY" ? `${rows.length} extracted · ${cleanRows.length} ready · ${selected.length} selected for draft import · ${rows.filter(value => statusOf(value) === "fix").length} need correction · ${rows.filter(value => statusOf(value) === "doubtful").length} doubtful` : `${job.status.toLowerCase()} · ${job.processedPages} of ${job.totalPages || "?"} pages processed`}</p></div>{job.status === "READY" && <button type="button" onClick={() => { window.localStorage.removeItem(storageKey); setJob(null); }} className="text-sm font-semibold text-slate-600 underline">Close preview</button>}</div>
      {job.status === "READY" && <><div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"><p><strong>Import check:</strong> {job.expectedItems} numbered source items expected, {rows.length} question blocks extracted.</p><p>{validRows.length} structurally valid for draft import; {rows.length - validRows.length} need correction.</p>{job.sourceKind === "pdf" && <p className="mt-2 text-amber-800"><strong>Source review needed:</strong> Check OCR questions and answer pages against the original PDF before importing.</p>}</div>
        <ImportReviewControls
          total={rows.length} validCount={validRows.length} cleanCount={cleanRows.length}
          onSelectAll={() => setSelected(validRows)}
          onSelectClean={() => setSelected(cleanRows)} onClear={() => setSelected([])}
          search={query} onSearch={value => changeFilter(filter, answerFilter, value)}
          reviewStatus={filter} onReviewStatus={value => changeFilter(value as ReviewFilter, answerFilter, query)}
          reviewOptions={[{ value: "all", label: "All rows" }, { value: "ready", label: "Ready" }, { value: "doubtful", label: "Doubtful — check source" }, { value: "fix", label: "Needs correction" }]}
          answerStatus={answerFilter} onAnswerStatus={value => changeFilter(filter, value as AnswerFilter, query)}
          answerOptions={[{ value: "all", label: "All answer states" }, { value: "parsed", label: "Usable answer key" }, { value: "missing", label: "Missing or invalid key" }]}
          visibleCount={visible.length}
          selectionHelp="Select all valid includes importable questions across every page. Unreviewed questions require one bulk source-review confirmation at import. Unselect all clears the entire import."
          answerHelp="“Usable answer key” means every destination has the configured number of valid item placements. Check doubtful questions against the source before importing."
        />
        <div className="mt-5 divide-y divide-slate-100">{visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(({ row: candidate, index }) => <div key={index} className="flex items-start gap-3 py-4"><input type="checkbox" aria-label={`Import row ${index + 1}`} disabled={Boolean(candidate.errors.length) && !selected.includes(index)} checked={selected.includes(index)} onChange={() => setSelected(current => current.includes(index) ? current.filter(value => value !== index) : [...current, index])} className="mt-1 size-4 accent-violet-600" /><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-semibold">Source question {candidate.sourceNumber}. {candidate.question.text || candidate.title}</p><p className="mt-1 text-xs text-slate-500">{candidate.sourcePages.length ? `Source pages ${candidate.sourcePages.join(", ")} · ` : ""}{candidate.question.accessLevel} · {candidate.question.options.length} items · {(candidate.question.dropTargets || []).length} groups · {(candidate.question.correctPlacements || []).length} mapped</p>{Boolean(candidate.errors.length || (candidate.warnings.length && !candidate.reviewed)) && <p className="mt-1 text-xs text-amber-700">{[...candidate.errors, ...(!candidate.reviewed ? candidate.warnings : [])].join(" · ")}</p>}</div><span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${statusOf(candidate) === "ready" ? "text-emerald-700" : statusOf(candidate) === "fix" ? "text-rose-700" : "text-amber-700"}`}>{statusOf(candidate) === "ready" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{statusOf(candidate) === "fix" ? "Needs fix" : statusOf(candidate) === "ready" ? "Ready" : "Doubtful"}</span><button type="button" className="cursor-pointer text-sm font-bold text-violet-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700" onClick={() => open(index)}>{statusOf(candidate) === "ready" ? "Edit" : "Fix"}</button></div>)}{!visible.length && <p className="py-8 text-center text-sm text-slate-500">No questions match these filters.</p>}</div>
        {visible.length > PAGE_SIZE && <div className="mt-4 flex items-center justify-between"><button disabled={currentPage <= 1} className={`${secondaryButton} disabled:opacity-40`} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="text-sm">{currentPage} / {pageCount}</span><button disabled={currentPage >= pageCount} className={`${secondaryButton} disabled:opacity-40`} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        {invalid > 0 && <p className="mt-4 text-sm text-rose-700">{invalid} selected rows need correction before import. Fix them or select all valid rows above.</p>}
        <button disabled={busy || !selected.length || invalid > 0} className={`${primaryButton} mt-5 rounded-lg disabled:opacity-40`} onClick={() => void commit()}>Import {selected.length} selected drafts</button>
      </>}
    </div>}
    {job && row && editing !== null && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3"><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Review source question ${row.sourceNumber}`} className={`flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)] ${row.sourcePages.length ? "max-w-[1500px]" : "max-w-3xl"}`}><div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fix and move to Ready</p><h2 className="mt-1 text-lg font-bold">Source question {row.sourceNumber}</h2></div><button ref={closeRef} type="button" aria-label="Close review" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950" onClick={() => setEditing(null)}><X size={20} /></button></div><div className={`grid min-h-0 flex-1 overflow-y-auto ${row.sourcePages.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}><div className={`${row.sourcePages.length ? "space-y-4" : "hidden"} border-b border-slate-200 bg-slate-50 p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r`}><h3 className="font-bold">Source pages</h3>{row.sourcePages.length ? <><div className="flex flex-wrap gap-2">{row.sourcePages.map(number => <button type="button" key={number} className={`rounded-lg border px-3 py-2 text-xs font-bold ${sourcePage === number ? "border-violet-700 bg-violet-50" : "border-slate-300 bg-white"}`} onClick={() => setSourcePage(number)}>Page {number}{row.answerPages?.includes(number) ? " · Answer" : ""}</button>)}</div><a href={`/api/backend/practice-items/drag-drop/admin/imports/${job.id}/pages/${sourcePage}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-violet-700 underline">Open full size source page</a><Image unoptimized src={`/api/backend/practice-items/drag-drop/admin/imports/${job.id}/pages/${sourcePage}`} alt={`Source page ${sourcePage}`} width={1200} height={850} className="h-auto w-full border border-slate-300 bg-white" /></> : <p className="text-sm text-slate-600">{job.sourceKind === "json" ? "This row came from JSON. Check its values against your source before saving." : "Source pages were not detected. Check the PDF before using this row."}</p>}
      {job.sourceKind === "pdf" && row.sourcePages.length > 0 && <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"><h4 className="text-sm font-bold">Optional exhibit crop</h4><p className="text-xs text-slate-600">Use only the exhibit area. Answer pages cannot be used as student images.</p><div className="grid grid-cols-2 gap-2">{(["left", "top", "width", "height"] as const).map(field => <label key={field} className="grid gap-1 text-xs capitalize">{field} %<input type="number" min={0} max={100} value={crop[field]} onChange={event => setCrop({ ...crop, [field]: Number(event.target.value) })} className="rounded border border-slate-300 px-2 py-2" /></label>)}</div><button type="button" disabled={busy || row.answerPages?.includes(sourcePage)} className={`${secondaryButton} rounded-lg disabled:opacity-40`} onClick={() => void saveCrop()}>Use crop from page {sourcePage}</button></div>}
    </div><div className="min-h-0 space-y-4 overflow-y-auto p-5 sm:p-6"><label className="grid gap-2 text-sm font-bold">Question title<input value={title} onChange={event => setTitle(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" /></label>{row.warnings.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{row.warnings.join(" · ")}</p>}{modalNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{modalNotice}</p>}{modalError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{modalError}</p>}<QuestionEditor key={`${editing}-${revision}`} initial={row.question} fixedType="DRAG_DROP" importMode busy={busy} onSave={async question => save(question)} /></div></div></div></div>}
  </section>;
}
