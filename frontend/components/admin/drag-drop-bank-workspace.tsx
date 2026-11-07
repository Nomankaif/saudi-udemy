"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import type { Question } from "@/lib/types";
import { CategoryFields } from "./category-fields";
import { DragDropImport } from "./drag-drop-import";
import { QuestionEditor, blankQuestion } from "./question-editor";
import { inputClass, primaryButton, secondaryButton } from "./ui";

type Bank = { _id: string; title: string; category: string; subcategory: string; status: "DRAFT" | "PUBLISHED" | "INACTIVE"; hasUnpublishedChanges: boolean; shortDescription: string; description: string; imageUrl: string };
type BankQuestions = { questions: Question[]; total: number };

export function DragDropBankWorkspace({ id, initialTab = "questions" }: { id: string; initialTab?: "questions" | "settings" }) {
  const router = useRouter();
  const [bank, setBank] = useState<Bank | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editing, setEditing] = useState<Question>(() => blankQuestion("DRAG_DROP"));
  const [editorKey, setEditorKey] = useState(0);
  const [tab, setTab] = useState<"questions" | "import" | "settings">(initialTab);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState({ title: "", category: "", subcategory: "", shortDescription: "", description: "", imageUrl: "" });

  const load = useCallback(async () => {
    try {
      const [details, items] = await Promise.all([
        api<Bank>(`/practice-items/drag-drop/admin/${id}`),
        api<BankQuestions>(`/practice-items/drag-drop/admin/${id}/questions`),
      ]);
      setBank(details); setQuestions(items.questions);
      setSettings({ title: details.title, category: details.category, subcategory: details.subcategory, shortDescription: details.shortDescription || "", description: details.description || "", imageUrl: details.imageUrl || "" });
      return items.questions;
    } catch (cause) { setError(messageOf(cause)); return []; }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  function edit(question: Question) { setEditing(question); setEditorKey(value => value + 1); }

  async function save(question: Question, next: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const saved = await api<Question>(`/practice-items/drag-drop/admin/${id}/questions${question._id ? `/${question._id}` : ""}`, { method: question._id ? "PATCH" : "POST", body: JSON.stringify(question) });
      await load(); edit(next ? blankQuestion("DRAG_DROP") : saved);
      setMessage("Question saved to the draft bank.");
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function remove(question: Question) {
    if (!window.confirm("Remove this question from the draft bank?")) return;
    setBusy(true); setError("");
    try { await api(`/practice-items/drag-drop/admin/${id}/questions/${question._id}`, { method: "DELETE" }); await load(); if (editing._id === question._id) edit(blankQuestion("DRAG_DROP")); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setError(""); setMessage("");
    try { await api(`/practice-items/drag-drop/admin/${id}/publish-bank`, { method: "POST" }); router.push("/admin/drag-drop"); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function uploadCover(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG or WebP image up to 5 MB."); return; }
    setBusy(true); setError("");
    try { const body = new FormData(); body.set("file", file); const result = await api<{ url: string }>("/media/pbq", { method: "POST", body }); setSettings(current => ({ ...current, imageUrl: result.url })); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function saveSettings() {
    setBusy(true); setError("");
    try { await api(`/practice-items/drag-drop/admin/${id}/settings`, { method: "PATCH", body: JSON.stringify(settings) }); await load(); setMessage("Bank settings saved."); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  const visible = questions.filter(question => question.text.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="space-y-6">
    <Link href="/admin/drag-drop" className="text-sm font-semibold text-slate-600">← All Drag and Drop banks</Link>
    {!bank && error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {loading ? <p className="text-sm text-slate-500">Loading bank…</p> : bank && <>
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-violet-700">Drag and Drop studio</p><h1 className="mt-2 text-3xl font-bold text-slate-950">{bank.title}</h1><p className="mt-2 text-sm text-slate-600">{questions.length} draft questions · {bank.status === "PUBLISHED" ? "Published" : "Draft"}{bank.hasUnpublishedChanges && bank.status === "PUBLISHED" ? " · Unpublished changes" : ""}</p></div><button type="button" disabled={busy} className={`${primaryButton} rounded-lg disabled:opacity-40`} onClick={() => void publish()}>Publish bank</button></div>
      <div role="tablist" aria-label="Drag and Drop bank workspace" className="flex gap-3 border-b border-slate-300">{(["questions", "import", "settings"] as const).map(value => <button type="button" key={value} role="tab" aria-selected={tab === value} className={`min-w-28 border-b-2 px-4 py-3 text-sm font-bold capitalize ${tab === value ? "border-violet-700 text-slate-950" : "border-transparent text-slate-500"}`} onClick={() => setTab(value)}>{value}</button>)}</div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p>}
      {tab === "questions" && <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]"><aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex justify-between"><h2 className="text-sm font-bold">Question bank</h2><span className="text-xs text-slate-500">{questions.length} total</span></div><button type="button" className={`${primaryButton} mt-4 w-full rounded-lg`} onClick={() => edit(blankQuestion("DRAG_DROP"))}><Plus size={17} />New question</button>{questions.length > 0 && <label className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 px-3"><Search size={16} className="text-slate-400" /><input aria-label="Search question bank" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search questions" className="min-w-0 flex-1 py-3 text-sm outline-none" /></label>}<div className="mt-4 max-h-[640px] space-y-1 overflow-y-auto">{visible.map((question, index) => <div key={question._id || index} className={`rounded-lg border p-3 ${editing._id === question._id ? "border-violet-300 bg-violet-50" : "border-transparent hover:bg-slate-50"}`}><button type="button" className="w-full text-left text-sm font-semibold" onClick={() => edit(question)}>Question {question.displayOrder || index + 1}<span className="mt-1 block line-clamp-2 text-xs font-normal text-slate-500">{question.text}</span></button><button type="button" aria-label={`Remove question ${index + 1}`} disabled={busy} className="mt-2 text-rose-600" onClick={() => void remove(question)}><Trash2 size={15} /></button></div>)}{!questions.length && <div className="rounded-lg bg-slate-50 p-5 text-center text-sm text-slate-600">No questions in this bank yet.<button type="button" className="mt-2 block w-full font-semibold text-violet-700" onClick={() => setTab("import")}>Import questions</button></div>}</div></aside><QuestionEditor key={editorKey} initial={editing} fixedType="DRAG_DROP" busy={busy} onSave={save} /></div>}
      {tab === "import" && <DragDropImport bankId={id} initialCategory={bank.category} initialSubcategory={bank.subcategory} onImported={count => { void load(); setMessage(`${count} questions added to this bank as drafts.`); setTab("questions"); }} />}
      {tab === "settings" && <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Bank settings</h2><label className="grid gap-2 text-sm font-bold">Title<input value={settings.title} maxLength={160} onChange={event => setSettings({ ...settings, title: event.target.value })} className={`${inputClass} rounded-lg font-normal`} /></label><CategoryFields category={settings.category} subcategory={settings.subcategory} onChange={(category, subcategory) => setSettings({ ...settings, category, subcategory })} /><div><p className="text-sm font-bold">Cover image</p><label className={`${secondaryButton} mt-2 inline-flex cursor-pointer rounded-lg`}>Upload image<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => { void uploadCover(event.target.files?.[0]); event.target.value = ""; }} /></label>{settings.imageUrl && <Image unoptimized src={settings.imageUrl} alt="Bank cover" width={400} height={225} className="mt-3 h-auto max-w-xs rounded-lg" />}</div><label className="grid gap-2 text-sm font-bold">Short description<textarea value={settings.shortDescription} maxLength={500} rows={3} onChange={event => setSettings({ ...settings, shortDescription: event.target.value })} className={`${inputClass} rounded-lg font-normal`} /></label><label className="grid gap-2 text-sm font-bold">Complete description<textarea value={settings.description} maxLength={10000} rows={5} onChange={event => setSettings({ ...settings, description: event.target.value })} className={`${inputClass} rounded-lg font-normal`} /></label><button type="button" disabled={busy} className={`${primaryButton} rounded-lg disabled:opacity-40`} onClick={() => void saveSettings()}>Save settings</button></section>}
    </>}
  </div>;
}
