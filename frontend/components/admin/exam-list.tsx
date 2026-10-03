"use client";
import Link from "next/link";
import { CatalogFilters } from "./catalog-filters";
import { useEffect, useRef, useState } from "react";
import { api, messageOf, questionIssuesOf, type QuestionIssue } from "@/lib/api";
import { CardActions, cardPublishButton, cardOpenButton } from "./card-actions";
import type { AdminExam } from "@/lib/types";
import { AdminHeading, primaryButton } from "./ui";
export function AdminExamList({ questions = false }: { questions?: boolean }) {
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState("");
  const [publishing, setPublishing] = useState("");
  const [publishError, setPublishError] = useState<{ id: string; title: string; message: string; issues: QuestionIssue[] } | null>(null);
  const mutation = useRef(false);
  async function publish(exam: AdminExam) {
    if (mutation.current) return;
    mutation.current = true;
    setPublishing(exam._id); setPublishError(null); setMessage("");
    try {
      const updated = await api<AdminExam>(`/exams/${exam._id}/publish`, { method: "POST" });
      setExams(items => items.map(item => item._id === exam._id ? { ...item, ...updated } : item));
      setMessage(`"${exam.title}" published successfully.`);
    } catch (error) {
      setPublishError({ id: exam._id, title: exam.title, message: messageOf(error), issues: questionIssuesOf(error) });
    } finally { mutation.current = false; setPublishing(""); }
  }
  async function remove(exam: AdminExam) {
    if (mutation.current) return;
    if (!window.confirm(`Delete "${exam.title}"? It will be archived and removed from listings. Existing student attempts and results will be preserved.`)) return;
    mutation.current = true;
    setPublishError(null);
    setDeleting(exam._id);
    try {
      await api(`/exams/${exam._id}`, { method: "DELETE" });
      setExams(old => old.filter(item => item._id !== exam._id));
      setMessage(`"${exam.title}" was archived. Student history is preserved.`);
    } catch (error) { setMessage(messageOf(error)); }
    finally { mutation.current = false; setDeleting(""); }
  }
  const [exams, setExams] = useState<AdminExam[]>([]),
    [message, setMessage] = useState("Loading exams…"),
    [query, setQuery] = useState("");
  useEffect(() => {
    api<AdminExam[]>("/exams/admin/all")
      .then((data) => {
        setExams(data);
        setMessage(
          data.length
            ? ""
            : "Create your first exam to start building a question bank.",
        );
      })
      .catch((error) => setMessage(messageOf(error)));
  }, []);
  return (
    <div className="space-y-6">
      <AdminHeading
        eyebrow="Exam studio"
        title={questions ? "Question banks" : "Your exams"}
        description="Create, review and publish professional practice exams."
        action={
          <Link
            href="/admin/exams/new"
            className={`${primaryButton} rounded-lg`}
          >
            Create exam
          </Link>
        }
      />
      <CatalogFilters kind="exams" query={query} status={status} onQuery={setQuery} onStatus={setStatus} />
      {message && (
        <p role="status" className="rounded-xl bg-white p-6 text-slate-500">
          {message}
        </p>
      )}
      {publishError && <section role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
        <h2 className="font-semibold">Could not publish {publishError.title}</h2>
        <p>{publishError.message}</p>
        {publishError.issues.length > 0 && <ul className="list-disc space-y-2 pl-5">{publishError.issues.map((issue, index) => <li key={index}><strong>Question {issue.question}:</strong> {issue.message}{issue.questionText && <p className="mt-1 text-xs">{issue.questionText}</p>}</li>)}</ul>}
        <Link className="inline-block font-semibold underline underline-offset-4" href={`/admin/exams/${publishError.id}`}>Review in question studio</Link>
      </section>}
      {!message && !exams.some(exam => exam.title.toLowerCase().includes(query.trim().toLowerCase()) && (!status || exam.status === status)) && <p className="rounded-xl bg-white p-6 text-sm text-slate-500">No exams match your filters.</p>}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {exams
          .filter((exam) =>
            exam.title
              .toLowerCase()
              .includes(query.trim().toLowerCase()) && (!status || exam.status === status),
          )
          .map((exam) => (
            <article
              key={exam._id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase text-violet-600">
                  {exam.category}{exam.subcategory ? ` / ${exam.subcategory}` : ""}
                </span>
                <div className="flex shrink-0 items-center gap-1"><span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${exam.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {exam.status}
                </span>
                <CardActions title={exam.title} updateHref={`/admin/exams/${exam._id}?tab=settings`} disabled={Boolean(deleting || publishing)} onDelete={() => void remove(exam)} /></div>
              </div>
              <h2 className="mt-5 text-xl font-bold">{exam.title}</h2>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                {exam.shortDescription}
              </p>
              <p className="mt-5 text-xs text-slate-500">
                {exam.questionCount} published questions ·{" "}
                {exam.freeQuestionCount} free
              </p>
              {exam.hasUnpublishedChanges && (
                <p className="mt-2 text-xs text-amber-700">
                  Draft changes waiting to publish
                </p>
              )}
              <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
                <Link href={`/admin/exams/${exam._id}`} aria-label={`Open ${exam.title}`} className={cardOpenButton}>Open</Link>
                <button type="button" className={cardPublishButton} disabled={Boolean(deleting || publishing)} aria-label={`Publish ${exam.title}`} aria-busy={publishing === exam._id} onClick={() => void publish(exam)}>{publishing === exam._id ? "Publishing…" : "Publish"}</button>
              </div>
            </article>
          ))}
      </div>
    </div>
  );
}
