"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, messageOf } from "@/lib/api";
import { CategoryFields } from "./category-fields";
import { AdminHeading, inputClass, primaryButton, secondaryButton } from "./ui";

export function DragDropBankCreate() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG or WebP image up to 5 MB."); return; }
    setBusy(true); setError("");
    try { const body = new FormData(); body.set("file", file); const result = await api<{ url: string }>("/media/pbq", { method: "POST", body }); setImageUrl(result.url); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function create() {
    setBusy(true); setError("");
    try {
      const bank = await api<{ _id: string }>("/practice-items/drag-drop/admin/banks", { method: "POST", body: JSON.stringify({ title, category, subcategory, shortDescription, description, imageUrl }) });
      router.push(`/admin/drag-drop/${bank._id}`);
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <Link href="/admin/drag-drop" className="text-sm font-semibold text-slate-600">← All Drag and Drop banks</Link>
    <AdminHeading eyebrow="Question studio" title="Create a Drag and Drop bank" description="Start with the details, then build or import your questions." />
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-9">
      <label className="grid gap-2 text-sm font-bold">Bank title<input autoFocus value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder="e.g. CCNA Drag and Drop" className={`${inputClass} max-w-2xl rounded-lg font-normal`} /></label>
      <CategoryFields category={category} subcategory={subcategory} onChange={(parent, child) => { setCategory(parent); setSubcategory(child); }} />
      <div><p className="text-sm font-bold">Cover image</p><label className={`${secondaryButton} mt-3 inline-flex cursor-pointer rounded-lg`}>{busy ? "Uploading…" : imageUrl ? "Replace image" : "Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label><p className="mt-2 text-xs text-slate-500">JPG, PNG or WebP. Maximum 5 MB. Recommended ratio: 16:9.</p>{imageUrl && <Image unoptimized src={imageUrl} alt="Bank cover preview" width={400} height={225} className="mt-3 h-auto max-w-xs rounded-lg border object-cover" />}</div>
      <label className="grid gap-2 text-sm font-bold">Short description<textarea value={shortDescription} maxLength={500} onChange={event => setShortDescription(event.target.value)} rows={3} className={`${inputClass} rounded-lg font-normal`} /></label>
      <label className="grid gap-2 text-sm font-bold">Complete description<textarea value={description} maxLength={10000} onChange={event => setDescription(event.target.value)} rows={5} className={`${inputClass} rounded-lg font-normal`} /></label>
      <div className="flex justify-end"><button type="button" disabled={busy || !title.trim() || !category} onClick={() => void create()} className={`${primaryButton} rounded-lg disabled:opacity-40`}>Create bank and add questions</button></div>
    </section>
  </div>;
}
