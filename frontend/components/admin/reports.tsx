"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, messageOf } from "@/lib/api";
import { AdminHeading, primaryButton } from "./ui";
import { AdminAnalytics } from "./analytics";
type Report = {
  _id: string;
  userId?: { firstName: string; lastName: string; email: string };
  examId?: { title: string };
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  createdAt: string;
};
export function AdminReports({ overview = false }: { overview?: boolean }) {
  return overview ? <AdminAnalytics /> : <ResultReports />;
}
function ResultReports({ overview = false }: { overview?: boolean }) {
  const [stats, setStats] = useState<Record<string, number>>({}),
    [items, setItems] = useState<Report[]>([]),
    [message, setMessage] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  useEffect(() => {
    Promise.all([
      api<Record<string, number>>("/reports/overview"),
      api<{ items: Report[]; total: number }>(`/reports/results?page=${page}`),
    ])
      .then(([summary, report]) => {
        setStats(summary);
        setItems(report.items);
        setTotal(report.total);
      })
      .catch((error) => setMessage(messageOf(error)));
  }, [page]);
  return (
    <div className="space-y-6">
      <AdminHeading
        eyebrow="Platform activity"
        title={
          overview ? "Welcome to your exam studio" : "Results & performance"
        }
        description="A live view of your exams and learner progress."
        action={
          <Link
            href="/admin/exams/new"
            className={`${primaryButton} rounded-lg`}
          >
            Create exam
          </Link>
        }
      />
      {message && (
        <p role="status" className="rounded-lg bg-amber-50 p-4">
          {message}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Object.entries(stats).map(([label, value]) => (
          <div
            className="rounded-xl border border-slate-200 bg-white p-5"
            key={label}
          >
            <p className="text-sm capitalize text-slate-500">{label}</p>
            <strong className="mt-2 block text-3xl">{value}</strong>
          </div>
        ))}
      </div>
      {overview && (
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/exams"
            className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white"
          >
            Manage question banks
          </Link>
          <Link
            href="/admin/access-requests"
            className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold"
          >
            Review access requests ({stats.pending || 0})
          </Link>
        </div>
      )}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 p-6 text-xl font-bold">
          Recent results
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-2xl text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Student",
                  "Exam",
                  "Score",
                  "Correct / wrong / skipped",
                  "Date",
                ].map((label) => (
                  <th className="px-5 py-4" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id} className="border-t border-slate-100">
                  <td className="px-5 py-4">
                    {item.userId?.firstName} {item.userId?.lastName}
                    <small className="block text-slate-400">
                      {item.userId?.email}
                    </small>
                  </td>
                  <td className="px-5 py-4 font-semibold">
                    {item.examId?.title}
                  </td>
                  <td className="px-5 py-4 font-bold text-violet-700">
                    {item.percentage}%
                  </td>
                  <td className="px-5 py-4">
                    {item.correctCount} / {item.incorrectCount} /{" "}
                    {item.unansweredCount}
                  </td>
                  <td className="px-5 py-4">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && (
          <p className="p-10 text-center text-slate-500">
            Results appear when students complete sessions.
          </p>
        )}
        <div className="flex justify-between border-t border-slate-100 p-5 text-sm">
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="font-bold disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            {page}/{Math.max(1, Math.ceil(total / 25))}
          </span>
          <button
            disabled={page * 25 >= total}
            onClick={() => setPage(page + 1)}
            className="font-bold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </section>
    </div>
  );
}
