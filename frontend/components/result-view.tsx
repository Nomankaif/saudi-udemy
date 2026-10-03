"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, messageOf } from "@/lib/api";
import { QuestionContent } from "./question-content";
import { DragDropReview } from "./drag-drop-question";
import { ImagePbq, PbqReview } from "./image-pbq";
import type { PbqDefinition, PbqAnswer, PbqKey, DropTarget, Placement } from "@/lib/types";
type ResultData = {
  result: {
    score: number;
    maximumScore: number;
    percentage: number;
    correctCount: number;
    incorrectCount: number;
    unansweredCount: number;
    passed: boolean;
    topicResults: { topic: string; total: number; correct: number }[];
  };
  attempt: { examTitle: string; mode: string; passingPercentage: number };
  total: number;
  questions: {
    type?: string;
    imageUrl?: string;
    pbq?: PbqDefinition;
    pbqKey?: PbqKey[];
    pbqGrade?: { passed: boolean; earned: number; maximum: number; items: { areaId: string; fieldId?: string; earned: number; maximum: number }[] };
    dropTargets?: DropTarget[];
    correctPlacements?: Placement[];
    _id: string;
    text: string;
    options: { id: string; text: string }[];
    correctOptionIds: string[];
    explanation: string;
    displayOrder: number;
  }[];
  answers: { attemptQuestionId: string; selectedOptionIds: string[]; placements?: Placement[]; pbqAnswers?: PbqAnswer[] }[];
};
export function ResultView({ id }: { id: string }) {
  const [data, setData] = useState<ResultData | null>(null),
    [page, setPage] = useState(1),
    [message, setMessage] = useState("");
  useEffect(() => {
    api<ResultData>(`/attempts/${id}/result?page=${page}&limit=10`)
      .then(setData)
      .catch((error) => setMessage(messageOf(error)));
  }, [id, page]);
  const total = data
    ? data.result.correctCount +
      data.result.incorrectCount +
      data.result.unansweredCount
    : 0;
  const correctPercent = total ? (data!.result.correctCount / total) * 100 : 0;
  const incorrectPercent = total
    ? (data!.result.incorrectCount / total) * 100
    : 0;
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-5 py-12">
      <Link href="/dashboard" className="text-sm font-bold text-slate-500">
        ← All attempts
      </Link>
      {message && (
        <p role="status" className="rounded-xl bg-amber-50 p-5">
          {message}
        </p>
      )}
      {data ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-6 sm:px-8">
              <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
                {data.attempt.mode === "PRACTICE"
                  ? "Practice complete"
                  : "Simulation complete"}
              </p>
              <h1 className="mt-3 text-2xl font-bold text-slate-950 sm:text-3xl">
                {data.attempt.examTitle}
              </h1>
              <p className="mt-3 text-sm text-slate-500">
                {data.result.passed
                  ? "Passing target reached"
                  : "Keep practicing — review your explanations below"}{" "}
                · Target {data.attempt.passingPercentage}%
              </p>
            </div>
            <div className="grid md:grid-cols-2">
              <figure className="flex flex-col items-center justify-center gap-6 border-b border-slate-100 bg-slate-50/60 px-6 py-9 md:border-b-0 md:border-r">
                <figcaption className="text-sm font-semibold text-slate-600">
                  Answer distribution
                </figcaption>
                <div
                  role="img"
                  aria-label={`Pie chart: ${data.result.correctCount} correct, ${data.result.incorrectCount} incorrect, ${data.result.unansweredCount} unanswered.`}
                  className="aspect-square w-full max-w-64 rounded-full border-4 border-white shadow-lg"
                  style={{
                    background: total
                      ? `conic-gradient(#10b981 0% ${correctPercent}%, #f43f5e ${correctPercent}% ${correctPercent + incorrectPercent}%, #cbd5e1 ${correctPercent + incorrectPercent}% 100%)`
                      : "#cbd5e1",
                  }}
                />
                <p className="text-sm text-slate-500">
                  <strong className="text-slate-900">{total}</strong> questions
                  in this attempt
                </p>
              </figure>
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                      Overall score
                    </p>
                    <strong className="block text-5xl font-bold tracking-tight text-slate-950">
                      {data.result.percentage}%
                    </strong>
                    <p className="text-sm text-slate-500">
                      {data.result.score} / {data.result.maximumScore} points
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${data.result.passed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                  >
                    {data.result.passed ? "Target reached" : "Keep practicing"}
                  </span>
                </div>
                <div className="mt-7 space-y-3">
                  {[
                    {
                      label: "Correct",
                      value: data.result.correctCount,
                      color: "bg-emerald-500",
                    },
                    {
                      label: "Incorrect",
                      value: data.result.incorrectCount,
                      color: "bg-rose-500",
                    },
                    {
                      label: "Unanswered",
                      value: data.result.unansweredCount,
                      color: "bg-slate-300",
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3"
                    >
                      <span
                        aria-hidden="true"
                        className={`size-3 shrink-0 rounded-full ${color}`}
                      />
                      <span className="flex-1 text-sm font-medium text-slate-600">
                        {label}
                      </span>
                      <strong className="text-xl text-slate-900">
                        {value}
                      </strong>
                      <span className="w-14 text-right text-xs text-slate-500">
                        {total ? ((value / total) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-bold">Performance by topic</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {data.result.topicResults?.map((topic) => (
                <div key={topic.topic} className="min-w-0">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{topic.topic}</span>
                    <span className="text-slate-500">
                      {topic.correct}/{topic.total}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-600"
                      style={{
                        width: `${(topic.correct / topic.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Answer review</h2>
            <p className="text-sm text-slate-500">
              Compare your choices with the correct answers and learn from each
              explanation. Partially correct PBQs earn points, but count as incorrect in the question totals.
            </p>
          </div>
          {data.questions.map((q) => {
            const drag = q.type === "DRAG_DROP";
            const pbq = q.type === "IMAGE_PBQ";
            const pbqAnswers = data.answers.find(a => a.attemptQuestionId === q._id)?.pbqAnswers || [];
            const placements = data.answers.find(a => a.attemptQuestionId === q._id)?.placements || [];
            const selected =
              data.answers.find((a) => a.attemptQuestionId === q._id)
                ?.selectedOptionIds || [];
            const answered = pbq ? pbqAnswers.some(a => a.values.some(Boolean)) : drag ? placements.length > 0 : selected.length > 0;
            const correct = pbq ? Boolean(q.pbqGrade?.passed) : drag ? placements.length === q.correctPlacements?.length && placements.every(p => q.correctPlacements?.some(c => c.itemId === p.itemId && c.targetId === p.targetId)) : selected.length === q.correctOptionIds.length && selected.every(id => q.correctOptionIds.includes(id));
            return (
              <article
                key={q._id}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <p className="mb-4 text-xs font-bold uppercase text-violet-600">
                  Question {q.displayOrder} ·{" "}
                  {answered
                    ? correct
                      ? "Correct"
                      : pbq && (q.pbqGrade?.earned || 0) > 0 ? "Partially correct" : "Incorrect"
                    : "Unanswered"}
                </p>
                <QuestionContent text={q.text} />
                {pbq && q.pbq ? <div className="my-5 space-y-5"><ImagePbq imageUrl={q.imageUrl || ""} definition={q.pbq} value={pbqAnswers} onChange={() => {}} disabled /><PbqReview definition={q.pbq} expected={q.pbqKey || []} answers={pbqAnswers} grades={q.pbqGrade?.items} /></div> : drag ? <div className="my-5"><DragDropReview items={q.options} targets={q.dropTargets || []} placements={placements} expected={q.correctPlacements || []} /></div> : <>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div
                    className={`rounded-xl border p-4 ${!selected.length ? "border-slate-200 bg-slate-50" : correct ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}
                  >
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {q.type === "MULTIPLE_CHOICE" ? "Your answers" : "Your answer"}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">
                      {selected.length
                        ? selected
                            .map((optionId) => {
                              const option = q.options.find(
                                (o) => o.id === optionId,
                              );
                              return `${optionId}. ${option?.text || ""}`;
                            })
                            .join(", ")
                        : "You did not answer this question"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-700">
                      {q.type === "MULTIPLE_CHOICE" ? "Correct answers" : "Correct answer"}
                    </p>
                    <p className="text-sm font-semibold text-emerald-950">
                      {q.correctOptionIds
                        .map((optionId) => {
                          const option = q.options.find(
                            (o) => o.id === optionId,
                          );
                          return `${optionId}. ${option?.text || ""}`;
                        })
                        .join(", ")}
                    </p>
                  </div>
                </div>
                <div className="my-5 space-y-2">
                  {q.options.map((o) => (
                    <div
                      key={o.id}
                      className={`rounded-lg border px-4 py-3 text-sm ${q.correctOptionIds.includes(o.id) ? "border-emerald-300 bg-emerald-50" : selected.includes(o.id) ? "border-rose-300 bg-rose-50" : "border-slate-100"}`}
                    >
                      <strong className="mr-3">{o.id}</strong>
                      {o.text}
                      {selected.includes(o.id) && (
                        <span className="ml-3 text-xs font-bold">
                          {q.type === "MULTIPLE_CHOICE" ? "Your answers" : "Your answer"}
                        </span>
                      )}
                      {q.correctOptionIds.includes(o.id) && (
                        <span className="ml-3 text-xs font-bold text-emerald-700">
                          {q.type === "MULTIPLE_CHOICE" ? "Correct answers" : "Correct answer"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                </>}
                <div className="rounded-xl bg-slate-50 p-4">
                  <h3 className="mb-2 text-sm font-bold">
                    {q.type === "MULTIPLE_CHOICE" ? "Why these answers are correct" : "Why this answer is correct"}
                  </h3>
                  <QuestionContent text={q.explanation} />
                </div>
              </article>
            );
          })}
          <div className="flex justify-between">
            <button
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold disabled:opacity-30"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span className="self-center text-sm text-slate-500">
              {page} / {Math.ceil(data.total / 10)}
            </span>
            <button
              className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold disabled:opacity-30"
              disabled={page * 10 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      ) : (
        !message && (
          <p className="p-10 text-center text-slate-500">
            Calculating your results…
          </p>
        )
      )}
    </div>
  );
}
