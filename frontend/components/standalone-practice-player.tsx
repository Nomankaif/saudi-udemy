"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { api, messageOf } from "@/lib/api";
import type { PbqAnswer, PbqKey, Placement } from "@/lib/types";
import type { PracticeKind, PublicPracticeItem } from "@/lib/standalone-practice";
import { DragDropQuestion, DragDropReview } from "./drag-drop-question";
import { ImagePbq, PbqReview } from "./image-pbq";
import { QuestionContent } from "./question-content";

type Result = { score: number; maximumScore: number; percentage: number; explanation: string; correctPlacements?: Placement[]; pbqKey?: PbqKey[]; pbqGrade?: { items: { areaId: string; fieldId?: string; earned: number; maximum: number }[] } };

export function StandalonePracticePlayer({ kind, id }: { kind: PracticeKind; id: string }) {
  const [item, setItem] = useState<PublicPracticeItem | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedPlacements, setSavedPlacements] = useState<Record<number, Placement[]>>({});
  const [savedResults, setSavedResults] = useState<Record<number, Result>>({});
  const [pbqAnswers, setPbqAnswers] = useState<PbqAnswer[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; api<PublicPracticeItem>(`/practice-items/${kind}/${id}`).then(data => { if (active) setItem(data); }).catch(cause => { if (active) setError(messageOf(cause)); }); return () => { active = false; }; }, [kind, id]);
  async function submit() {
    setBusy(true); setError("");
    try { const checked = await api<Result>(`/practice-items/${kind}/${id}/submit`, { method: "POST", body: JSON.stringify(kind === "drag-drop" ? { placements, questionIndex: currentIndex } : { pbqAnswers }) }); setResult(checked); if (kind === "drag-drop") setSavedResults(current => ({ ...current, [currentIndex]: checked })); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }
  const bankQuestions = kind === "drag-drop" ? item?.questions?.length ? item.questions : item ? [item.question] : [] : [];
  const q = kind === "drag-drop" ? bankQuestions[currentIndex] : item?.question;
  function goTo(index: number) {
    if (index < 0 || index >= bankQuestions.length) return;
    setSavedPlacements(current => ({ ...current, [currentIndex]: placements }));
    setPlacements(index === currentIndex ? placements : savedPlacements[index] || []);
    setResult(savedResults[index] || null);
    setCurrentIndex(index);
  }
  return <main className="min-h-[70vh] bg-slate-50 py-12"><div className="portal-container max-w-5xl"><Link href={kind === "drag-drop" ? "/exams" : `/${kind}`} className="text-sm font-semibold text-blue-700">← {kind === "drag-drop" ? "All exams" : "All questions"}</Link>
    {error && <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-white p-4 text-rose-700">{error}</p>}
    {!item && !error ? <p className="mt-8 text-slate-500">Loading question…</p> : item && q && <article className="mt-6 space-y-7 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-9"><div><p className="text-xs font-bold uppercase text-blue-700">{[item.category, item.subcategory].filter(Boolean).join(" / ")}</p><h1 className="mt-3 text-3xl font-bold text-slate-950">{item.title}</h1>{kind === "drag-drop" && <p className="mt-2 text-sm text-slate-500">Question {currentIndex + 1} of {bankQuestions.length}</p>}</div>{kind === "drag-drop" && bankQuestions.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Choose a question">{bankQuestions.map((_, index) => <button type="button" key={index} aria-label={`Question ${index + 1}`} aria-current={currentIndex === index ? "step" : undefined} className={`min-w-10 rounded-lg border px-3 py-2 text-sm font-bold ${currentIndex === index ? "border-blue-800 bg-blue-800 text-white" : savedResults[index] ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white"}`} onClick={() => goTo(index)}>{index + 1}</button>)}</div>}<QuestionContent text={q.text} />
      {kind === "drag-drop" ? <>{q.imageUrl && <Image unoptimized src={q.imageUrl} alt="Question diagram" width={1100} height={650} className="h-auto max-h-[600px] w-full object-contain" />}<DragDropQuestion items={q.options} targets={q.dropTargets || []} value={placements} onChange={setPlacements} disabled={Boolean(result)} /></> : <ImagePbq imageUrl={q.imageUrl} definition={q.pbq || { alt: "", areas: [] }} value={pbqAnswers} onChange={setPbqAnswers} disabled={Boolean(result)} />}
      {!result ? <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-blue-800 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "Checking…" : "Check answer"}</button> : <div className="space-y-5 rounded-lg border border-slate-200 bg-slate-50 p-5"><h2 className="text-xl font-bold">Result: {result.score} / {result.maximumScore} points</h2>{kind === "drag-drop" ? <DragDropReview items={q.options} targets={q.dropTargets || []} placements={placements} expected={result.correctPlacements || []} /> : <PbqReview definition={q.pbq || { alt: "", areas: [] }} expected={result.pbqKey || []} answers={pbqAnswers} grades={result.pbqGrade?.items} />}{result.explanation && <div><h3 className="font-bold">Explanation</h3><QuestionContent text={result.explanation} /></div>}<button type="button" onClick={() => { setResult(null); setPlacements([]); setPbqAnswers([]); setSavedPlacements(current => { const next = { ...current }; delete next[currentIndex]; return next; }); setSavedResults(current => { const next = { ...current }; delete next[currentIndex]; return next; }); }} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold">Try again</button></div>}
      {kind === "drag-drop" && bankQuestions.length > 1 && <div className="flex justify-between border-t border-slate-200 pt-5"><button type="button" disabled={currentIndex === 0} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-40" onClick={() => goTo(currentIndex - 1)}>← Previous</button><button type="button" disabled={currentIndex === bankQuestions.length - 1} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-40" onClick={() => goTo(currentIndex + 1)}>Next →</button></div>}
    </article>}
  </div></main>;
}
