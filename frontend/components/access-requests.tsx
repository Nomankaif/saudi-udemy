"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, messageOf } from "@/lib/api";
import { primaryButton, secondaryButton, inputClass } from "./admin/ui";
type RequestRow = {
  _id: string;
  examId: { _id: string; title: string; slug: string } | null;
  userId?: { firstName: string; lastName: string; email: string };
  status: string;
  userMessage?: string;
  adminNote?: string;
  createdAt: string;
  accessExpiresAt?: string;
};
export function RequestAccess({ examId }: { examId: string }) {
  const router = useRouter();
  const [access, setAccess] = useState<
    "loading" | "active" | "request" | "error"
  >("loading");
  useEffect(() => {
    let active = true;
    const check = () =>
      api<{ premium: boolean }>(`/exams/${examId}/availability`)
        .then((data) => {
          if (active) setAccess(data.premium ? "active" : "request");
        })
        .catch((error) => {
          if (active)
            setAccess(
              error instanceof ApiError && error.status === 401
                ? "request"
                : "error",
            );
        });
    void check();
    window.addEventListener("focus", check);
    return () => {
      active = false;
      window.removeEventListener("focus", check);
    };
  }, [examId]);
  const [message, setMessage] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  async function request() {
    setBusy(true);
    try {
      await api("/access-requests", {
        method: "POST",
        body: JSON.stringify({ examId, userMessage: note }),
      });
      setMessage("Request sent. Your administrator will review it.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        router.push("/login");
      else setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  if (access === "loading")
    return (
      <p role="status" className="py-3 text-sm text-slate-500">
        Checking your access…
      </p>
    );
  if (access === "error")
    return (
      <p role="status" className="py-3 text-sm text-amber-700">
        Unable to check access. Please refresh and try again.
      </p>
    );
  if (access === "active")
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="font-bold text-emerald-800">✓ Full access active</p>
        <p className="mt-2 text-sm leading-6 text-emerald-700">
          Your administrator has approved access. All premium questions are
          unlocked for your new sessions.
        </p>
      </div>
    );
  return (
    <div className="space-y-3">
      <textarea
        aria-label="Note for administrator"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note for the administrator"
        className={`${inputClass} w-full rounded-lg`}
      />
      <button
        disabled={busy}
        onClick={() => void request()}
        className={`${secondaryButton} w-full rounded-lg disabled:opacity-40`}
      >
        Request full access
      </button>
      {message && (
        <p role="status" className="text-sm text-violet-700">
          {message}
        </p>
      )}
      <Link
        href="/dashboard/access-requests"
        className="block text-center text-xs font-bold text-slate-500"
      >
        Track your requests
      </Link>
    </div>
  );
}
export function AccessRequestsPanel({ admin = false }: { admin?: boolean }) {
  const [dates] = useState(() => ({
    min: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    end: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  }));
  const [rows, setRows] = useState<RequestRow[]>([]),
    [message, setMessage] = useState(""),
    [filter, setFilter] = useState("ALL"),
    [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      setRows(
        await api<RequestRow[]>(
          admin ? "/access-requests" : "/access-requests/mine",
        ),
      );
    } catch (error) {
      setMessage(messageOf(error));
    }
  }, [admin]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function review(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(id);
    setMessage("");
    try {
      await api(`/access-requests/${id}/review`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await load();
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {["ALL", "PENDING", "APPROVED", "REJECTED", "EXPIRED", "REVOKED"].map(
          (status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`rounded-full px-4 py-2 text-xs font-bold ${filter === status ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
            >
              {status}
            </button>
          ),
        )}
      </div>
      {message && (
        <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm">
          {message}
        </p>
      )}
      {rows
        .filter((row) => filter === "ALL" || row.status === filter)
        .map((row) => (
          <article
            key={row._id}
            className="rounded-2xl border border-slate-200 bg-white p-6"
          >
            <div className="flex flex-wrap justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold">
                  {row.examId?.title || "Unavailable exam"}
                </h2>
                {admin && (
                  <p className="mt-1 text-sm text-slate-500">
                    {row.userId?.firstName} {row.userId?.lastName} ·{" "}
                    {row.userId?.email}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  Requested {new Date(row.createdAt).toLocaleDateString()}{" "}
                  {row.accessExpiresAt &&
                    `· Expires ${new Date(row.accessExpiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <span className="h-fit rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
                {row.status}
              </span>
            </div>
            {row.userMessage && (
              <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                {row.userMessage}
              </p>
            )}
            {row.adminNote && (
              <p className="mt-3 text-sm text-slate-600">
                Admin note: {row.adminNote}
              </p>
            )}
            {admin &&
              (row.status === "PENDING" || row.status === "APPROVED") && (
                <form
                  onSubmit={(e) => void review(e, row._id)}
                  className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <label className="grid gap-1 text-xs font-bold">
                    Decision
                    <select
                      name="status"
                      className={`${inputClass} rounded-lg`}
                    >
                      {row.status === "APPROVED" ? (
                        <option value="REVOKED">Revoke access</option>
                      ) : (
                        <>
                          <option value="APPROVED">Approve</option>
                          <option value="REJECTED">Reject</option>
                        </>
                      )}
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Access expiry
                    <input
                      name="accessExpiresAt"
                      type="date"
                      min={dates.min}
                      defaultValue={dates.end}
                      className={`${inputClass} rounded-lg`}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-bold">
                    Note
                    <input
                      name="adminNote"
                      className={`${inputClass} rounded-lg`}
                      placeholder="Optional"
                    />
                  </label>
                  <button
                    disabled={busy === row._id}
                    className={`${primaryButton} self-end rounded-lg disabled:opacity-40`}
                  >
                    Save decision
                  </button>
                </form>
              )}
            {!admin && row.status === "APPROVED" && row.examId && (
              <Link
                className="mt-5 inline-block font-bold text-violet-700"
                href={`/exams/${row.examId.slug}/start`}
              >
                Start practicing →
              </Link>
            )}
            {!admin &&
              ["EXPIRED", "REJECTED", "REVOKED"].includes(row.status) &&
              row.examId && (
                <Link
                  className="mt-5 inline-block font-bold text-violet-700"
                  href={`/exams/${row.examId.slug}`}
                >
                  Request access again →
                </Link>
              )}
          </article>
        ))}
      {!rows.length && (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          No access requests yet.
        </p>
      )}
    </div>
  );
}
