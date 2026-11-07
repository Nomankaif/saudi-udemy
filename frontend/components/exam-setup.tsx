"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Timer, ArrowRight, LockKeyhole } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import type { ExamSummary } from "@/lib/types";
import { RequestAccess } from "./access-requests";
type Availability = { premium: boolean; available: number; topics: string[] };
export function ExamSetup({ exam }: { exam: ExamSummary }) {
  const router = useRouter();
  const [access, setAccess] = useState<Availability | null>(null),
    [mode, setMode] = useState("PRACTICE"),
    [durationMinutes, setDurationMinutes] = useState(exam.durationMinutes || 60),
    [topic, setTopic] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Availability>(`/exams/${exam.id}/availability`)
      .then(setAccess)
      .catch((error) => setMessage(messageOf(error)));
  }, [exam.id]);
  async function start() {
    setBusy(true);
    try {
      const attempt = await api<{ _id: string }>("/attempts", {
        method: "POST",
        body: JSON.stringify({ examId: exam.id, mode, topic, durationMinutes }),
      });
      router.push(`/learn/${attempt._id}`);
    } catch (error) {
      setMessage(messageOf(error));
      setBusy(false);
    }
  }
  return (
    <div className="min-h-screen bg-slate-50 px-5 py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/exams/${exam.slug}`}
          className="text-sm font-bold text-slate-500"
        >
          ← Back to exam
        </Link>
        <p className="mt-10 text-xs font-bold uppercase tracking-[.2em] text-violet-600">
          Your next step
        </p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          Make this session yours.
        </h1>
        <p className="mt-3 text-slate-500">{exam.title}</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {[
            {
              id: "PRACTICE",
              title: "Practice & understand",
              description:
                "Learn at your pace. Reveal answers and any available explanations whenever you need them.",
              Icon: BookOpen,
            },
            {
              id: "TIMED",
              title: "Simulate the exam",
              description:
                "A focused timed session. Answer review unlocks after you submit.",
              Icon: Timer,
            },
          ].map(({ id, title, description, Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`rounded-2xl border-2 p-6 text-left transition ${mode === id ? "border-violet-600 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-300"}`}
            >
              <Icon className="mb-5 text-violet-600" />
              <h2 className="text-xl font-bold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                {description}
              </p>
              <span className="mt-5 block text-xs font-bold uppercase tracking-wider text-violet-600">
                {mode === id ? "Selected" : "Choose mode"}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="grid gap-5">
            {mode === "PRACTICE" ? (
              <>
                <label className="grid gap-2 text-sm font-bold">
                  Topic
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="rounded-lg border border-slate-300 px-4 py-3"
                  >
                    <option value="">All topics</option>
                    {access?.topics.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="grid gap-2 text-sm font-bold">
                  Time limit (minutes)
                  <input type="number" min={1} max={1440} step={1} value={durationMinutes || ""} onChange={event => setDurationMinutes(Number(event.target.value))} className="rounded-lg border border-slate-300 px-4 py-3" />
                  <span className="text-xs font-normal text-slate-500">Choose 1–1440 minutes. The exam submits automatically when time runs out.</span>
                </label>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">
                    All accessible questions included
                  </p>
                  <strong className="mt-1 block text-xl">
                    {access?.available || 0}
                  </strong>
                </div>
              </>
            )}
          </div>
          <p className="mt-5 text-sm text-slate-500">
            {access?.available ?? "…"} questions available ·{" "}
            {mode === "PRACTICE"
              ? "Untimed, progress saved"
              : "The timer keeps running if you close this page"}
          </p>
          <button
            disabled={busy || !access?.available || (mode === "TIMED" && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440))}
            onClick={() => void start()}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-5 py-4 font-bold text-white disabled:opacity-40"
          >
            {busy ? "Preparing your session…" : "Start session"}
            <ArrowRight size={18} />
          </button>
          {message && (
            <p role="status" className="mt-4 text-sm text-red-700">
              {message}
            </p>
          )}
        </div>
        {access &&
          !access.premium &&
          exam.questionCount > exam.freeQuestionCount && (
            <div className="mt-6 rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-100 p-6 text-amber-950">
              <h2 className="flex items-center gap-2 font-bold">
                <LockKeyhole size={18} />
                {exam.questionCount - exam.freeQuestionCount} more questions
                with full access
              </h2>
              <p className="my-3 text-sm text-slate-500">
                Your administrator can approve access to this exam.
              </p>
              <RequestAccess examId={exam.id} />
            </div>
          )}
      </div>
    </div>
  );
}
