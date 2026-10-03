"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Menu,
  X,
  Eye,
  LockKeyhole,
} from "lucide-react";
import { api, ApiError, messageOf } from "@/lib/api";
import { QuestionContent } from "./question-content";
import { RequestAccess } from "./access-requests";
import { DragDropQuestion, DragDropReview } from "./drag-drop-question";
import { ChoiceQuestion } from "@/components/choice-question";
import { ImagePbq, PbqReview } from "./image-pbq";
import type { PbqDefinition, PbqKey, PbqAnswer } from "@/lib/types";
import type { DropTarget, Placement } from "@/lib/types";
type Item = {
  type?: string;
  pbq?: PbqDefinition;
  dropTargets?: DropTarget[];
  _id: string;
  text: string;
  options: { id: string; text: string }[];
  displayOrder: number;
  topic: string;
  imageUrl?: string;
  navigatorNumber?: number;
};
type Answer = {
  pbqAnswers?: PbqAnswer[];
  placements?: Placement[];
  attemptQuestionId: string;
  selectedOptionIds: string[];
  markedForReview: boolean;
};
type Session = {
  _id: string;
  examTitle: string;
  mode: string;
  status: string;
  questionCount: number;
  expiresAt?: string;
  examId: string;
  examSlug?: string;
  lockedQuestions?: { number: number; topic: string }[];
};
type Progress = {
  id: string;
  order: number;
  answered: boolean;
  marked: boolean;
  number?: number;
  premium?: boolean;
  locked?: boolean;
};
type Payload = {
  attempt: Session;
  questions: Item[];
  answers: Answer[];
  progress: Progress[];
  serverNow: string;
};
export function ExamRunner({ id }: { id: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<Answer | null>(null);
  const [lockedNumber, setLockedNumber] = useState<number | null>(null);
  const [data, setData] = useState<Payload | null>(null),
    [current, setCurrent] = useState(1),
    [answers, setAnswers] = useState<Record<string, Answer>>({}),
    [message, setMessage] = useState(""),
    [saveStatus, setSaveStatus] = useState("All changes saved"),
    [saving, setSaving] = useState(false),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState(false),
    [reveal, setReveal] = useState<{
      correctOptionIds: string[];
      correctPlacements?: Placement[];
      pbqKey?: PbqKey[];
      explanation: string;
    } | null>(null),
    [remaining, setRemaining] = useState<number | null>(null),
    [filter, setFilter] = useState("ALL"),
    [navPage, setNavPage] = useState(1);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);
  const latestSave = useRef(0);
  const offset = useRef(0),
    finishing = useRef(false);
  const page = Math.ceil(current / 25);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<Payload>(
        `/attempts/${id}/questions?page=${page}`,
      );
      if (result.attempt.status !== "IN_PROGRESS") {
        router.replace(`/results/${id}`);
        return;
      }
      offset.current = new Date(result.serverNow).getTime() - Date.now();
      setData(result);
      setAnswers((old) => ({
        ...old,
        ...Object.fromEntries(
          result.answers.map((a) => [a.attemptQuestionId, a]),
        ),
      }));
      setMessage("");
    } catch (error) {
      setMessage(messageOf(error));
      if (error instanceof ApiError && error.status === 401)
        router.push("/login");
    } finally {
      setLoading(false);
    }
  }, [id, page, router]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    setSubmitting(true);
    setSaving(true);
    try {
      await saveChain.current;
      await api(`/attempts/${id}/submit`, { method: "POST" });
      router.replace(`/results/${id}`);
    } catch (error) {
      setMessage(messageOf(error));
      finishing.current = false;
      setSubmitting(false);
      setSaving(false);
    }
  }, [id, router]);
  useEffect(() => {
    if (!data?.attempt.expiresAt) return;
    const deadline = new Date(data.attempt.expiresAt).getTime();
    const tick = () => {
      const seconds = Math.max(
        0,
        Math.ceil((deadline - Date.now() - offset.current) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0) void finish();
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [data?.attempt.expiresAt, finish]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (!finishing.current && (saving || failed)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [saving, failed]);
  const question = data?.questions.find((q) => q.displayOrder === current);
  const answer = question ? answers[question._id] : undefined;
  async function save(next: Answer) {
    if (finishing.current) return;
    const sequence = ++latestSave.current;
    pendingSaves.current++;
    const prior = saveChain.current;
    let release!: () => void;
    saveChain.current = new Promise<void>(resolve => { release = resolve; });
    setSaving(true);
    setSaveStatus("Saving…");
    setAnswers((old) => ({ ...old, [next.attemptQuestionId]: next }));
    await prior;
    try {
      // Each update contains the entire answer. Skip queued intermediate keystrokes.
      if (sequence !== latestSave.current) return;
      await api(`/attempts/${id}/answers/${next.attemptQuestionId}`, {
        method: "PUT",
        body: JSON.stringify(next),
      });
      if (sequence === latestSave.current) { setFailed(null); setMessage(""); setSaveStatus("All changes saved"); }
      setData((old) =>
        old
          ? {
              ...old,
              progress: old.progress.map((p) =>
                p.id === next.attemptQuestionId
                  ? {
                      ...p,
                      answered: next.selectedOptionIds.length > 0 || Boolean(next.placements?.length) || Boolean(next.pbqAnswers?.some(a => a.values.some(v => v.trim()))),
                      marked: next.markedForReview,
                    }
                  : p,
              ),
            }
          : old,
      );
    } catch (error) {
      if (sequence === latestSave.current) { setFailed(next); setSaveStatus("Not saved — retry"); setMessage(messageOf(error)); }
      if (error instanceof ApiError && error.status === 409)
        window.location.replace(`/results/${id}`);
    } finally {
      pendingSaves.current--;
      if (!pendingSaves.current && !finishing.current) setSaving(false);
      release();
    }
  }
  function go(order: number) {
    if (saving || failed) return;
    setCurrent(order);
    setReveal(null);
    setOpen(false);
    if (filter === "ALL")
      setNavPage(
        Math.ceil(
          (data?.progress.find((p) => p.order === order)?.number || order) /
            100,
        ),
      );
  }
  async function explanation() {
    if (!question) return;
    try {
      setReveal(await api(`/attempts/${id}/explanation/${question._id}`));
    } catch (error) {
      setMessage(messageOf(error));
    }
  }
  const answered = data?.progress.filter((p) => p.answered).length || 0;
  const nav: Progress[] = [
    ...(data?.progress || []),
    ...(data?.attempt.lockedQuestions || []).map((q) => ({
      id: `locked-${q.number}`,
      order: 0,
      number: q.number,
      premium: true,
      locked: true,
      answered: false,
      marked: false,
    })),
  ]
    .sort((a, b) => (a.number || a.order) - (b.number || b.order))
    .filter(
      (p) =>
        filter === "ALL" ||
        (filter === "MARKED" && p.marked) ||
        (filter === "UNANSWERED" && !p.answered && !p.locked) ||
        (filter === "PREMIUM" && p.premium),
    );
  const blocked = saving || Boolean(failed);
  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <header className="sticky top-0 z-30 flex h-20 items-center gap-4 border-b border-slate-200 bg-white px-5 sm:px-8">
        <button
          aria-label="Question navigator"
          className="rounded-lg p-2 hover:bg-slate-100 lg:hidden"
          onClick={() => setOpen(!open)}
        >
          <Menu />
        </button>
        <Link
          href="/dashboard"
          onClick={(event) => {
            if (blocked) event.preventDefault();
          }}
          className="flex size-10 items-center justify-center rounded-lg bg-violet-700 text-xl font-black text-white"
        >
          C
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold sm:text-base">
            {data?.attempt.examTitle || "Your exam session"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {data?.attempt.mode === "TIMED"
              ? "Timed simulation"
              : "Practice & understand"}
          </p>
        </div>
        {data?.attempt.mode === "TIMED" ? (
          <div
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-lg font-bold ${remaining !== null && remaining < 300 ? "bg-rose-50 text-rose-700" : "bg-slate-100"}`}
          >
            <Clock3 size={18} />
            {remaining === null
              ? "…"
              : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`}
          </div>
        ) : (
          <span className="hidden rounded-full bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 sm:block">
            No time limit
          </span>
        )}
        <button
          disabled={blocked || !data}
          onClick={() => setConfirm(true)}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          Finish
        </button>
      </header>
      <div className="mx-auto grid max-w-[1500px] gap-6 p-4 sm:p-8 lg:grid-cols-[260px_1fr]">
        {open && (
          <button
            className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
            aria-label="Close navigator"
            onClick={() => setOpen(false)}
          />
        )}
        <aside
          className={`${open ? "fixed inset-y-0 left-0 z-50 block w-80 overflow-y-auto p-5" : "hidden"} rounded-2xl border border-slate-200 bg-white lg:sticky lg:top-28 lg:block lg:h-fit lg:p-5`}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Your progress</h2>
            <button
              className="lg:hidden"
              aria-label="Close navigator"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <p className="mt-3 text-3xl font-bold">
            {answered}
            <span className="text-base font-normal text-slate-400">
              {" "}
              / {data?.attempt.questionCount || 0}
            </span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-violet-600"
              style={{
                width: `${data ? (answered / data.attempt.questionCount) * 100 : 0}%`,
              }}
            />
          </div>
          <select
            aria-label="Filter questions"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setNavPage(1);
            }}
            className="mt-6 w-full rounded-lg border border-slate-200 p-2 text-xs"
          >
            <option value="ALL">All questions</option>
            <option value="UNANSWERED">Unanswered</option>
            <option value="MARKED">Marked for review</option>
            <option value="PREMIUM">Premium questions</option>
          </select>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {nav.slice((navPage - 1) * 100, navPage * 100).map((p) => (
              <button
                key={p.id}
                disabled={blocked}
                title={`Question ${p.number || p.order}${p.locked ? ", premium — request access" : p.premium ? ", premium unlocked" : ""}${p.marked ? ", marked" : ""}`}
                onClick={() =>
                  p.locked ? setLockedNumber(p.number || null) : go(p.order)
                }
                className={`relative flex aspect-square items-center justify-center gap-1 rounded-lg border text-xs font-bold disabled:opacity-40 ${p.premium ? "border-amber-400 bg-gradient-to-br from-amber-100 to-yellow-300 text-amber-950 shadow-sm hover:from-amber-200" : p.order === current ? "border-violet-600 bg-violet-600 text-white" : p.answered ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-500"} ${p.premium && p.order === current ? "ring-2 ring-violet-600 ring-offset-2" : ""}`}
              >
                {p.number || p.order}
                {p.locked && <LockKeyhole size={12} aria-label="Locked" />}
                {p.marked && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-400" />
                )}
              </button>
            ))}
          </div>
          {nav.length > 100 && (
            <div className="mt-3 flex justify-between text-xs">
              <button
                disabled={navPage === 1}
                onClick={() => setNavPage(navPage - 1)}
              >
                ← Back
              </button>
              <span>
                {navPage}/{Math.ceil(nav.length / 100)}
              </span>
              <button
                disabled={navPage * 100 >= nav.length}
                onClick={() => setNavPage(navPage + 1)}
              >
                More →
              </button>
            </div>
          )}
          <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <p>Green: answered</p>
            <p>Amber dot: marked for review</p>
            <p>Purple: current question</p>
            <p className="flex items-center gap-1 text-amber-800">
              <LockKeyhole size={12} /> Gold: premium · lock: approval required
            </p>
          </div>
          <Link
            href="/dashboard"
            onClick={(event) => {
              if (blocked) event.preventDefault();
            }}
            className="mt-6 block text-xs font-bold text-violet-700"
          >
            Save & return to dashboard
          </Link>
        </aside>
        <main className="min-w-0">
          {message && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
            >
              {message}
              {failed && (
                <button
                  disabled={saving}
                  onClick={() => failed && void save(failed)}
                  className="ml-3 font-bold underline"
                >
                  Retry saving
                </button>
              )}
              <button
                disabled={blocked}
                onClick={() => void load()}
                className="ml-3 font-bold underline"
              >
                Reload session
              </button>
            </div>
          )}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <p className="text-sm text-slate-500">
                Question{" "}
                <strong className="text-slate-900">
                  {question?.navigatorNumber || current}
                </strong>{" "}
                of{" "}
                {data
                  ? data.attempt.questionCount +
                    (data.attempt.lockedQuestions?.length || 0)
                  : "…"}
              </p>
              <button
                disabled={blocked || !question}
                onClick={() =>
                  question &&
                  void save({
                    attemptQuestionId: question._id,
                    selectedOptionIds: answer?.selectedOptionIds || [],
                    placements: answer?.placements || [],
                    pbqAnswers: answer?.pbqAnswers || [],
                    markedForReview: !answer?.markedForReview,
                  })
                }
                className={`flex items-center gap-2 text-xs font-bold disabled:opacity-40 ${answer?.markedForReview ? "text-amber-600" : "text-slate-500"}`}
              >
                <Bookmark
                  size={16}
                  fill={answer?.markedForReview ? "currentColor" : "none"}
                />
                Mark for review
              </button>
            </div>
            <div className="p-6 sm:p-10">
              {loading ? (
                <p className="py-20 text-center text-slate-500">
                  Loading questions…
                </p>
              ) : question ? (
                <>
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-violet-600">
                    {question.topic || "General"} · {question.type === "IMAGE_PBQ" ? "Performance-based question" : question.type === "DRAG_DROP" ? "Drag and drop" : question.type === "MULTIPLE_CHOICE" ? "Multiple answers" : "Single choice"}
                  </p>
                  <div className="text-xl font-medium leading-8 sm:text-2xl">
                    <QuestionContent text={question.text} />
                  </div>
                  {question.imageUrl && question.type !== "IMAGE_PBQ" && (
                    <Image
                      unoptimized
                      width={1000}
                      height={600}
                      className="my-5 max-h-80 max-w-full object-contain"
                      src={question.imageUrl}
                      alt="Question illustration"
                    />
                  )}
                  <div className="mt-8 space-y-3">
                    {question.type === "IMAGE_PBQ" ? <ImagePbq key={question._id} imageUrl={question.imageUrl || ""} definition={question.pbq || {alt: "", areas: []}} value={answer?.pbqAnswers || []} disabled={Boolean(failed) || submitting} onChange={pbqAnswers => void save({attemptQuestionId: question._id, selectedOptionIds: [], placements: [], pbqAnswers, markedForReview: answer?.markedForReview || false})}/> : question.type === "DRAG_DROP" ? <DragDropQuestion key={question._id} items={question.options} targets={question.dropTargets || []} value={answer?.placements || []} disabled={blocked} onChange={placements => void save({ attemptQuestionId: question._id, selectedOptionIds: [], placements, markedForReview: answer?.markedForReview || false })} /> : <ChoiceQuestion key={question._id} options={question.options} multiple={question.type === "MULTIPLE_CHOICE"} value={answer?.selectedOptionIds || []} disabled={Boolean(failed) || submitting} correctOptionIds={reveal?.correctOptionIds} onChange={selectedOptionIds => void save({ attemptQuestionId: question._id, selectedOptionIds, markedForReview: answer?.markedForReview || false })} />}
                  </div>
                  {data?.attempt.mode === "PRACTICE" && (
                    <button
                      disabled={blocked}
                      onClick={() => void explanation()}
                      className="mt-7 flex items-center gap-2 text-sm font-bold text-violet-700"
                    >
                      <Eye size={17} />
                      Show answer & explanation
                    </button>
                  )}
                  {reveal && (
                    <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                      <h3 className="mb-3 font-bold text-emerald-900">
                        {question.type === "IMAGE_PBQ" ? "Answer review" : question.type === "DRAG_DROP" ? "Correct placements" : `Correct ${question.type === "MULTIPLE_CHOICE" ? "answers" : "answer"}: ${reveal.correctOptionIds.join(", ")}`}
                      </h3>
                      {question.type === "DRAG_DROP" && <div className="my-4"><DragDropReview items={question.options} targets={question.dropTargets || []} placements={answer?.placements || []} expected={reveal.correctPlacements || []} /></div>}
                      {question.type === "IMAGE_PBQ" && <PbqReview definition={question.pbq || {alt: "", areas: []}} expected={reveal.pbqKey || []} answers={answer?.pbqAnswers || []}/>}
                      <QuestionContent text={reveal.explanation} />
                    </div>
                  )}
                </>
              ) : (
                <p className="py-20 text-center text-slate-500">
                  Your session could not be loaded.
                </p>
              )}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 px-6 py-5">
              <button
                disabled={current === 1 || blocked || loading}
                onClick={() => go(current - 1)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-bold disabled:opacity-30"
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span className="text-xs text-slate-400" role="status">
                {saveStatus}
              </span>
              {current === (data?.attempt.questionCount || 0) ? (
                <button
                  disabled={blocked}
                  onClick={() => setConfirm(true)}
                  className="rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  Review & submit
                </button>
              ) : (
                <button
                  disabled={blocked || loading || !data}
                  onClick={() => go(current + 1)}
                  className="flex items-center gap-1 rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              )}
            </footer>
          </section>
        </main>
      </div>
      {lockedNumber !== null && data && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-5">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="premium-title"
            className="w-full max-w-md rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-100 p-7 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <LockKeyhole className="text-amber-700" size={28} />
              <button
                onClick={() => setLockedNumber(null)}
                aria-label="Close premium request"
                className="rounded-lg p-2 text-amber-900 hover:bg-amber-200"
              >
                <X size={18} />
              </button>
            </div>
            <h2
              id="premium-title"
              className="mt-4 text-xl font-bold text-amber-950"
            >
              Question {lockedNumber} is premium
            </h2>
            <p className="my-4 text-sm leading-6 text-amber-900">
              Request full access from your administrator. These questions stay
              locked until your request is approved. Locked questions do not
              affect this session’s score.
            </p>
            <RequestAccess examId={data.attempt.examId} />
            <Link
              href={
                data.attempt.examSlug
                  ? `/exams/${data.attempt.examSlug}/start`
                  : "/exams"
              }
              className="mt-5 block text-center text-sm font-bold text-amber-950 underline"
            >
              Already approved? Start a full-access session
            </Link>
            <p className="mt-3 text-xs text-amber-800">
              Your current answers remain saved.{" "}
              {data.attempt.mode === "TIMED"
                ? "The timer continues while this dialog is open."
                : ""}
            </p>
          </section>
        </div>
      )}
      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-5">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-bold">Ready to submit?</h2>
            <p className="mt-4 leading-7 text-slate-500">
              You answered {answered} of {data?.attempt.questionCount}{" "}
              questions. {(data?.attempt.questionCount || 0) - answered} remain
              unanswered. You can review your explanations after submission.
            </p>
            <div className="mt-7 flex gap-3">
              <button
                onClick={() => setConfirm(false)}
                className="flex-1 rounded-lg border border-slate-300 py-3 text-sm font-bold"
              >
                Keep reviewing
              </button>
              <button
                disabled={saving}
                onClick={() => void finish()}
                className="flex-1 rounded-lg bg-violet-700 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                Submit exam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
