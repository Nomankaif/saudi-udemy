"use client";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, messageOf } from "@/lib/api";
type History = {
  _id: string;
  examTitle: string;
  mode: string;
  status: string;
  createdAt: string;
  questionCount: number;
  result?: { percentage: number };
  examId?: { slug: string };
};
export function AttemptHistory() {
  const [filter, setFilter] = useState("all");
  const [rows, setRows] = useState<History[]>([]),
    [message, setMessage] = useState("Loading attempts…");
  useEffect(() => {
    api<History[]>("/attempts/history")
      .then((data) => {
        setRows(data);
        setMessage(
          data.length
            ? ""
            : "Your first practice session starts here. Browse exams to begin.",
        );
      })
      .catch((error) => setMessage(messageOf(error)));
  }, []);
  const completed = rows.filter((row) => row.result);
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <div className="flex flex-wrap justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">My exams</h1>
          <p className="mt-2 text-sm text-slate-500">
            Continue a session or review your results.
          </p>
        </div>
        <Link
          className="h-fit rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          href="/exams"
        >
          Browse exams
        </Link>
      </div>
      <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-slate-50/50 sm:grid-cols-3 sm:divide-x sm:divide-slate-200">
        {[
          ["Sessions", rows.length],
          ["Completed", completed.length],
          [
            "Average score",
            completed.length
              ? `${Math.round(completed.reduce((sum, row) => sum + (row.result?.percentage || 0), 0) / completed.length)}%`
              : "—",
          ],
        ].map(([label, value]) => (
          <div key={label} className="px-6 py-5">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <strong className="mt-2 block text-2xl font-semibold tabular-nums">
              {value}
            </strong>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div aria-label="Filter attempts" className="flex gap-1">
          {[
            ["all", "All attempts"],
            ["progress", "In progress"],
            ["completed", "Completed"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value || "all")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${filter === value ? "bg-slate-100 text-slate-950" : "text-slate-500 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Link
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          href="/dashboard/access-requests"
        >
          <ShieldCheck size={15} />
          Access requests
        </Link>
      </div>
      {message && (
        <p role="status" className="rounded-xl bg-slate-50 p-8 text-slate-500">
          {message}
        </p>
      )}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
        <div className="hidden grid-cols-[1fr_100px_140px] gap-5 bg-slate-50 px-6 py-3 text-xs font-medium text-slate-500 sm:grid">
          <span>Exam / Session details</span>
          <span className="text-right">Score</span>
          <span className="text-right">Action</span>
        </div>
        {rows
          .filter(
            (row) =>
              filter === "all" ||
              (filter === "progress"
                ? row.status === "IN_PROGRESS"
                : Boolean(row.result)),
          )
          .map((row) => (
            <article
              className="grid items-center gap-5 bg-white px-6 py-5 transition-colors hover:bg-slate-50/60 sm:grid-cols-[1fr_245px]"
              key={row._id}
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{row.examTitle}</h3>
                <p className="mt-2 text-xs text-slate-500">
                  {row.mode === "PRACTICE" ? "Practice" : "Timed exam"} ·{" "}
                  {row.questionCount} questions ·{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(row.createdAt))}
                </p>
                <span
                  className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${row.status === "IN_PROGRESS" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}
                >
                  {row.status === "IN_PROGRESS"
                    ? "In progress"
                    : row.status === "EXPIRED"
                      ? "Time ended"
                      : "Completed"}
                </span>
              </div>
              <div className="flex items-center justify-end gap-5">
                {
                  <strong className="flex-1 text-right text-sm font-semibold tabular-nums text-slate-800">
                    {row.result ? `${row.result.percentage}%` : "—"}
                  </strong>
                }
                <Link
                  className={`inline-flex min-h-9 w-[140px] justify-center rounded-md px-3 py-2 text-xs font-semibold ${row.status === "IN_PROGRESS" ? "bg-slate-900 text-white hover:bg-slate-700" : "border border-slate-300 text-slate-700 hover:bg-white"}`}
                  href={
                    row.status === "IN_PROGRESS"
                      ? `/learn/${row._id}`
                      : `/results/${row._id}`
                  }
                >
                  {row.status === "IN_PROGRESS"
                    ? "Resume exam"
                    : "View results"}
                </Link>
              </div>
            </article>
          ))}
        {!message &&
          !rows.some(
            (row) =>
              filter === "all" ||
              (filter === "progress"
                ? row.status === "IN_PROGRESS"
                : Boolean(row.result)),
          ) && (
            <p className="p-8 text-center text-sm text-slate-500">
              No attempts in this category.
            </p>
          )}
      </div>
    </div>
  );
}
