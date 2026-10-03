"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, messageOf } from "@/lib/api";
import { AdminHeading } from "./ui";
type Analytics = {
  activity: { date: string; count: number }[];
  popular: { _id: string; title: string; count: number }[];
  requests: { label: string; count: number }[];
  activeLearners: number;
};
function Bars({
  rows,
  color = "bg-violet-600",
}: {
  rows: { label: string; count: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="mt-6 space-y-5">
      {rows.length ? (
        rows.map((row) => (
          <div key={row.label} className="space-y-2">
            <div className="flex justify-between gap-4 text-sm">
              <span
                className="min-w-0 truncate text-slate-600"
                title={row.label}
              >
                {row.label}
              </span>
              <strong>{row.count}</strong>
            </div>
            <div className="h-3 overflow-hidden rounded bg-slate-100">
              <div
                className={`h-full rounded ${color}`}
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))
      ) : (
        <p className="py-8 text-sm text-slate-500">No activity recorded yet.</p>
      )}
    </div>
  );
}
export function AdminAnalytics() {
  const [data, setData] = useState<Analytics | null>(null),
    [stats, setStats] = useState<Record<string, number>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Analytics>("/reports/analytics"),
      api<Record<string, number>>("/reports/overview"),
    ])
      .then(([analytics, summary]) => {
        if (active) {
          setData(analytics);
          setStats(summary);
        }
      })
      .catch((error) => {
        if (active) setError(messageOf(error));
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="space-y-6">
      <AdminHeading
        eyebrow="Administration"
        title="Platform overview"
        description="Monitor exam demand, learner activity, and access approvals."
      />
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-700">
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="p-6 text-slate-500">
          Loading platform analytics…
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Registered learners", stats.students],
              ["Published exams", stats.exams],
              ["Active learners · 14 days", data.activeLearners],
              ["Pending approvals", stats.pending],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <p className="text-sm text-slate-500">{label}</p>
                <strong className="mt-2 block text-3xl">{value}</strong>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/exams"
              className="rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white"
            >
              Manage exams
            </Link>
            <Link
              href="/admin/access-requests"
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold"
            >
              Review access requests ({stats.pending || 0})
            </Link>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h2 className="text-xl font-bold">Exam activity</h2>
                <p className="text-sm text-slate-500">Sessions started each day · Last 14 days · UTC</p>
              </div>
              <p className="text-sm text-slate-500"><strong className="text-xl text-slate-950">{data.activity.reduce((sum, day) => sum + day.count, 0)}</strong> sessions</p>
            </div>
            <div className="mt-7 overflow-x-auto">
              <div className="flex min-w-[560px] items-end gap-3 border-b border-slate-200 pb-2">
                {data.activity.map((day) => (
                  <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">{day.count}</span>
                    <div className="flex h-40 w-full items-end justify-center">
                      <div title={`${day.date}: ${day.count} sessions`} className="w-full max-w-10 rounded-t bg-violet-600" style={{ height: `${(day.count / Math.max(1, ...data.activity.map(item => item.count))) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500">{day.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold">Most-used exams</h2>
              <p className="mt-1 text-sm text-slate-500">
                Top 5 by sessions started in the last 14 days
              </p>
              <Bars
                rows={data.popular.map((exam) => ({
                  label: exam.title,
                  count: exam.count,
                }))}
              />
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold">Access request status</h2>
              <p className="mt-1 text-sm text-slate-500">
                All requests by current status, including expired approvals
              </p>
              <Bars
                color="bg-slate-700"
                rows={data.requests.map((row) => ({
                  label: row.label.charAt(0) + row.label.slice(1).toLowerCase(),
                  count: row.count,
                }))}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
