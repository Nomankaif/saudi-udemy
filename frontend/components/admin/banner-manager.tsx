"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Eye, ImageIcon, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import type { Banner } from "@/lib/banners";
import { NotificationDialog } from "@/components/home-notifications";

type AdminBanner = Banner & { status: "DRAFT" | "PUBLISHED" | "INACTIVE" };
type Draft = Pick<Banner, "title" | "description" | "desktopImage" | "buttonText" | "buttonUrl" | "audience" | "displayOrder"> & { type: "HERO" | "IMAGE" };
const blank = (): Draft => ({ type: "HERO", title: "", description: "", desktopImage: "", buttonText: "", buttonUrl: "", audience: "EVERYONE", displayOrder: 0 });
const input = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-600";
const typeLabel = (banner: Banner) => banner.desktopImage ? "Image notification" : "Text notification";

export function BannerManager() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<AdminBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try { setBanners(await api<AdminBanner[]>("/banners")); }
    catch (error) { setMessage(messageOf(error)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    api<AdminBanner[]>("/banners").then(items => { if (active) setBanners(items); })
      .catch(error => { if (active) setMessage(messageOf(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function edit(banner?: AdminBanner) {
    setMessage("");
    setEditingId(banner?._id || null);
    setDraft(banner ? {
      type: banner.desktopImage ? "IMAGE" : "HERO", title: banner.title, description: banner.description || "", desktopImage: banner.desktopImage || "",
      buttonText: banner.buttonText || "", buttonUrl: banner.buttonUrl || "", audience: banner.audience, displayOrder: banner.displayOrder || 0,
    } : blank());
  }

  async function upload(file?: File) {
    if (!file || !draft) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage("Choose a JPG, PNG, or WebP image up to 5 MB."); return;
    }
    setUploading(true); setMessage("");
    try {
      const body = new FormData(); body.append("file", file);
      const result = await api<{ url: string }>("/banners/image", { method: "POST", body });
      setDraft(current => current ? { ...current, desktopImage: result.url } : current);
    } catch (error) { setMessage(messageOf(error)); }
    finally { setUploading(false); }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || saving || uploading) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    if (!draft.title.trim()) { setMessage("Enter a notification heading."); return; }
    if (status === "PUBLISHED" && draft.type === "IMAGE" && !draft.desktopImage) { setMessage("Upload an image before publishing."); return; }
    setSaving(true); setMessage("");
    try {
      await api(`/banners${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({ ...draft, dismissible: true, status }),
      });
      setDraft(null); setEditingId(null);
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setSaving(false); }
  }

  async function changeStatus(banner: AdminBanner, action: "PUBLISHED" | "INACTIVE" | "DELETE") {
    if (action === "DELETE" && !window.confirm(`Delete notification “${banner.title}” permanently? This cannot be undone.`)) return;
    setActingId(banner._id); setMessage("");
    try {
      await api(`/banners/${banner._id}`, action === "DELETE"
        ? { method: "DELETE" }
        : { method: "PATCH", body: JSON.stringify({ status: action }) });
      await refresh();
    } catch (error) { setMessage(messageOf(error)); }
    finally { setActingId(null); }
  }

  return <>
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[.2em] text-violet-600">Website content</p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-950">Landing page notifications</h1>
        <p className="mt-2 text-slate-600">Publish a text or image notification. Visitors see it in a modal shortly after arriving on the home page.</p>
      </div>
      <button type="button" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-700 px-5 py-3 font-bold text-white" onClick={() => edit()}><Plus size={18} />Create notification</button>
    </div>
    {message && <p role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{message}</p>}
    {loading ? <p className="text-sm text-slate-500">Loading notifications…</p> : banners.length ? <div className="space-y-4">{banners.map(banner => <article key={banner._id} className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[88px_1fr_auto] sm:items-center">
      <div className="relative flex size-20 items-center justify-center overflow-hidden rounded-md bg-violet-100 text-violet-700">{banner.desktopImage ? <Image src={banner.desktopImage} alt="" fill sizes="80px" unoptimized className="object-cover" /> : <ImageIcon />}</div>
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-violet-600">{typeLabel(banner)}</p><h2 className="mt-1 text-lg font-bold text-slate-950">{banner.title}</h2><p className="mt-1 text-sm text-slate-500">Audience: {banner.audience === "EVERYONE" ? "Everyone" : banner.audience === "GUESTS" ? "Guests" : "Members"} · Order {banner.displayOrder || 0}</p></div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`mr-2 rounded-full px-3 py-1 text-xs font-bold ${banner.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-800" : banner.status === "INACTIVE" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>{banner.status === "INACTIVE" ? "Retired" : banner.status === "PUBLISHED" ? "Published" : "Draft"}</span>
        <button type="button" aria-label={`Preview ${banner.title}`} className="rounded-lg border border-slate-300 p-2.5" onClick={() => setPreview(banner)}><Eye size={17} /></button>
        <button type="button" aria-label={`Edit ${banner.title}`} className="rounded-lg border border-slate-300 p-2.5" onClick={() => edit(banner)}><Pencil size={17} /></button>
        {banner.status === "PUBLISHED" ? <button type="button" disabled={actingId === banner._id} className="rounded-lg border border-amber-400 px-3 py-2 text-sm font-semibold text-amber-900 disabled:opacity-50" onClick={() => void changeStatus(banner, "INACTIVE")}>Retire</button> : <button type="button" disabled={actingId === banner._id} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void changeStatus(banner, "PUBLISHED")}>Publish</button>}
        <button type="button" aria-label={`Delete ${banner.title}`} disabled={actingId === banner._id} className="rounded-lg border border-rose-300 p-2.5 text-rose-700 disabled:opacity-50" onClick={() => void changeStatus(banner, "DELETE")}><Trash2 size={17} /></button>
      </div>
    </article>)}</div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center"><ImageIcon className="mx-auto text-slate-400" size={29} /><p className="mt-3 font-semibold">No notifications yet</p><p className="mt-1 text-sm text-slate-500">Create a notification and publish it to show it on the landing page.</p></div>}

    {draft && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4"><form onSubmit={event => void save(event)} role="dialog" aria-modal="true" aria-label={editingId ? "Edit notification" : "Create notification"} className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">Website content</p><h2 className="mt-1 text-2xl font-bold">{editingId ? "Edit notification" : "Create notification"}</h2></div><button type="button" aria-label="Close notification editor" onClick={() => { setDraft(null); setMessage(""); }} className="rounded-lg p-2 hover:bg-slate-100"><X size={20} /></button></div>
      <div className="mt-6 space-y-5">
        <label className="block text-sm font-semibold">Notification format<select className={input} value={draft.type} onChange={event => setDraft({ ...draft, type: event.target.value as Draft["type"], desktopImage: event.target.value === "IMAGE" ? draft.desktopImage : "" })}><option value="HERO">Text notification</option><option value="IMAGE">Image notification</option></select></label>
        <label className="block text-sm font-semibold">Heading<input className={input} value={draft.title} maxLength={160} required onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="block text-sm font-semibold">Description<textarea className={input} rows={3} maxLength={600} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        {draft.type === "IMAGE" && <div><p className="text-sm font-semibold">Notification image (required to publish)</p>{draft.desktopImage && <div className="relative mt-2 aspect-[2/1] max-w-sm overflow-hidden rounded-lg border border-slate-200"><Image src={draft.desktopImage} alt="Notification preview" fill sizes="400px" unoptimized className="object-cover" /></div>}
          <div className="mt-2 flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold"><Upload size={16} />{uploading ? "Uploading…" : draft.desktopImage ? "Replace image" : "Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading || saving} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>{draft.desktopImage && <button type="button" className="text-sm font-semibold text-rose-700" onClick={() => setDraft({ ...draft, desktopImage: "" })}>Remove image</button>}</div><p className="mt-2 text-xs text-slate-500">JPG, PNG, or WebP · up to 5 MB</p></div>}
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Button text<input className={input} maxLength={40} value={draft.buttonText} onChange={event => setDraft({ ...draft, buttonText: event.target.value })} placeholder="Explore exams" /></label><label className="block text-sm font-semibold">Button destination<input className={input} maxLength={500} value={draft.buttonUrl} onChange={event => setDraft({ ...draft, buttonUrl: event.target.value })} placeholder="/exams" /></label></div>
        <label className="block text-sm font-semibold">Display order<input type="number" min={0} max={9999} className={`${input} w-24`} value={draft.displayOrder} onChange={event => setDraft({ ...draft, displayOrder: Number(event.target.value) })} /></label>
      </div>
      {message && <p role="alert" className="mt-5 text-sm text-rose-700">{message}</p>}
      <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold" onClick={() => { setDraft(null); setMessage(""); }}>Cancel</button><button type="submit" value="DRAFT" disabled={saving || uploading} className="rounded-lg border border-violet-700 px-4 py-2.5 font-semibold text-violet-700 disabled:opacity-50">Save draft</button><button type="submit" value="PUBLISHED" disabled={saving || uploading} className="rounded-lg bg-violet-700 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Publish now"}</button></div>
    </form></div>}

    {preview && <div className="portal-theme"><NotificationDialog notification={preview} onClose={() => setPreview(null)} /></div>}
  </>;
}
