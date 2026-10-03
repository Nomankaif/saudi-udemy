"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, Copy, Trash2, Send, ArrowLeft } from "lucide-react";
import { api, messageOf, questionIssuesOf, type QuestionIssue } from "@/lib/api";
import type { AdminExam, Question } from "@/lib/types";
import { AdminHeading, inputClass, primaryButton, secondaryButton } from "./ui";
import { QuestionEditor, blankQuestion } from "./question-editor";
import { ImportQuestions } from "./import-questions";
import { CategoryFields } from "./category-fields";

export function ExamWorkspace({ id, initialTab = "questions" }: { id: string; initialTab?: string }) {
  const [exam, setExam] = useState<AdminExam | null>(null),
    [questions, setQuestions] = useState<Question[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [access, setAccess] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<Question>(blankQuestion),
    [editorKey, setEditorKey] = useState(0),
    [tab, setTab] = useState(initialTab),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const loadVersion = useRef(0);
  const [publishIssues, setPublishIssues] = useState<QuestionIssue[]>([]);
  const load = useCallback(async (focus?: string) => {
    const version = ++loadVersion.current;
    try {
      const [examData, data] = await Promise.all([
        api<AdminExam>(`/exams/admin/${id}`),
        api<{ questions: Question[]; total: number; page: number }>(
          focus ? `/exams/${id}/admin/questions?focus=${encodeURIComponent(focus)}` : `/exams/${id}/admin/questions?page=${page}&q=${encodeURIComponent(query)}&access=${access}`,
        ),
      ]);
      if (version !== loadVersion.current) return;
      if (focus) { setQuery(""); setAccess(""); setPage(data.page); }
      setExam(examData);
      setQuestions(data.questions);
      setTotal(data.total);
      setSelected([]);
    } catch (error) {
      if (version !== loadVersion.current) return;
      setMessage(messageOf(error));
    }
  }, [id, page, query, access]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [load]);
  function edit(q: Question) {
    setEditing(q);
    setEditorKey((key) => key + 1);
  }
  async function save(q: Question, next: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<Question>(
        `/exams/${id}/questions${q._id ? `/${q._id}` : ""}`,
        { method: q._id ? "PATCH" : "POST", body: JSON.stringify(q) },
      );
      edit(next ? blankQuestion() : result);
      await load(result._id);
      setMessage("Question saved to draft. Publish to update the live exam.");
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setMessage("");
    setPublishIssues([]);
    try {
      await api(`/exams/${id}/publish`, { method: "POST" });
      await load();
      setMessage("Exam published. Students can now see this release.");
    } catch (error) {
      const issues = questionIssuesOf(error);
      setPublishIssues(issues);
      if (!issues.length) setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove(q: Question) {
    if (
      !confirm(
        "Remove this question from the draft? Existing attempts keep their copy.",
      )
    )
      return;
    try {
      await api(`/exams/${id}/questions/${q._id}`, { method: "DELETE" });
      await load();
      if (editing._id === q._id) edit(blankQuestion());
    } catch (error) {
      setMessage(messageOf(error));
    }
  }
  async function bulk(level: string) {
    try {
      await api(`/exams/${id}/questions/bulk-access`, {
        method: "PATCH",
        body: JSON.stringify({ ids: selected, accessLevel: level }),
      });
      await load();
      setMessage("Access levels updated in draft.");
    } catch (error) {
      setMessage(messageOf(error));
    }
  }
  return (
    <div className="space-y-6">
      <Link
        href="/admin/exams"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"
      >
        <ArrowLeft size={16} />
        All exams
      </Link>
      <AdminHeading
        eyebrow="Exam studio"
        title={exam?.title || "Loading exam…"}
        description={`${exam?.draftCount || 0} draft questions · ${exam?.draftFree || 0} free · ${exam?.status || "DRAFT"}${exam?.hasUnpublishedChanges ? " · Unpublished changes" : ""}`}
        action={
          <button
            disabled={busy || !exam}
            className={`${primaryButton} rounded-lg disabled:opacity-40`}
            onClick={() => void publish()}
          >
            <Send size={16} />
            Publish exam
          </button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-4">
        {["questions", "import", "settings"].map((value) => (
          <button
            key={value}
            className={`rounded-lg px-5 py-2.5 text-sm font-bold capitalize ${tab === value ? "bg-slate-900 text-white" : "bg-white text-slate-500"}`}
            onClick={() => setTab(value)}
          >
            {value}
          </button>
        ))}
        {exam?.status === "PUBLISHED" && (
          <Link
            target="_blank"
            href={`/exams/${exam.slug}`}
            className="ml-auto text-sm font-bold text-violet-700"
          >
            View live exam ↗
          </Link>
        )}
      </div>
      {message && (
        <p
          role="status"
          className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm"
        >
          {message}
        </p>
      )}
      {publishIssues.length > 0 && (
        <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950">
          <h2 className="font-semibold">Publishing stopped: {publishIssues.length} {publishIssues.length === 1 ? "issue" : "issues"} found</h2>
          <p className="mt-1 text-rose-800">Last publish check. Correct the details below, save each question, then publish again. Your drafts are still saved.</p>
          <ul className="mt-4 space-y-3">
            {publishIssues.map((issue, index) => (
              <li key={`${issue.questionId || issue.question}-${index}`}>
                <p className="font-semibold">Question {issue.question}{issue.questionText ? ` — ${issue.questionText}` : ""}</p>
                <p className="mt-1">{issue.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tab === "questions" && (
        <div className="grid items-start gap-6 xl:grid-cols-[320px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4">
            <button
              className={`${primaryButton} w-full rounded-lg`}
              onClick={() => edit(blankQuestion())}
            >
              <Plus size={17} />
              New question
            </button>
            <label className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 px-3">
              <Search size={16} className="text-slate-400" />
              <input
                aria-label="Search question bank"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search questions"
                className="min-w-0 flex-1 py-3 text-sm outline-none"
              />
            </label>
            <select
              aria-label="Filter access"
              className={`${inputClass} mt-3 w-full rounded-lg`}
              value={access}
              onChange={(e) => {
                setAccess(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All access levels</option>
              <option value="FREE">Free</option>
              <option value="PREMIUM">Premium</option>
            </select>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <label className="flex gap-1">
                <input
                  type="checkbox"
                  checked={
                    questions.length > 0 && selected.length === questions.length
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked ? questions.map((q) => q._id!) : [],
                    )
                  }
                />
                Page
              </label>
              <button
                disabled={!selected.length}
                className="rounded bg-emerald-50 px-2 py-1 font-bold text-emerald-700 disabled:opacity-40"
                onClick={() => void bulk("FREE")}
              >
                Make free
              </button>
              <button
                disabled={!selected.length}
                className="rounded bg-violet-50 px-2 py-1 font-bold text-violet-700 disabled:opacity-40"
                onClick={() => void bulk("PREMIUM")}
              >
                Make premium
              </button>
            </div>
            <div className="mt-4 max-h-[640px] space-y-2 overflow-y-auto">
              {questions.map((q) => (
                <div
                  className={`rounded-xl border p-3 ${editing._id === q._id ? "border-violet-300 bg-violet-50" : "border-slate-100"}`}
                  key={q._id}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Select question ${q.displayOrder}`}
                      checked={selected.includes(q._id!)}
                      onChange={() =>
                        setSelected(
                          selected.includes(q._id!)
                            ? selected.filter((x) => x !== q._id)
                            : [...selected, q._id!],
                        )
                      }
                    />
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => edit(q)}
                    >
                      <span className="line-clamp-2 text-sm font-semibold">
                        {q.displayOrder}. {q.text}
                      </span>
                      <span className="mt-2 block text-[11px] font-bold text-violet-600">
                        {q.accessLevel} · {q.topic}
                      </span>
                    </button>
                  </div>
                  <div className="mt-2 flex justify-end gap-3">
                    <button
                      aria-label="Duplicate question"
                      className="p-1 text-slate-500"
                      onClick={() =>
                        edit({ ...q, _id: undefined, displayOrder: 0 })
                      }
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      aria-label="Remove question"
                      className="p-1 text-rose-600"
                      onClick={() => void remove(q)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!questions.length && (
                <p className="p-5 text-center text-sm text-slate-500">
                  No questions yet. Add one or import a file.
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-between text-sm">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="font-bold disabled:opacity-30"
              >
                ← Previous
              </button>
              <span>
                {page}/{Math.max(1, Math.ceil(total / 25))}
              </span>
              <button
                disabled={page * 25 >= total}
                onClick={() => setPage(page + 1)}
                className="font-bold disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </aside>
          <QuestionEditor
            key={editorKey}
            initial={editing}
            onSave={save}
            busy={busy}
            message={message}
          />
        </div>
      )}
      {tab === "import" && (
        <ImportQuestions examId={id} onImported={() => void load()} />
      )}
      {tab === "settings" && exam && (
        <ExamSettings
          initial={exam}
          onSaved={async () => {
            await load();
            setMessage("Settings saved.");
          }}
        />
      )}
    </div>
  );
}
export function ExamSettings({
  initial,
  onSaved,
}: {
  initial?: AdminExam;
  onSaved?: (exam: AdminExam) => Promise<void>;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(initial?.category || "");
  const [subcategory, setSubcategory] = useState(initial?.subcategory || "");
  const [cover, setCover] = useState(initial?.imageUrl || "");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function uploadCover(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage("Choose a JPG, PNG, or WebP image up to 5 MB."); return; }
    setUploading(true); setMessage("");
    try { const body = new FormData(); body.append("file",file); const result = await api<{url:string}>("/media/covers", {method:"POST",body});setCover(result.url); }
    catch(error){setMessage(messageOf(error));}finally{setUploading(false);}
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;
    setBusy(true);
    try {
      const data = { ...Object.fromEntries(new FormData(event.currentTarget)), category, subcategory };
      const exam = await api<AdminExam>(
        `/exams${initial ? `/${initial._id}` : ""}`,
        { method: initial ? "PATCH" : "POST", body: JSON.stringify(data) },
      );
      if (onSaved) await onSaved(exam);
      else router.push(`/admin/exams/${exam._id}`);
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          ["title", "Exam title", initial?.title || ""],
        ].map(([name, label, value]) => (
          <label key={name} className="grid gap-2 text-sm font-bold">
            {label}
            <input
              className={`${inputClass} rounded-lg`}
              name={name}
              defaultValue={value}
              required={name !== "imageUrl"}
            />
          </label>
        ))}
        <CategoryFields category={category} subcategory={subcategory} disabled={busy}
          allowUnassigned={Boolean(initial && !initial.subcategory && category === initial.category)}
          onChange={(parent, child) => { setCategory(parent); setSubcategory(child); }} />
        <div className="space-y-3 sm:col-span-2">
          <input type="hidden" name="imageUrl" value={cover} />
          <p className="text-sm font-bold">Cover image</p>
          {cover && <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><Image src={cover} alt="Exam cover preview" fill unoptimized className="object-cover" /></div>}
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">{uploading ? "Uploading…" : cover ? "Replace image" : "Upload image"}<input aria-label="Upload exam cover" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || busy} className="sr-only" onChange={event=>{void uploadCover(event.target.files?.[0]);event.target.value="";}} /></label>
            {cover && <button type="button" disabled={uploading || busy} onClick={()=>setCover("")} className="px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Remove</button>}
          </div>
          <p className="text-xs text-slate-500">JPG, PNG or WebP. Maximum 5 MB. Recommended ratio: 16:9.</p>
        </div>
        <label className="grid gap-2 text-sm font-bold sm:col-span-2">
          Short description
          <textarea
            name="shortDescription"
            required
            className={`${inputClass} rounded-lg`}
            rows={2}
            defaultValue={initial?.shortDescription}
          />
        </label>
        <label className="grid gap-2 text-sm font-bold sm:col-span-2">
          Complete description
          <textarea
            name="description"
            className={`${inputClass} rounded-lg`}
            rows={5}
            defaultValue={initial?.description}
          />
        </label>
        {[
          [
            "durationMinutes",
            "Default time limit (minutes)",
            initial?.durationMinutes || 60,
            1,
            1440,
          ],
          [
            "passingPercentage",
            "Passing percentage",
            initial?.passingPercentage ?? 70,
            0,
            100,
          ],
          [
            "validityDays",
            "Default premium validity (days)",
            initial?.validityDays || 30,
            1,
            3650,
          ],
        ].map(([name, label, value, min, max]) => (
          <label key={String(name)} className="grid gap-2 text-sm font-bold">
            {label}
            <input
              name={String(name)}
              type="number"
              required
              min={Number(min)}
              max={Number(max)}
              defaultValue={value}
              className={`${inputClass} rounded-lg`}
            />
          </label>
        ))}
      </div>
      <p role="status" className="mt-5 text-sm text-red-700">
        {message}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {initial?.status === "PUBLISHED" && (
          <button
            type="button"
            className={secondaryButton}
            onClick={async () => {
              try {
                await api(`/exams/${initial._id}/unpublish`, {
                  method: "POST",
                });
                if (onSaved) await onSaved(initial);
              } catch (error) {
                setMessage(messageOf(error));
              }
            }}
          >
            Unpublish exam
          </button>
        )}
        <button
          disabled={busy || uploading}
          className={`${primaryButton} rounded-lg disabled:opacity-40`}
        >
          {busy
            ? "Saving…"
            : initial
              ? "Save settings"
              : "Create draft & add questions"}
        </button>
      </div>
    </form>
  );
}
