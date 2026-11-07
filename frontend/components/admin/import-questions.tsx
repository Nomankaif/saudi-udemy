"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Template links return downloadable API attachments. */
import { useEffect, useRef, useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import type { Question } from "@/lib/types";
import { QuestionEditor, questionIssues, importQuestionIssues } from "./question-editor";
import { ImportReviewControls } from "./import-review-controls";
import { primaryButton, secondaryButton } from "./ui";
type ImportReport = {
  sourceKind: "document" | "spreadsheet" | "json";
  detectedHeadings: number; detectedAnswerLines: number | null; numberedRange: number | null; extracted: number;
  readyToImport: number; readyToPublish: number; missingAnswers: number;
  missingExplanations: number; needsSourceReview: number; duplicateNumbers: number; missingNumbers: number[];
  hasSimulationSection: boolean;
};
type ReviewFilter = "all" | "clean" | "review" | "correction";
type AnswerFilter = "all" | "parsed" | "missing";
const PAGE_SIZE = 20;
const rowImportIssues = (question: Question) => [...new Set([...(question.importErrors || []), ...(question.sourceErrors || []), ...importQuestionIssues(question)])];
const hasReviewFlags = (question: Question) => Boolean(question.importWarnings?.length || question.duplicate || question.duplicateSourceNumber);
const needsReview = (question: Question, reviewed: boolean) => !reviewed && hasReviewFlags(question);
const hasParsedAnswer = (question: Question) => {
  const answers = question.correctOptionIds || [];
  const optionIds = new Set(question.options.map(option => option.id));
  return (question.type === "MULTIPLE_CHOICE" ? answers.length >= 2 : answers.length === 1)
    && new Set(answers).size === answers.length
    && answers.every(id => optionIds.has(id));
};
export function ImportQuestions({
  examId,
  onImported,
}: {
  examId: string;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Question[]>([]),
    [activeTab, setActiveTab] = useState<"files" | "json">("files"),
    [selected, setSelected] = useState<number[]>([]),
    [reviewed, setReviewed] = useState<number[]>([]),
    [editing, setEditing] = useState<number | null>(null),
    [page, setPage] = useState(1),
    [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all"),
    [answerFilter, setAnswerFilter] = useState<AnswerFilter>("all"),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [duplicates, setDuplicates] = useState(false),
    [fileName, setFileName] = useState(""),
    [report, setReport] = useState<ImportReport | null>(null),
    [sourceUrl, setSourceUrl] = useState("");
  const sourceUrlRef = useRef("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cleanRows = rows.flatMap((question, index) => !rowImportIssues(question).length && !needsReview(question, reviewed.includes(index)) ? [index] : []);
  const validRows = rows.flatMap((question, index) => !rowImportIssues(question).length && (!question.duplicate || reviewed.includes(index) || duplicates) ? [index] : []);
  const filterRows = (nextReview: ReviewFilter, nextAnswer: AnswerFilter, nextSearch: string) => rows.map((question, index) => ({ question, index })).filter(({ question, index }) => {
    const correction = rowImportIssues(question).length > 0;
    const review = needsReview(question, reviewed.includes(index));
    if (nextReview === "clean" && (correction || review)) return false;
    if (nextReview === "review" && !review) return false;
    if (nextReview === "correction" && !correction) return false;
    if (nextAnswer === "parsed" && !hasParsedAnswer(question)) return false;
    if (nextAnswer === "missing" && hasParsedAnswer(question)) return false;
    const term = nextSearch.trim().toLowerCase();
    return !term || question.text.toLowerCase().includes(term) || String(question.sourceNumber || "").includes(term) || String(index + 1) === term;
  });
  const filteredRows = filterRows(reviewFilter, answerFilter, search);
  function updateFilters(nextReview: ReviewFilter, nextAnswer: AnswerFilter, nextSearch: string) {
    setReviewFilter(nextReview);
    setAnswerFilter(nextAnswer);
    setSearch(nextSearch);
    setPage(1);
    const matches = filterRows(nextReview, nextAnswer, nextSearch);
    const defaultView = nextReview === "all" && nextAnswer === "all" && !nextSearch.trim();
    setSelected(defaultView ? cleanRows : matches.flatMap(({ question, index }) =>
      !rowImportIssues(question).length && (!question.duplicate || reviewed.includes(index) || duplicates) ? [index] : [],
    ));
  }
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)));
  const selectedInvalid = selected.filter(index => !rows[index] || rowImportIssues(rows[index]).length > 0).length;
  const selectedDuplicates = selected.filter(index => rows[index]?.duplicate && !reviewed.includes(index)).length;
  const selectedReview = selected.filter(index => rows[index] && needsReview(rows[index], reviewed.includes(index))).length;
  useEffect(() => () => { if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current); }, []);
  useEffect(() => {
    if (editing === null) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditing(null);
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) return;
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [editing]);
  async function upload(file?: File) {
    if (!file) return;
    if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    sourceUrlRef.current = "";
    setSourceUrl("");
    setBusy(true);
    setMessage("");
    setRows([]);
    setSelected([]);
    setReviewed([]);
    setReport(null);
    setReviewFilter("all");
    setAnswerFilter("all");
    setSearch("");
    try {
      const data = new FormData();
      data.set("file", file);
      const result = await api<{ questions: Question[]; report: ImportReport }>(
        `/exams/${examId}/import/preview`,
        { method: "POST", body: data },
      );
      setRows(result.questions);
      setSelected(
        result.questions.flatMap((q, i) =>
          !rowImportIssues(q).length && !hasReviewFlags(q) ? [i] : [],
        ),
      );
      setReport(result.report);
      setFileName(file.name);
      if (file.name.toLowerCase().endsWith(".pdf")) {
        sourceUrlRef.current = URL.createObjectURL(file);
        setSourceUrl(sourceUrlRef.current);
      }
      setPage(1);
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (selectedReview && !window.confirm(`${selectedReview} selected question${selectedReview === 1 ? "" : "s"} have source-review warnings, repeated numbers, or suspected duplicates. The answer key has not been verified against the source. Import these drafts anyway?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ imported: number }>(
        `/exams/${examId}/import/commit`,
        {
          method: "POST",
          body: JSON.stringify({
            questions: rows.filter((_, i) => selected.includes(i)),
            allowDuplicates: duplicates || selected.some(index => rows[index]?.duplicate && reviewed.includes(index)),
          }),
        },
      );
      setRows([]);
      setSelected([]);
      setReviewed([]);
      setMessage(
        `${result.imported} questions saved as drafts.`,
      );
      onImported();
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
          Bring your question bank
        </p>
        <h2 className="mt-2 text-2xl font-bold">Import, review, then save</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Upload up to 1,000 questions per file (15 MB). Both methods use the same
          review step and save selected questions as drafts. New questions default to Free access.
        </p>
        <div role="tablist" aria-label="Question import format" className="mt-6 flex gap-6 border-b border-slate-200">
          <button type="button" role="tab" id="import-files-tab" aria-controls="import-files-panel" aria-selected={activeTab === "files"} onClick={() => setActiveTab("files")}
            className={`border-b-2 pb-3 text-sm font-semibold ${activeTab === "files" ? "border-violet-600 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
            PDF & documents
          </button>
          <button type="button" role="tab" id="import-json-tab" aria-controls="import-json-panel" aria-selected={activeTab === "json"} onClick={() => setActiveTab("json")}
            className={`border-b-2 pb-3 text-sm font-semibold ${activeTab === "json" ? "border-violet-600 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`}>
            JSON file
          </button>
        </div>
        {activeTab === "files" ? <div role="tabpanel" id="import-files-panel" aria-labelledby="import-files-tab">
          <p className="mt-5 text-sm leading-6 text-slate-500">
            Text-based PDFs can use numbered headings, labeled options and answer lines.
            Scanned pages need OCR; embedded diagrams and PBQs are not imported automatically.
            For multiple answers, use an answer such as A,C.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {["xlsx", "csv", "docx"].map((format) => (
              <a className={secondaryButton} key={format} href={`/api/backend/exams/templates/${format}`}>
                <FileText size={15} />{format.toUpperCase()} template
              </a>
            ))}
          </div>
          <label className="mt-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 px-5 py-9 text-center">
            <Upload className="text-violet-600" />
            <strong>{busy ? "Processing…" : "Choose a PDF, Word or spreadsheet file"}</strong>
            <span className="text-sm text-slate-500">.pdf · .docx · .xlsx · .csv</span>
            <input type="file" aria-label="Import question file" accept=".pdf,.docx,.xlsx,.csv" disabled={busy} className="max-w-full text-sm" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        </div> : <div role="tabpanel" id="import-json-panel" aria-labelledby="import-json-tab">
          <p className="mt-5 text-sm leading-6 text-slate-500">
            Use the template to provide explicit question text, options, correct option IDs and optional explanations.
            Accepts a questions array or an object containing one. JSON still needs source review; it does not verify the answer key for you.
            Image PBQs must be created separately.
          </p>
          <a className={`${secondaryButton} mt-4 inline-flex`} href="/api/backend/exams/templates/json"><FileText size={15} />Download JSON template</a>
          <label className="mt-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 px-5 py-9 text-center">
            <Upload className="text-violet-600" />
            <strong>{busy ? "Processing…" : "Choose a JSON question file"}</strong>
            <span className="text-sm text-slate-500">.json</span>
            <input type="file" aria-label="Import JSON question file" accept=".json,application/json" disabled={busy} className="max-w-full text-sm" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
        </div>}
      </div>
      {message && (
        <p
          role="status"
          className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm"
        >
          {message}
        </p>
      )}
      {rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold">Review {fileName}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {rows.length} extracted · {cleanRows.length} ready · {selected.length} selected for draft import ·{" "}
                {rows.filter((q) => rowImportIssues(q).length).length} need correction · {rows.filter((q, index) => needsReview(q, reviewed.includes(index))).length} doubtful
              </p>
            </div>
          </div>
          {report && <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <p><strong>Import check:</strong> {report.sourceKind === "document" ? `${report.detectedHeadings} numbered headings found, ${report.extracted} question blocks extracted` : `${report.extracted} question entries found`}{report.detectedAnswerLines !== null ? `, ${report.detectedAnswerLines} answer lines found` : ""}{report.numberedRange ? ` (numbering reaches ${report.numberedRange})` : ""}.</p>
            <p>{report.readyToImport} structurally ready for draft import; {report.missingAnswers} missing answer keys.</p>
            {report.needsSourceReview > 0 && <p className="mt-2 text-amber-800"><strong>Source review needed:</strong> {report.needsSourceReview} question(s) may depend on a diagram or interaction, or have an answer-count mismatch. They are not selected automatically.</p>}
            {(report.duplicateNumbers > 0 || report.missingNumbers.length > 0 || report.detectedHeadings !== report.extracted || (report.detectedAnswerLines !== null && report.detectedAnswerLines !== report.extracted)) &&
              <p className="mt-2 text-amber-800"><strong>Check extraction against the source:</strong> {report.duplicateNumbers} repeated numbers; {report.missingNumbers.length ? `missing ${report.missingNumbers.join(", ")}` : "no missing numbers detected"}{report.detectedAnswerLines !== null && report.detectedAnswerLines !== report.extracted ? `; ${report.detectedAnswerLines} answer lines for ${report.extracted} extracted blocks` : ""}. Review the source before importing.</p>}
            {report.hasSimulationSection && <p className="mt-2">A performance-based simulation section was detected and excluded. Set those questions up separately in the PBQ editor.</p>}
          </div>}
          <ImportReviewControls
            total={rows.length} validCount={validRows.length} cleanCount={cleanRows.length}
            onSelectAll={() => setSelected(validRows)}
            onSelectClean={() => setSelected(cleanRows)} onClear={() => setSelected([])}
            search={search} onSearch={value => updateFilters(reviewFilter, answerFilter, value)}
            reviewStatus={reviewFilter} onReviewStatus={value => updateFilters(value as ReviewFilter, answerFilter, search)}
            reviewOptions={[{ value: "all", label: "All rows" }, { value: "clean", label: "Ready" }, { value: "review", label: "Doubtful — check source" }, { value: "correction", label: "Needs correction" }]}
            answerStatus={answerFilter} onAnswerStatus={value => updateFilters(reviewFilter, value as AnswerFilter, search)}
            answerOptions={[{ value: "all", label: "All answer states" }, { value: "parsed", label: "Usable answer key" }, { value: "missing", label: "Missing or invalid key" }]}
            visibleCount={filteredRows.length}
            selectionHelp="Select all valid includes importable questions across every page, including source-review warnings. Select clean includes only Ready questions. Unselect all clears the entire import."
            answerHelp="“Usable answer key” means the answer letters match available options. It does not prove the source answer is factually correct; check doubtful questions against the original file."
          />
          <div className="mt-5 divide-y divide-slate-100">
            {filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(({ question: q, index: i }) => {
              const issues = [...(q.sourceErrors || []), ...questionIssues(q)];
              return (
                <div className="flex items-start gap-3 py-4" key={i}>
                  <input
                    aria-label={`Import row ${i + 1}`}
                    type="checkbox"
                    className="mt-1 size-4 accent-violet-600"
                    disabled={!validRows.includes(i) && !selected.includes(i)}
                    checked={selected.includes(i)}
                    onChange={() =>
                      setSelected(
                        selected.includes(i)
                          ? selected.filter((n) => n !== i)
                          : [...selected, i],
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold">
                      {q.sourceNumber ? `Source question ${q.sourceNumber}` : `Row ${i + 1}`}. {q.text || "Missing question"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {q.sourcePage && sourceUrl ? <><a className="font-semibold text-violet-700 underline" href={`${sourceUrl}#page=${q.sourcePage}`} target="_blank" rel="noopener noreferrer">View source page {q.sourcePage}</a> · </> : q.sourcePage ? <>Source page {q.sourcePage} · </> : null}
                      {q.accessLevel} · Answer{" "}
                      {q.correctOptionIds.join(", ") || "missing"}{" "}
                      {q.duplicate && (reviewed.includes(i) ? "· Duplicate checked" : "· Suspected duplicate")}
                      {q.duplicateSourceNumber && (reviewed.includes(i) ? " · Repeated source number — checked" : " · Repeated source question number — review before selecting")}
                    </p>
                    {issues.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        {issues.join(" · ")}
                      </p>
                    )}
                    {q.importWarnings?.length && !reviewed.includes(i) ? <p className="mt-1 text-xs text-amber-700">{q.importWarnings.join(" · ")}</p> : null}
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${rowImportIssues(q).length ? "text-rose-700" : needsReview(q, reviewed.includes(i)) ? "text-amber-700" : "text-emerald-700"}`}>
                    {rowImportIssues(q).length || needsReview(q, reviewed.includes(i)) ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
                    {rowImportIssues(q).length ? "Needs fix" : needsReview(q, reviewed.includes(i)) ? "Doubtful" : "Ready"}
                  </span>
                  <button
                    onClick={() => setEditing(i)}
                    className="cursor-pointer text-sm font-bold text-violet-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
                  >
                    {rowImportIssues(q).length || needsReview(q, reviewed.includes(i)) ? "Fix" : "Edit"}
                  </button>
                </div>
              );
            })}
            {!filteredRows.length && <p className="py-8 text-center text-sm text-slate-500">No questions match these filters.</p>}
          </div>
          {filteredRows.length > PAGE_SIZE && <div className="mt-4 flex items-center justify-between">
            <button
              disabled={currentPage === 1}
              className={`${secondaryButton} disabled:opacity-40`}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span className="text-sm">
              {currentPage} / {Math.ceil(filteredRows.length / PAGE_SIZE)}
            </span>
            <button
              disabled={currentPage * PAGE_SIZE >= filteredRows.length}
              className={`${secondaryButton} disabled:opacity-40`}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>}
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={duplicates}
              onChange={(e) => setDuplicates(e.target.checked)}
            />
            Allow selected suspected duplicates
          </label>
          {selectedInvalid > 0 && <p role="status" className="mt-4 text-sm text-rose-700">{selectedInvalid} selected {selectedInvalid === 1 ? "row needs" : "rows need"} correction before import. Correct them, or choose Valid or Clean above.</p>}
          {!selectedInvalid && selectedDuplicates > 0 && !duplicates && <p role="status" className="mt-4 text-sm text-amber-800">{selectedDuplicates} selected suspected {selectedDuplicates === 1 ? "duplicate is" : "duplicates are"} blocked. Deselect them or explicitly allow duplicates.</p>}
          {!selectedInvalid && (!selectedDuplicates || duplicates) && selectedReview > 0 && <p className="mt-4 text-sm text-amber-800">{selectedReview} selected {selectedReview === 1 ? "row has" : "rows have"} source-review flags. You will be asked to confirm before importing them.</p>}
          <button
            disabled={
              busy ||
              !selected.length ||
              selectedInvalid > 0 ||
              (selectedDuplicates > 0 && !duplicates)
            }
            className={`${primaryButton} mt-5 disabled:opacity-40`}
            onClick={() => void commit()}
          >
            Import {selected.length} selected drafts
          </button>
        </div>
      )}
      {editing !== null && rows[editing] && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="import-correction-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fix and move to Ready</p>
                <h2 id="import-correction-title" className="mt-1 text-lg font-bold text-slate-950">{rows[editing].sourceNumber ? `Question ${rows[editing].sourceNumber}` : `Row ${editing + 1}`}</h2>
              </div>
              <button ref={closeRef} type="button" aria-label="Close correction" title="Close" onClick={() => setEditing(null)} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              {needsReview(rows[editing], reviewed.includes(editing)) && <div className="mx-5 mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 sm:mx-6">
                <p className="font-semibold">Check this question against the source before marking it ready.</p>
                {rows[editing].importWarnings?.map((warning, index) => <p className="mt-1" key={index}>{warning}</p>)}
                {rows[editing].duplicateSourceNumber && <p className="mt-1">This source question number appears more than once.</p>}
                {rows[editing].duplicate && <p className="mt-1">This question appears to duplicate another question. Saving it as Ready confirms that you checked and accept this duplicate.</p>}
                {rows[editing].sourcePage && sourceUrl && <a className="mt-2 inline-block font-semibold text-violet-700 underline" href={`${sourceUrl}#page=${rows[editing].sourcePage}`} target="_blank" rel="noopener noreferrer">View source page {rows[editing].sourcePage}</a>}
              </div>}
              <QuestionEditor
                key={editing}
                initial={rows[editing]}
                importMode
                onSave={async (q) => {
                  const updated = { ...rows[editing], ...q, sourceErrors: [], errors: questionIssues(q), importErrors: importQuestionIssues(q) };
                  if (rowImportIssues(updated).length) return;
                  setRows(
                    rows.map((item, i) =>
                      i === editing ? updated : item,
                    ),
                  );
                  setReviewed(current => current.includes(editing) ? current : [...current, editing]);
                  setSelected(current => current.includes(editing) ? current : [...current, editing]);
                  setEditing(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
