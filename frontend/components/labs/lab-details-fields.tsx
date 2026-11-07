"use client";

import Image from "next/image";
import { CategoryFields } from "@/components/admin/category-fields";
import { field } from "./types";

export type LabDetailsValue = {
  title: string;
  category: string;
  subcategory?: string;
  imageUrl?: string;
  instructions: string;
  access: string;
  durationMinutes: number;
  examId?: string;
};

type ExamOption = { _id: string; title: string };

export function LabDetailsFields({ value, onChange, onUploadCover, uploading, busy, exams, allowUnassigned = false, disabled = false, titleHelp }: {
  value: LabDetailsValue;
  onChange: (changes: Partial<LabDetailsValue>) => void;
  onUploadCover: (file?: File) => void;
  uploading: boolean;
  busy: boolean;
  exams: ExamOption[];
  allowUnassigned?: boolean;
  disabled?: boolean;
  titleHelp?: string;
}) {
  const locked = busy || disabled;
  return <div className="space-y-6">
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="space-y-2 text-sm font-medium">Title<input className={field} value={value.title} maxLength={150} disabled={locked} onChange={event => onChange({ title: event.target.value })} />{titleHelp && <span className="block text-xs font-normal text-slate-500">{titleHelp}</span>}</label>
      <CategoryFields category={value.category} subcategory={value.subcategory || ""} disabled={locked} allowUnassigned={allowUnassigned} onChange={(category, subcategory) => onChange({ category, subcategory })} />
    </div>
    <div className="space-y-3"><p className="text-sm font-medium">Cover image</p>
      {value.imageUrl && <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><Image src={value.imageUrl} alt="Lab cover preview" fill unoptimized className="object-cover" /></div>}
      <div className="flex flex-wrap items-center gap-3"><label className={`cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 ${locked || uploading ? "pointer-events-none opacity-50" : ""}`}>{uploading ? "Uploading…" : value.imageUrl ? "Replace image" : "Upload image"}<input aria-label="Upload lab cover" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={locked || uploading} onChange={event => { onUploadCover(event.target.files?.[0]); event.target.value = ""; }} /></label>{value.imageUrl && <button type="button" className="px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={locked || uploading} onClick={() => onChange({ imageUrl: "" })}>Remove</button>}</div>
      <p className="text-xs text-slate-500">JPG, PNG or WebP. Maximum 5 MB. Recommended ratio: 16:9.</p>
    </div>
    <label className="block space-y-2 text-sm font-medium">Instructions<textarea className={`${field} min-h-40`} value={value.instructions} maxLength={20000} disabled={locked} onChange={event => onChange({ instructions: event.target.value })} /></label>
    <div className="grid gap-5 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium">Access<select className={field} value={value.access} disabled={locked} onChange={event => onChange({ access: event.target.value })}><option value="FREE">Free</option><option value="PREMIUM">Premium — administrator approval</option></select></label><label className="space-y-2 text-sm font-medium">Default duration (minutes)<input className={field} type="number" min={1} max={1440} value={value.durationMinutes} disabled={locked} onChange={event => onChange({ durationMinutes: Number(event.target.value) })} /></label></div>
    <label className="block space-y-2 text-sm font-medium">Linked exam<select className={field} value={value.examId || ""} disabled={locked} onChange={event => onChange({ examId: event.target.value })}><option value="">No linked exam</option>{exams.map(exam => <option key={exam._id} value={exam._id}>{exam.title}</option>)}</select><span className="block text-xs font-normal text-slate-500">Required for premium labs. Access approval and expiry are inherited from this exam.</span></label>
  </div>;
}

export function LabWorkflowTabs({ steps, active, onChange }: { steps: readonly string[]; active: string; onChange: (step: string) => void }) {
  return <nav className="flex overflow-x-auto border-b border-slate-200 px-4" aria-label="Lab editor">{steps.map(step => <button key={step} type="button" onClick={() => onChange(step)} className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-semibold ${active === step ? "border-slate-900" : "border-transparent text-slate-500"}`}>{step}</button>)}</nav>;
}
