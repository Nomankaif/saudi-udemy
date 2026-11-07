"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, Upload, X } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import { AdminHeading, inputClass, primaryButton, secondaryButton } from "@/components/admin/ui";
import { LabDetailsFields, LabWorkflowTabs, type LabDetailsValue } from "./lab-details-fields";
import { NetworkTopology } from "./network-topology";
import type { Device, LabLink } from "./types";

type ImportReview = { sourceCoverage?: string; requiredCapabilities?: string[]; assumptions?: string[]; unresolvedRequirements?: string[] };
type LabDefinition = Record<string, unknown> & { title?: string; instructions?: string; topology?: string; authorNotes?: string; devices?: unknown[]; links?: unknown[]; tasks?: unknown[]; access?: string; durationMinutes?: number; importReview?: ImportReview };
type Candidate = { sourceNumber: number; sourcePages: number[]; title: string; sourceText: string; definition: LabDefinition; errors: string[]; exclusionReasons: string[]; reviewNotes: string[]; warnings: string[]; reviewed: boolean };
type ImportJob = { id: string; filename: string; sourceKind: "pdf" | "json"; status: "QUEUED" | "PROCESSING" | "READY" | "FAILED"; details?: Partial<LabDetailsValue> | null; category: string; subcategory: string; processedPages: number; totalPages: number; expectedItems: number; processedItems: number; error: string; inventoryIssues: string[]; sourceExclusions: { sourceId: string; title: string; reason: string; sourcePages: number[] }[]; candidates: Candidate[] };
type ReviewFilter = "all" | "ready" | "review" | "fix";
type EditField = "devices" | "links" | "tasks";
const STORAGE_KEY = "lab-import-job";
const PAGE_SIZE = 20;
const IMPORT_STEPS = ["Details", "Import PDF or JSON", "Tasks & grading"] as const;
const rowStatus = (row: Candidate) => row.exclusionReasons.length ? "fix" : row.reviewed ? "ready" : "review";
const sourcePageUrl = (job: ImportJob, page: number) => `/api/backend/labs/admin/imports/${job.id}/pages/${page}`;

function connectionPreview(deviceJson: string, linkJson: string): { devices: Device[]; links: LabLink[] } | null {
  try {
    const devices: unknown = JSON.parse(deviceJson);
    const links: unknown = JSON.parse(linkJson);
    if (!Array.isArray(devices) || !Array.isArray(links)) return null;
    if (!devices.every(value => value && typeof value.name === "string" && typeof value.type === "string") ||
        !links.every(value => value && typeof value.fromDevice === "string" && typeof value.fromInterface === "string" && typeof value.toDevice === "string" && typeof value.toInterface === "string")) return null;
    return { devices: devices as Device[], links: links as LabLink[] };
  } catch { return null; }
}

