"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import {
  Bold,
  Italic,
  List,
  Eye,
  Pencil,
  Check,
  ImagePlus,
  Save,
} from "lucide-react";
import { ImagePbq, PbqReview } from "@/components/image-pbq";
import { PbqEditor, pbqIssues } from "./pbq-editor";
import type { PbqAnswer } from "@/lib/types";
import type { Question, Placement } from "@/lib/types";
import { DragDropQuestion, DragDropReview } from "@/components/drag-drop-question";
import { DragDropEditor, dragDropIssues } from "./drag-drop-editor";
import { QuestionContent } from "@/components/question-content";
import { ChoiceQuestion } from "@/components/choice-question";
import { inputClass, primaryButton, secondaryButton } from "./ui";
export const blankQuestion = (): Question => ({
  type: "SINGLE_CHOICE",
  text: "",
  options: ["A", "B", "C", "D"].map((id) => ({ id, text: "" })),
  correctOptionIds: [],
  explanation: "",
  accessLevel: "PREMIUM",
  topic: "General",
  difficulty: "MEDIUM",
  imageUrl: "",
  displayOrder: 0,
});
export function questionIssues(q: Question) {
  return [
    !q.text.trim() && "Enter a question",
    ...(q.type === "IMAGE_PBQ" ? pbqIssues(q) : q.type === "DRAG_DROP" ? dragDropIssues(q) : [(q.options.length !== 4 || q.options.some((o) => !o.text.trim())) && "Complete all four options",
      (q.type === "MULTIPLE_CHOICE" ? q.correctOptionIds.length < 2 || q.correctOptionIds.length > 4 : q.correctOptionIds.length !== 1) && (q.type === "MULTIPLE_CHOICE" ? "Select two to four correct answers" : "Select exactly one correct answer"),
      (new Set(q.correctOptionIds).size !== q.correctOptionIds.length || q.correctOptionIds.some(id => !["A", "B", "C", "D"].includes(id))) && "Select different valid answers (A–D)"]),
    !q.explanation.trim() && "Add an explanation",
  ].filter(Boolean) as string[];
}
export function QuestionEditor({
  initial,
  onSave,
  busy = false,
  importMode = false,
  message,
}: {
  initial: Question;
  onSave: (q: Question, next: boolean) => Promise<void>;
  busy?: boolean;
  importMode?: boolean;
  message?: string;
}) {
  const [q, setQ] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<PbqAnswer[]>([]);
  const [preview, setPreview] = useState(false);
  const [previewSelection, setPreviewSelection] = useState<string[]>([]);
  const [previewPlacements, setPreviewPlacements] = useState<Placement[]>([]);
  const textarea = useRef<HTMLTextAreaElement>(null);
  function format(before: string, after = "") {
    const el = textarea.current;
    if (!el) return;
    const start = el.selectionStart,
      end = el.selectionEnd;
    const selected = q.text.slice(start, end) || "text";
    setQ({
      ...q,
      text:
        q.text.slice(0, start) + before + selected + after + q.text.slice(end),
    });
    el.focus();
  }
  const issues = questionIssues(q);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-600">
            Question workspace
          </p>
          <h2 className="mt-1 text-xl font-bold">
            {q._id ? "Edit question" : "Create a question"}
          </h2>
        </div>
        <button
          className={secondaryButton}
          disabled={uploading || busy}
          onClick={() => setPreview(!preview)}
        >
          {preview ? <Pencil size={16} /> : <Eye size={16} />}
          {preview ? "Editor" : "Student preview"}
        </button>
      </div>
      <fieldset disabled={busy || uploading} className="min-w-0 space-y-6 p-6 sm:p-8">
        {preview ? (
          <div className="space-y-5">
            <p className="text-xs font-bold uppercase text-violet-600">
              {q.topic} · {q.accessLevel}
            </p>
            <QuestionContent text={q.text || "Your question appears here."} />
            {q.imageUrl && q.type !== "IMAGE_PBQ" && (
              <Image unoptimized width={1000} height={600}
                src={q.imageUrl}
                alt="Question illustration"
                className="max-h-64 max-w-full object-contain"
              />
            )}
            {q.type === "IMAGE_PBQ" ? <><ImagePbq imageUrl={q.imageUrl} definition={q.pbq || {alt: "", areas: []}} value={previewAnswers} onChange={setPreviewAnswers}/><details className="rounded border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">View answer key</summary><div className="mt-4"><PbqReview definition={q.pbq || {alt: "", areas: []}} expected={q.pbqKey || []} answers={previewAnswers}/></div></details></> : q.type === "DRAG_DROP" ? <><DragDropQuestion items={q.options} targets={q.dropTargets || []} value={previewPlacements} onChange={setPreviewPlacements} /><details className="rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">View answer key</summary><div className="mt-4"><DragDropReview items={q.options} targets={q.dropTargets || []} expected={q.correctPlacements || []} /></div></details></> : <><ChoiceQuestion options={q.options} multiple={q.type === "MULTIPLE_CHOICE"} value={previewSelection} onChange={setPreviewSelection} /><details className="rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">View answer key</summary><p className="mt-3 text-sm">Correct {q.type === "MULTIPLE_CHOICE" ? "answers" : "answer"}: {q.correctOptionIds.join(", ") || "Not configured"}</p></details></>}
            <div className="rounded-xl bg-violet-50 p-5">
              <h3 className="mb-2 font-bold">Answer explanation</h3>
              <QuestionContent text={q.explanation} />
            </div>
          </div>
        ) : (
          <>
            <label className="grid gap-2 text-sm font-semibold">Question type<select value={q.type || "SINGLE_CHOICE"} className={`${inputClass} rounded-lg`} onChange={e => {
              const type = e.target.value as Question["type"];
              const isChoice = (value: Question["type"]) => !value || value === "SINGLE_CHOICE" || value === "MULTIPLE_CHOICE";
              if (isChoice(q.type) && isChoice(type)) {
                setQ({ ...q, type });
                setPreviewSelection([]);
                return;
              }
              if (!window.confirm("Changing the question type clears its answer options and answer key. Continue?")) return;
              setPreviewPlacements([]);
              setPreviewAnswers([]);
              setPreviewSelection([]);
              setQ({ ...q, type, pbq: type === "IMAGE_PBQ" ? {alt: "", areas: []} : undefined, pbqKey: [], correctOptionIds: [], correctPlacements: [], options: ["A", "B", "C", "D"].map(id => ({ id, text: "" })), dropTargets: type === "DRAG_DROP" ? [{ id: "group1", label: "", capacity: 1 }, { id: "group2", label: "", capacity: 1 }] : [] });
            }}><option value="SINGLE_CHOICE">Single choice</option><option value="MULTIPLE_CHOICE">Multiple answers</option>{!importMode && <><option value="DRAG_DROP">Drag and drop</option><option value="IMAGE_PBQ">Image-based PBQ</option></>}</select></label>
            <div className="min-w-0">
              <label htmlFor="question-text" className="text-sm font-bold">
                Question
              </label>
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-300">
                <div className="flex gap-1 border-b border-slate-200 bg-slate-50 p-2">
                  {[
                    [Bold, "Bold", "**", "**"],
                    [Italic, "Italic", "*", "*"],
                    [List, "List", "\n- ", ""],
                  ].map(([Icon, label, before, after]) => {
                    const ToolIcon = Icon as typeof Bold;
                    return (
                      <button
                        key={String(label)}
                        title={String(label)}
                        aria-label={String(label)}
                        className="rounded p-2 hover:bg-white"
                        onClick={() => format(String(before), String(after))}
                      >
                        <ToolIcon size={16} />
                      </button>
                    );
                  })}
                  <span className="ml-auto self-center px-2 text-xs text-slate-500">
                    Markdown formatting
                  </span>
                </div>
                <textarea
                  ref={textarea}
                  id="question-text"
                  value={q.text}
                  onChange={(e) => setQ({ ...q, text: e.target.value })}
                  rows={6}
                  placeholder="Write a clear question or scenario…"
                  className="w-full resize-y p-4 leading-7 outline-none"
                />
              </div>
            </div>
            {q.type !== "IMAGE_PBQ" && <label className="block text-sm font-bold">
              <span className="flex items-center gap-2">
                <ImagePlus size={16} />
                Optional image URL
              </span>
              <input
                className={`${inputClass} mt-2 w-full rounded-lg`}
                value={q.imageUrl}
                placeholder="https://…"
                onChange={(e) => setQ({ ...q, imageUrl: e.target.value })}
              />
            </label>}
            {q.type === "IMAGE_PBQ" ? <PbqEditor question={q} onChange={setQ} onUploading={setUploading}/> : q.type === "DRAG_DROP" ? <DragDropEditor question={q} onChange={setQ} /> : <div className="min-w-0">
              <h3 className="font-bold">Answer options</h3>
              <p className="mt-1 text-sm text-slate-500">
                {q.type === "MULTIPLE_CHOICE" ? "Check every correct answer (two to four). Students must select all correct options and no incorrect ones." : "Select the circle beside the correct answer."}
              </p>
              <div className="mt-4 space-y-3">
                {q.options.map((option, index) => (
                  <label
                    key={option.id}
                    className={`flex items-start gap-3 rounded-xl border p-4 ${q.correctOptionIds.includes(option.id) ? "border-emerald-400 bg-emerald-50" : "border-slate-200"}`}
                  >
                    <input
                      aria-label={`Option ${option.id} is correct`}
                      type={q.type === "MULTIPLE_CHOICE" ? "checkbox" : "radio"}
                      name="correct-option"
                      className="mt-3 size-4 accent-emerald-600"
                      checked={q.correctOptionIds.includes(option.id)}
                      onChange={() =>
                        setQ({ ...q, correctOptionIds: q.type === "MULTIPLE_CHOICE" ? q.correctOptionIds.includes(option.id) ? q.correctOptionIds.filter(id => id !== option.id) : [...q.correctOptionIds, option.id] : [option.id] })
                      }
                    />
                    <span className="mt-2 text-sm font-bold text-slate-500">
                      {option.id}
                    </span>
                    <input
                      aria-label={`Option ${option.id}`}
                      className="min-w-0 flex-1 bg-transparent px-2 py-2 outline-none"
                      placeholder={`Write option ${option.id}`}
                      value={option.text}
                      onChange={(e) =>
                        setQ({
                          ...q,
                          options: q.options.map((o, i) =>
                            i === index ? { ...o, text: e.target.value } : o,
                          ),
                        })
                      }
                    />
                    {q.correctOptionIds.includes(option.id) && (
                      <Check className="mt-2 text-emerald-600" size={18} />
                    )}
                  </label>
                ))}
              </div>
            </div>}
            <label className="block text-sm font-bold">
              {q.type === "MULTIPLE_CHOICE" ? "Why are these answers correct?" : "Why is this answer correct?"}
              <textarea
                className={`${inputClass} mt-2 w-full rounded-xl leading-7`}
                rows={4}
                value={q.explanation}
                onChange={(e) => setQ({ ...q, explanation: e.target.value })}
                placeholder="Explain the reasoning. Markdown is supported."
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">
                Access
                <select
                  className={`${inputClass} rounded-lg`}
                  value={q.accessLevel}
                  onChange={(e) =>
                    setQ({
                      ...q,
                      accessLevel: e.target.value as Question["accessLevel"],
                    })
                  }
                >
                  <option value="FREE">Free question</option>
                  <option value="PREMIUM">Premium question</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold">
                Topic
                <input
                  className={`${inputClass} rounded-lg`}
                  value={q.topic}
                  onChange={(e) => setQ({ ...q, topic: e.target.value })}
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                Difficulty
                <select
                  className={`${inputClass} rounded-lg`}
                  value={q.difficulty}
                  onChange={(e) => setQ({ ...q, difficulty: e.target.value })}
                >
                  {["EASY", "MEDIUM", "HARD"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold">
                Display order
                <input
                  type="number"
                  min={0}
                  className={`${inputClass} rounded-lg`}
                  value={q.displayOrder}
                  onChange={(e) =>
                    setQ({ ...q, displayOrder: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          </>
        )}
        {issues.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Before publishing this question</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
            <p className="mt-3 text-xs">You can save an unfinished draft. Resolve these issues before publishing.</p>
          </div>
        )}
        {message && <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white py-4">
          <button
            disabled={busy || !q.text.trim()}
            className={`${secondaryButton} disabled:opacity-40`}
            onClick={() => void onSave(q, false)}
          >
            <Save size={16} />
            {importMode ? "Apply corrections" : "Save draft"}
          </button>
          {!importMode && (
            <button
              disabled={busy || !q.text.trim()}
              className={`${primaryButton} disabled:opacity-40`}
              onClick={() => void onSave(q, true)}
            >
              Save & add next
            </button>
          )}
        </div>
      </fieldset>
    </section>
  );
}
