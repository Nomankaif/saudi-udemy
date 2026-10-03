"use client";
import { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import type { Question } from "@/lib/types";
import { QuestionEditor, questionIssues } from "./question-editor";
import { primaryButton, secondaryButton } from "./ui";
export function ImportQuestions({
  examId,
  onImported,
}: {
  examId: string;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<Question[]>([]),
    [selected, setSelected] = useState<number[]>([]),
    [editing, setEditing] = useState<number | null>(null),
    [page, setPage] = useState(1),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [duplicates, setDuplicates] = useState(false),
    [fileName, setFileName] = useState("");
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const data = new FormData();
      data.set("file", file);
      const result = await api<{ questions: Question[] }>(
        `/exams/${examId}/import/preview`,
        { method: "POST", body: data },
      );
      setRows(result.questions);
      setSelected(
        result.questions.flatMap((q, i) =>
          !q.errors?.length && !q.duplicate ? [i] : [],
        ),
      );
      setFileName(file.name);
      setPage(1);
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ imported: number }>(
        `/exams/${examId}/import/commit`,
        {
          method: "POST",
          body: JSON.stringify({
            questions: rows.filter((_, i) => selected.includes(i)),
            allowDuplicates: duplicates,
          }),
        },
      );
      setRows([]);
      setSelected([]);
      setMessage(
        `${result.imported} questions imported into the draft. Publish when ready.`,
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
          Upload up to 1,000 questions per file (15 MB). Word and PDF should use
          labelled question blocks. Scanned PDFs need OCR and are not supported
          yet. Embedded document images are not imported; add image URLs in the
          editor.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          For multiple-answer MCQs, enter A,C in the correct_answer cell, or
          use Answers: A, C in a question block. These are imported as Multiple
          answers questions; review the checked options before publishing.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {["xlsx", "csv", "docx"].map((format) => (
            <a
              className={secondaryButton}
              key={format}
              href={`/api/backend/exams/templates/${format}`}
            >
              <FileText size={15} />
              {format.toUpperCase()} template
            </a>
          ))}
        </div>
        <label className="mt-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 px-5 py-9 text-center">
          <Upload className="text-violet-600" />
          <strong>
            {busy ? "Processing…" : "Choose a Word, PDF or Excel file"}
          </strong>
          <span className="text-sm text-slate-500">
            .docx · .pdf · .xlsx · .csv
          </span>
          <input
            type="file"
            aria-label="Import question file"
            accept=".docx,.pdf,.xlsx,.csv"
            disabled={busy}
            className="max-w-full text-sm"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
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
                {rows.length} detected · {selected.length} selected ·{" "}
                {rows.filter((q) => questionIssues(q).length).length} need
                correction
              </p>
            </div>
            <button
              className={secondaryButton}
              onClick={() =>
                setSelected(
                  rows.flatMap((q, i) =>
                    !questionIssues(q).length && (!q.duplicate || duplicates)
                      ? [i]
                      : [],
                  ),
                )
              }
            >
              Select valid rows
            </button>
          </div>
          <div className="mt-5 divide-y divide-slate-100">
            {rows.slice((page - 1) * 20, page * 20).map((q, index) => {
              const i = (page - 1) * 20 + index;
              const issues = questionIssues(q);
              return (
                <div className="flex items-start gap-3 py-4" key={i}>
                  <input
                    aria-label={`Import row ${i + 1}`}
                    type="checkbox"
                    className="mt-1 size-4 accent-violet-600"
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
                      {i + 1}. {q.text || "Missing question"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {q.accessLevel} · Answer{" "}
                      {q.correctOptionIds.join(", ") || "missing"}{" "}
                      {q.duplicate && "· Suspected duplicate"}
                    </p>
                    {issues.length > 0 && (
                      <p className="mt-1 text-xs text-amber-700">
                        {issues.join(" · ")}
                      </p>
                    )}
                  </div>
                  {issues.length ? (
                    <AlertCircle className="text-amber-500" size={18} />
                  ) : (
                    <CheckCircle2 className="text-emerald-600" size={18} />
                  )}
                  <button
                    onClick={() => setEditing(i)}
                    className="text-sm font-bold text-violet-600"
                  >
                    Correct
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <button
              disabled={page === 1}
              className={`${secondaryButton} disabled:opacity-40`}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span className="text-sm">
              {page} / {Math.ceil(rows.length / 20)}
            </span>
            <button
              disabled={page * 20 >= rows.length}
              className={`${secondaryButton} disabled:opacity-40`}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={duplicates}
              onChange={(e) => setDuplicates(e.target.checked)}
            />
            Allow selected suspected duplicates
          </label>
          <button
            disabled={
              busy ||
              !selected.length ||
              rows.some(
                (q, i) => selected.includes(i) && questionIssues(q).length > 0,
              )
            }
            className={`${primaryButton} mt-5 disabled:opacity-40`}
            onClick={() => void commit()}
          >
            Import {selected.length} selected questions
          </button>
        </div>
      )}
      {editing !== null && rows[editing] && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/60 p-5">
          <div className="mx-auto max-w-3xl">
            <button
              className="mb-3 bg-white px-4 py-2 font-bold"
              onClick={() => setEditing(null)}
            >
              Close correction
            </button>
            <QuestionEditor
              key={editing}
              initial={rows[editing]}
              importMode
              onSave={async (q) => {
                setRows(
                  rows.map((item, i) =>
                    i === editing ? { ...q, errors: questionIssues(q) } : item,
                  ),
                );
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