export function LabImport() {
  const router = useRouter();
  const [step, setStep] = useState<string>("Details");
  const [format, setFormat] = useState<"pdf" | "json">("pdf");
  const [details, setDetails] = useState<LabDetailsValue>({ title: "", category: "", subcategory: "", imageUrl: "", instructions: "", access: "FREE", durationMinutes: 60, examId: "" });
  const [exams, setExams] = useState<{ _id: string; title: string; status: string }[]>([]);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<LabDefinition>({});
  const [arrayText, setArrayText] = useState<Record<EditField, string>>({ devices: "[]", links: "[]", tasks: "[]" });
  const [review, setReview] = useState({ sourceCoverage: "partial", requiredCapabilities: "", assumptions: "", unresolvedRequirements: "" });
  const [sourcePage, setSourcePage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const initialized = useRef("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (id: string) => {
    try {
      const data = await api<ImportJob>(`/labs/admin/imports/${id}`);
      setJob(data);
      setDetails(current => ({ ...current, ...(data.details || {}), category: data.category, subcategory: data.subcategory || "" }));
      if (data.status === "READY" && initialized.current !== data.id) {
        initialized.current = data.id;
        setSelected(data.candidates.flatMap((row, index) => row.reviewed && !row.exclusionReasons.length ? [index] : []));
        setStep("Tasks & grading");
      }
      if (data.status === "FAILED") setMessage(data.error || "Lab extraction failed.");
    } catch (error) { setMessage(messageOf(error)); }
  }, []);
  useEffect(() => {
    const id = window.localStorage.getItem(STORAGE_KEY);
    if (id) { const timer = setTimeout(() => void load(id), 0); return () => clearTimeout(timer); }
  }, [load]);
  useEffect(() => { api<{ _id: string; title: string; status: string }[]>("/exams/admin/all").then(rows => setExams(rows.filter(row => row.status === "PUBLISHED"))).catch(error => setMessage(messageOf(error))); }, []);
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
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setEditing(null); }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable.item(0), last = focusable.item(focusable.length - 1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [editing]);

  const rows = job?.candidates || [];
  const excluded = rows.filter(row => row.exclusionReasons.length).map(row => ({ sourceNumber: row.sourceNumber, title: row.title, reasons: row.exclusionReasons }));
  const supported = rows.length - excluded.length;
  const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) =>
    (filter === "all" || rowStatus(row) === filter) && (!query.trim() || `${row.sourceNumber} ${row.title} ${row.sourceText}`.toLowerCase().includes(query.trim().toLowerCase())));
  const valid = rows.flatMap((row, index) => row.exclusionReasons.length ? [] : [index]);
  const clean = rows.flatMap((row, index) => row.reviewed && !row.exclusionReasons.length ? [index] : []);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const invalidCount = selected.filter(index => !rows[index] || rows[index].exclusionReasons.length).length;
  const unreviewedCount = selected.filter(index => rows[index] && !rows[index].reviewed).length;

  async function upload(file?: File) {
    if (!file) return;
    if (!details.title.trim() || !details.category) { setMessage("Enter a lab title and select a category in Details."); setStep("Details"); return; }
    if (details.access === "PREMIUM" && !details.examId) { setMessage("Link a published exam for premium labs."); setStep("Details"); return; }
    if (file.size > (format === "pdf" ? 50 : 5) * 1024 * 1024) { setMessage(`${format.toUpperCase()} file is too large.`); return; }
    setBusy(true); setMessage(""); setJob(null); setSelected([]); setQuery(""); setFilter("all"); setPage(1); initialized.current = "";
    try {
      const body = new FormData(); body.set("file", file); body.set("category", details.category); body.set("subcategory", details.subcategory || ""); body.set("details", JSON.stringify(details));
      const result = await api<{ id: string }>("/labs/admin/imports", { method: "POST", body });
      window.localStorage.setItem(STORAGE_KEY, result.id);
      await load(result.id);
      setStep("Tasks & grading");
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function uploadCover(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage("Choose a JPG, PNG, or WebP image up to 5 MB."); return; }
    setUploadingCover(true); setMessage("");
    try { const body = new FormData(); body.set("file", file); const result = await api<{ url: string }>("/media/covers", { method: "POST", body }); setDetails(current => ({ ...current, imageUrl: result.url })); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setUploadingCover(false); }
  }
  function open(index: number) {
    const row = rows[index]; if (!row) return;
    setEditing(index); setDraft(structuredClone(row.definition)); setSourcePage(row.sourcePages[0] || 0); setModalError("");
    setArrayText({ devices: JSON.stringify(row.definition.devices || [], null, 2), links: JSON.stringify(row.definition.links || [], null, 2), tasks: JSON.stringify(row.definition.tasks || [], null, 2) });
    const info = row.definition.importReview;
    setReview({ sourceCoverage: info?.sourceCoverage || "partial", requiredCapabilities: (info?.requiredCapabilities || []).join("\n"), assumptions: (info?.assumptions || []).join("\n"), unresolvedRequirements: (info?.unresolvedRequirements || []).join("\n") });
  }
  function setField(key: keyof LabDefinition, value: string | number) { setDraft(current => ({ ...current, [key]: value })); }
  async function save() {
    if (editing === null || !job) return;
    setBusy(true); setModalError("");
    try {
      const arrays = {} as Record<EditField, unknown[]>;
      for (const field of ["devices", "links", "tasks"] as const) {
        try { const value = JSON.parse(arrayText[field]); if (!Array.isArray(value)) throw new Error("Expected a JSON array"); arrays[field] = value; }
        catch (error) { throw new Error(`${field}: ${messageOf(error)}`); }
      }
      const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);
      const updated = await api<Candidate>(`/labs/admin/imports/${job.id}/candidates/${editing}`, { method: "PATCH", body: JSON.stringify({ definition: { ...draft, ...arrays, importReview: { sourceCoverage: review.sourceCoverage, requiredCapabilities: lines(review.requiredCapabilities), assumptions: lines(review.assumptions), unresolvedRequirements: lines(review.unresolvedRequirements) } }, reviewed: true }) });
      setJob({ ...job, candidates: rows.map((row, index) => index === editing ? updated : row) });
      if (!updated.exclusionReasons.length) { setSelected(current => current.includes(editing) ? current : [...current, editing]); setEditing(null); }
      else setModalError("This lab has a simulator or definition error. Review the reasons below and correct it.");
    } catch (error) { setModalError(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!job || !selected.length || invalidCount) return;
    if (unreviewedCount && !window.confirm(`${unreviewedCount} selected lab${unreviewedCount === 1 ? "" : "s"} still need source review. Import them as drafts? They cannot be published until an administrator confirms the source review.`)) return;
    setBusy(true); setMessage("");
    try {
      const result = await api<{ imported: number }>(`/labs/admin/imports/${job.id}/commit`, { method: "POST", body: JSON.stringify({ selected, confirmReview: unreviewedCount > 0 }) });
      window.localStorage.removeItem(STORAGE_KEY);
      router.push(`/admin/labs?imported=${result.imported}`);
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }
  const active = editing === null ? null : rows[editing];
  const preview = active ? connectionPreview(arrayText.devices, arrayText.links) : null;
  function downloadReport() {
    if (!job) return;
    const report = { filename: job.filename, supported, excluded, pendingSourceReview: rows.filter(row => row.reviewNotes?.length).map(row => ({ sourceNumber: row.sourceNumber, title: row.title, notes: row.reviewNotes })), excludedSourceExercises: job.sourceExclusions, inventoryIssues: job.inventoryIssues, note: "Supported means the declared behavior and reference solution passed simulator checks. Compare every lab with its source before publishing." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "lab-import-report.json"; link.click(); URL.revokeObjectURL(url);
  }
  const knownSource = job?.sourceKind === "pdf" && job.expectedItems === 27 && job.totalPages === 64 && rows.every(row => row.warnings?.some(warning => warning.includes("source diagram")));
  return <section className="space-y-6">
    <Link className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950" href="/admin/labs"><ArrowLeft size={16} />Labs</Link>
    <AdminHeading eyebrow="Lab studio" title="Create labs from a file" description="Add the lab details, upload a PDF or JSON file, then review the tasks and grading." />
    <div className="rounded-lg border border-slate-200 bg-white"><LabWorkflowTabs steps={IMPORT_STEPS} active={step} onChange={setStep} /><div className="space-y-6 p-6">
      {step === "Details" && <><p className="text-sm text-slate-600">These details are applied to imported labs. For a file with several labs, the title prefixes each source title. Each lab keeps its own source instructions; shared instructions fill only blank ones.</p><LabDetailsFields value={details} onChange={changes => setDetails(current => ({ ...current, ...changes }))} onUploadCover={file => void uploadCover(file)} uploading={uploadingCover} busy={busy} disabled={Boolean(job)} exams={exams} titleHelp="For multiple labs, this name is used as a prefix so each draft keeps its source title." />{job && <p className="text-sm text-slate-500">Details for this upload are saved. Close the review to start a new import with different details.</p>}<div className="flex justify-end"><button type="button" className={`${primaryButton} rounded-lg`} disabled={!details.title.trim() || !details.category || busy || uploadingCover} onClick={() => { setMessage(""); setStep("Import PDF or JSON"); }}>Continue to import</button></div></>}
      {step === "Import PDF or JSON" && <><div className="flex gap-7 border-b border-slate-200" role="tablist" aria-label="Import format">{(["pdf", "json"] as const).map(item => <button key={item} type="button" role="tab" aria-selected={format === item} className={`border-b-2 px-2 pb-3 text-sm font-semibold ${format === item ? "border-violet-700 text-slate-950" : "border-transparent text-slate-500"}`} onClick={() => setFormat(item)}>{item.toUpperCase()} file</button>)}</div><div><h2 className="text-lg font-bold">{format === "pdf" ? "Upload lab PDF" : "Upload lab JSON"}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{format === "pdf" ? "The source pages remain available during review. Scanned files use offline OCR. Diagrams and grading require your review." : "Labs that pass simulator checks can be imported as drafts. Source notes stay visible and must be confirmed before publishing."}</p></div><div className="flex flex-wrap items-center gap-4"><label className={`${primaryButton} cursor-pointer rounded-lg ${busy || uploadingCover ? "pointer-events-none opacity-50" : ""}`}><Upload size={16} />Choose {format.toUpperCase()} file<input className="sr-only" aria-label={`Upload lab ${format.toUpperCase()}`} type="file" accept={format === "pdf" ? ".pdf,application/pdf" : ".json,application/json"} disabled={busy || uploadingCover} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>{format === "json" && <a className={`${secondaryButton} rounded-lg`} href="/api/backend/labs/admin/import/template" download="lab-import-template.json"><FileText size={16} />Download JSON template</a>}<span className="text-xs text-slate-500">{format === "pdf" ? "Maximum 50 MB · 300 pages" : "Maximum 5 MB · 100 labs"}</span></div><div className="flex justify-between"><button type="button" className={`${secondaryButton} rounded-lg`} onClick={() => setStep("Details")}>Back to details</button>{job && <button type="button" className={`${secondaryButton} rounded-lg`} onClick={() => setStep("Tasks & grading")}>View review</button>}</div></>}
      {step === "Tasks & grading" && !job && <div className="space-y-4"><p className="text-sm text-slate-600">Upload a PDF or JSON file to review its labs, tasks, solutions and grading.</p><button type="button" className={`${primaryButton} rounded-lg`} onClick={() => setStep("Import PDF or JSON")}>Go to import</button></div>}
    </div></div>
    {message && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{message}</p>}
    {step === "Tasks & grading" && job && <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Review {job.filename}</h2><p className="mt-1 text-sm text-slate-600">{job.status === "READY" ? `${rows.length + job.sourceExclusions.length} source exercises · ${supported} supported · ${excluded.length + job.sourceExclusions.length} excluded · ${clean.length} reviewed · ${selected.length} selected` : job.status === "FAILED" ? "Extraction failed" : job.expectedItems ? `Checking ${job.processedItems} of ${job.expectedItems} labs…` : `Reading ${job.processedPages} of ${job.totalPages || "…"} pages…`}</p></div><button className="text-sm font-semibold text-slate-600 underline" onClick={() => { window.localStorage.removeItem(STORAGE_KEY); setJob(null); setSelected([]); setStep("Details"); }}>Close preview</button></div>
      {job.status === "READY" && <>
        <p className="mt-5 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">{knownSource ? "The 27 CCNA lab drafts are mapped to this PDF. Check each source diagram, device configuration, task and reference solution before importing." : job.sourceKind === "pdf" ? "Text was extracted from the PDF. Configure devices, links, tasks and reference solutions for rows marked Needs fix. Add outcome checks when configuration alone cannot prove a result." : "Import labs that pass simulator checks as drafts. Source review notes are shown separately from errors."} Imported labs remain drafts until published from the lab studio.</p>
        <section className="mt-5 rounded-lg border border-slate-200 p-4" aria-label="Lab import report"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Import report</h3><button type="button" className="text-sm font-semibold text-sky-800 underline" onClick={downloadReport}>Download report</button></div><p className="mt-1 text-sm text-slate-600">{supported} simulator supported; {excluded.length + job.sourceExclusions.length} excluded with reasons. Supported labs still need source review before import.</p>{job.inventoryIssues.length > 0 && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{job.inventoryIssues.join("; ")} Correct the JSON source inventory and upload the file again.</p>}{(excluded.length > 0 || job.sourceExclusions.length > 0) && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-rose-800">View excluded source exercises</summary><ul className="mt-3 max-h-64 space-y-3 overflow-y-auto text-sm">{excluded.map(row => <li key={`lab-${row.sourceNumber}`}><strong>Lab {row.sourceNumber}: {row.title}</strong><span className="block text-rose-700">{row.reasons.join("; ")}</span></li>)}{job.sourceExclusions.map(row => <li key={`source-${row.sourceId}`}><strong>Source {row.sourceId}: {row.title}</strong><span className="block text-rose-700">{row.reason}</span></li>)}</ul></details>}</section>
        <div className="mt-6 flex flex-wrap gap-2"><button className={secondaryButton} onClick={() => setSelected(valid)}>Select all valid {valid.length}</button><button className={secondaryButton} onClick={() => setSelected(clean)}>Select reviewed {clean.length}</button><button className="px-3 text-sm font-semibold text-slate-600" onClick={() => setSelected([])}>Unselect all</button></div>
        <div className="mt-6 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Find lab<input className={`${inputClass} w-full rounded-lg`} placeholder="Title or source number" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><label className="grid gap-2 text-sm font-medium">Review status<select className={`${inputClass} w-full rounded-lg`} value={filter} onChange={event => { setFilter(event.target.value as ReviewFilter); setPage(1); }}><option value="all">All rows</option><option value="ready">Ready</option><option value="review">Needs review</option><option value="fix">Needs correction</option></select></label></div>
        <p className="mt-4 text-xs text-slate-500">Showing {visible.length} of {rows.length} labs. Select all valid and Unselect all apply across every page.</p>
        <div className="mt-3 divide-y divide-slate-200">{visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(({ row, index }) => <div className="flex gap-3 py-4" key={`${row.sourceNumber}-${index}`}><input className="mt-1 h-4 w-4 accent-violet-700" type="checkbox" aria-label={`Select lab ${row.sourceNumber}`} disabled={Boolean(row.exclusionReasons.length) && !selected.includes(index)} checked={selected.includes(index)} onChange={event => setSelected(current => event.target.checked ? [...current, index] : current.filter(value => value !== index))} /><div className="min-w-0 flex-1"><button type="button" className="text-left text-sm font-bold text-slate-950 hover:underline" onClick={() => open(index)}>Source lab {row.sourceNumber}. {row.title}</button><p className="mt-1 text-xs text-slate-500">{row.sourcePages.length ? `PDF pages ${row.sourcePages.join(", ")}` : "JSON row"} · {row.definition.devices?.length || 0} devices · {row.definition.tasks?.length || 0} tasks · {row.definition.access || "FREE"}</p>{row.exclusionReasons.length > 0 && <p className="mt-1 text-xs text-rose-700">Excluded · {row.exclusionReasons[0]}{row.exclusionReasons.length > 1 ? ` · +${row.exclusionReasons.length - 1} more` : ""}</p>}{!row.exclusionReasons.length && !row.reviewed && <p className="mt-1 text-xs text-amber-700">{row.reviewNotes?.length ? row.reviewNotes.join(" · ") : "Review against the source before publishing."}</p>}</div><div className="flex shrink-0 items-start gap-3"><span className={`text-xs font-bold ${rowStatus(row) === "ready" ? "text-emerald-700" : rowStatus(row) === "fix" ? "text-rose-700" : "text-amber-700"}`}>{rowStatus(row) === "fix" ? "Excluded" : rowStatus(row) === "ready" ? "Ready" : "Review"}</span><button type="button" className="text-sm font-semibold text-violet-700 hover:underline" onClick={() => open(index)}>{row.exclusionReasons.length ? "Fix" : "Review"}</button></div></div>)}</div>
        {pageCount > 1 && <div className="mt-4 flex items-center justify-between"><button className={secondaryButton} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="text-sm text-slate-500">{currentPage} / {pageCount}</span><button className={secondaryButton} disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        {invalidCount > 0 && <p className="mt-5 text-sm text-rose-700">{invalidCount} selected lab{invalidCount === 1 ? "" : "s"} need correction. Fix them or select valid labs above.</p>}
        <button className={`${primaryButton} mt-5 rounded-lg disabled:cursor-not-allowed disabled:opacity-50`} disabled={busy || !selected.length || invalidCount > 0} onClick={() => void commit()}>{busy ? "Importing…" : `Import ${selected.length} selected draft${selected.length === 1 ? "" : "s"}`}</button>
      </>}
    </div>}
    {active && job && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setEditing(null); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="lab-review-title" className="flex h-[94dvh] max-h-[900px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 id="lab-review-title" className="text-lg font-bold">Review lab {active.sourceNumber}</h2><p className="text-xs text-slate-500">{active.sourcePages.length ? `Source pages ${active.sourcePages.join(", ")}` : "JSON source"} · Save to mark ready</p></div><button ref={closeRef} type="button" aria-label="Close lab review" className="rounded-lg p-2 hover:bg-slate-100" onClick={() => setEditing(null)}><X size={20} /></button></div><div className={`grid min-h-0 flex-1 gap-0 overflow-y-auto overscroll-contain ${job.sourceKind === "pdf" ? "lg:grid-cols-2 lg:overflow-hidden" : ""}`}>
      {job.sourceKind === "pdf" && <div className="min-h-0 border-b border-slate-200 bg-slate-50 p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold">Source PDF</h3><select aria-label="Source page" className={`${inputClass} rounded-lg`} value={sourcePage} onChange={event => setSourcePage(Number(event.target.value))}>{active.sourcePages.map(pageNumber => <option key={pageNumber} value={pageNumber}>Page {pageNumber}</option>)}</select></div>{sourcePage > 0 && <Image key={`${job.id}-${sourcePage}`} src={sourcePageUrl(job, sourcePage)} alt={`PDF source page ${sourcePage}`} width={1000} height={1400} unoptimized className="h-auto w-full rounded-lg border border-slate-200 bg-white" />}{active.sourceText && <p className="mt-4 whitespace-pre-wrap text-xs text-slate-600">{active.sourceText}</p>}</div>}
      <div className={`min-h-0 space-y-5 p-5 ${job.sourceKind === "pdf" ? "lg:overflow-y-auto" : ""}`}><p className="text-sm text-slate-600">Check the source diagram, initial device state, task instructions and reference commands. Additional outcome checks are optional. Device, link and task fields use the same JSON structure as the lab editor.</p>{active.warnings.map((warning, index) => <p key={index} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}{modalError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{modalError}</p>}{active.reviewNotes?.length > 0 && <section className="rounded-lg border border-amber-200 bg-amber-50 p-4" aria-label="Source review notes"><h3 className="text-sm font-bold text-amber-900">Source review needed before publishing</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{active.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></section>}{active.exclusionReasons.length > 0 && <section className="rounded-lg border border-rose-200 bg-rose-50 p-4" aria-label="Lab import issues"><h3 className="text-sm font-bold text-rose-900">Excluded: {active.exclusionReasons.length} reason{active.exclusionReasons.length === 1 ? "" : "s"}</h3><ul className="mt-2 max-h-60 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-rose-800">{active.exclusionReasons.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}</ul></section>}
        <section className="space-y-3 rounded-lg border border-slate-200 p-4" aria-label="Physical connections">
          <div><h3 className="font-bold">Physical connections</h3><p className="mt-1 text-xs text-slate-600">Built from the Devices and Links JSON below. Check every cable and port against the source diagram.</p></div>
          {preview?.devices.length && preview.links.length ? <><NetworkTopology devices={preview.devices} links={preview.links} /><ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-slate-600">{preview.links.map((link, index) => <li key={index}><span className="font-semibold text-slate-900">{link.fromDevice}</span> {link.fromInterface} ↔ <span className="font-semibold text-slate-900">{link.toDevice}</span> {link.toInterface}</li>)}</ul></> : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No valid connections to preview. Add devices and links in the JSON fields below.</p>}
        </section>
        <label className="grid gap-2 text-sm font-medium">Title<input className={`${inputClass} w-full rounded-lg`} value={draft.title || ""} onChange={event => setField("title", event.target.value)} /></label>
        <label className="grid gap-2 text-sm font-medium">Student instructions<textarea className={`${inputClass} min-h-28 w-full rounded-lg`} value={draft.instructions || ""} onChange={event => setField("instructions", event.target.value)} /></label>
        <fieldset className="space-y-4 rounded-lg border border-slate-200 p-4"><legend className="px-1 text-sm font-bold">Source and capability review</legend><label className="grid gap-2 text-sm font-medium">Entire source exercise modeled<select className={`${inputClass} w-full rounded-lg`} value={review.sourceCoverage} onChange={event => setReview(current => ({ ...current, sourceCoverage: event.target.value }))}><option value="partial">No / not yet verified</option><option value="complete">Yes, complete</option></select></label><p className="text-xs text-slate-600">Use the IDs listed in the downloaded template. Put unknown behavior in unresolved requirements. Clear assumptions only after checking the source.</p>{(["requiredCapabilities", "assumptions", "unresolvedRequirements"] as const).map(field => <label key={field} className="grid gap-2 text-sm font-medium"><span>{field === "requiredCapabilities" ? "Required capability IDs" : field === "assumptions" ? "Unconfirmed assumptions" : "Unresolved or new requirements"} <span className="font-normal text-slate-500">· one per line</span></span><textarea className={`${inputClass} min-h-20 w-full rounded-lg`} value={review[field]} onChange={event => setReview(current => ({ ...current, [field]: event.target.value }))} /></label>)}</fieldset>
        <label className="grid gap-2 text-sm font-medium">Topology description<textarea className={`${inputClass} min-h-20 w-full rounded-lg`} value={draft.topology || ""} onChange={event => setField("topology", event.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-medium">Access<select className={`${inputClass} w-full rounded-lg`} value={draft.access || "FREE"} onChange={event => setField("access", event.target.value)}><option value="FREE">Free</option><option value="PREMIUM">Premium</option></select></label><label className="grid gap-2 text-sm font-medium">Duration (minutes)<input className={`${inputClass} w-full rounded-lg`} type="number" min={1} max={1440} value={draft.durationMinutes || 60} onChange={event => setField("durationMinutes", Number(event.target.value))} /></label></div>
        {(["devices", "links", "tasks"] as const).map(field => <label key={field} className="grid gap-2 text-sm font-medium"><span className="capitalize">{field} <span className="font-normal text-slate-500">· JSON array</span></span><textarea spellCheck={false} className={`${inputClass} min-h-40 w-full rounded-lg font-mono text-xs`} value={arrayText[field]} onChange={event => setArrayText(current => ({ ...current, [field]: event.target.value }))} /></label>)}
        <label className="grid gap-2 text-sm font-medium">Author review notes <span className="font-normal text-slate-500">Only admins see these</span><textarea className={`${inputClass} min-h-20 w-full rounded-lg`} value={draft.authorNotes || ""} onChange={event => setField("authorNotes", event.target.value)} /></label>
      </div></div><div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"><span className="text-xs text-slate-500">{editing === null ? 0 : editing + 1} of {rows.length}</span><div className="flex gap-3"><button type="button" className={`${secondaryButton} rounded-lg`} onClick={() => setEditing(null)}>Cancel</button><button type="button" className={`${primaryButton} rounded-lg disabled:opacity-50`} disabled={busy} onClick={() => void save()}><CheckCircle2 size={16} />{busy ? "Saving…" : active.reviewNotes?.length ? "Save draft with review notes" : "Save & mark ready"}</button></div></div></div></div>}
  </section>;
}
