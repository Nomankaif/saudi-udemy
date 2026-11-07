"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, messageOf } from "@/lib/api";
import type { Question } from "@/lib/types";
import type { PracticeItem, PracticeKind } from "@/lib/standalone-practice";
import { practiceLabel } from "@/lib/standalone-practice";
import { CategoryFields } from "./category-fields";
import { QuestionEditor, blankQuestion } from "./question-editor";
import { AdminHeading, inputClass } from "./ui";

export function StandalonePracticeEditor({ kind, id }: { kind: PracticeKind; id: string }) {
  const router = useRouter();
  const fixedType = kind === "drag-drop" ? "DRAG_DROP" : "IMAGE_PBQ";
  const [item, setItem] = useState<PracticeItem | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [question, setQuestion] = useState<Question>(() => blankQuestion(fixedType));
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(id !== "new");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (id === "new") return;
    let active = true;
    api<PracticeItem>(`/practice-items/${kind}/admin/${id}`).then(data => {
      if (!active) return;
      setItem(data); setTitle(data.title); setCategory(data.category); setSubcategory(data.subcategory);
      setQuestion(data.draftQuestion); setEditorKey(key => key + 1);
    }).catch(cause => { if (active) setError(messageOf(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, kind]);
  async function save(draft: Question, navigate = true): Promise<PracticeItem | null> {
    if (!title.trim()) { setError("Enter a title above the question."); return null; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<PracticeItem>(`/practice-items/${kind}/admin${item ? `/${item._id}` : ""}`, { method: item ? "PATCH" : "POST", body: JSON.stringify({ title, category, subcategory, question: draft }) });
      setItem(result); setQuestion(result.draftQuestion); setEditorKey(key => key + 1);
      setMessage("Draft saved. Publish when the question and answer are ready.");
      if (!item && navigate) router.replace(`/admin/${kind}/${result._id}`);
      return result;
    } catch (cause) { setError(messageOf(cause)); return null; }
    finally { setBusy(false); }
  }
  async function publish(draft: Question) {
    const saved = await save(draft, false);
    if (!saved) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<PracticeItem>(`/practice-items/${kind}/admin/${saved._id}/publish`, { method: "POST" });
      setItem(result); setMessage("Published. Students can now open this question from its practice page.");
      if (!item) router.replace(`/admin/${kind}/${result._id}`);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-5xl space-y-6">
    <Link href={`/admin/${kind}`} className="text-sm font-semibold text-slate-600 hover:text-slate-950">← All {practiceLabel(kind).toLowerCase()} questions</Link>
    <AdminHeading eyebrow="Question studio" title={item ? `Edit ${practiceLabel(kind).toLowerCase()} question` : `Create ${practiceLabel(kind).toLowerCase()} question`} description="Build this question independently. Save a draft, then publish it for students." />
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
    {item && <p className="text-sm text-slate-500">Status: {item.status === "INACTIVE" ? "Retired" : item.status.toLowerCase()}{item.hasUnpublishedChanges && item.status === "PUBLISHED" ? " · Unpublished changes" : ""}{item.status === "PUBLISHED" && <Link href={`/${kind}/${item._id}`} className="ml-3 font-semibold text-violet-700 underline">View live question</Link>}</p>}
    {loading ? <p className="text-sm text-slate-500">Loading question…</p> : <>
      <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Question details</h2><label className="grid gap-2 text-sm font-medium">Title<input value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="e.g. Configure the firewall policy" className={`${inputClass} rounded-lg`} /></label><CategoryFields category={category} subcategory={subcategory} onChange={(nextCategory, nextSubcategory) => { setCategory(nextCategory); setSubcategory(nextSubcategory); }} allowUnassigned /></section>
      <QuestionEditor key={editorKey} initial={question} fixedType={fixedType} singleItem busy={busy} onSave={async draft => { await save(draft); }} onPublish={publish} />
    </>}
  </div>;
}
