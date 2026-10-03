"use client";
import { useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import { AdminHeading, inputClass, primaryButton } from "./ui";
import { useCategories } from "./category-fields";

export function AdminCategories() {
  const { categories, loading, error, refresh } = useCategories();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [childName, setChildName] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<{ mode: "edit" | "delete"; category: string; subcategory?: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [actionError, setActionError] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const actionButton = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-40";
  function begin(mode: "edit" | "delete", category: string, subcategory?: string) {
    setAction({ mode, category, subcategory });
    setEditName(subcategory || category); setActionError(""); setMessage("");
  }
  async function applyAction(event: React.FormEvent) {
    event.preventDefault();
    if (!action || busy) return;
    setBusy(true); setActionError(""); setMessage("");
    try {
      const result = await api<{ name: string }>(action.subcategory ? "/categories/subcategories" : "/categories", {
        method: action.mode === "edit" ? "PATCH" : "DELETE",
        body: JSON.stringify({ category: action.category, subcategory: action.subcategory, ...(action.mode === "edit" ? { name: editName } : {}) }),
      });
      if (!action.subcategory && parent === action.category) setParent(action.mode === "edit" ? result.name : "");
      if (!action.subcategory && expandedCategory === action.category) setExpandedCategory(action.mode === "edit" ? result.name : null);
      setFailed(false);
      setMessage(`${action.subcategory ? "Subcategory" : "Category"} “${result.name}” ${action.mode === "edit" ? "updated" : "deleted"}.`);
      setAction(null);
      await refresh();
    } catch (error) { setActionError(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function add(event: React.FormEvent, child = false) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await api<{ name: string }>(child ? "/categories/subcategories" : "/categories", {
        method: "POST", body: JSON.stringify(child ? { category: parent, name: childName } : { name }),
      });
      if (child) { setChildName(""); setExpandedCategory(parent); }
      else { setName(""); setParent(result.name); }
      setMessage(child ? `Subcategory “${result.name}” added under “${parent}”.` : `Category “${result.name}” added.`);
      await refresh();
    } catch (error) { setFailed(true); setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <AdminHeading eyebrow="Content organization" title="Categories & subcategories" description="Organize exams and labs using the same category structure." />
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <form onSubmit={event => void add(event)} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <div><h2 className="font-semibold">New category</h2><p className="mt-1 text-sm text-slate-500">The main subject or certification provider, such as Cisco.</p></div>
        <label className="grid gap-2 text-sm font-medium">Category name<input required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="e.g. Cisco" className={`${inputClass} rounded-lg`} /></label>
        <button disabled={busy || !name.trim()} className={`${primaryButton} rounded-lg disabled:opacity-50`}>Add category</button>
      </form>
      <form onSubmit={event => void add(event, true)} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        <div><h2 className="font-semibold">New subcategory</h2><p className="mt-1 text-sm text-slate-500">A certification or topic within a category, such as CCNA.</p></div>
        <label className="grid gap-2 text-sm font-medium">Parent category<select required disabled={busy || loading} value={parent} onChange={event => setParent(event.target.value)} className={`${inputClass} rounded-lg`}><option value="">{loading ? "Loading categories…" : "Select a category"}</option>{categories.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-medium">Subcategory name<input required maxLength={100} disabled={busy} value={childName} onChange={event => setChildName(event.target.value)} placeholder="e.g. CCNA" className={`${inputClass} rounded-lg`} /></label>
        <button disabled={busy || loading || !parent || !childName.trim()} className={`${primaryButton} rounded-lg disabled:opacity-50`}>Add subcategory</button>
      </form>
    </div>
    {message && <p role={failed ? "alert" : "status"} className={`rounded-lg border p-4 text-sm ${failed ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 bg-white text-slate-700"}`}>{message}</p>}
    {error && <p role="alert" className="text-sm text-rose-800">{error} <button className="underline" onClick={() => void refresh()}>Retry</button></p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-6 py-5"><h2 className="font-semibold">Category directory{!loading && ` (${categories.length})`}</h2><p className="mt-1 text-sm text-slate-500">Select a category to view its subcategories. Items in use cannot be deleted.</p></div>
      {loading ? <p className="p-6 text-sm text-slate-500">Loading categories…</p> : !categories.length && !error ? <p className="p-6 text-sm text-slate-500">Add your first category above, then add its subcategories.</p> : <ul className="divide-y divide-slate-100">{categories.map(item => <li key={item.name} className="space-y-4 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="min-w-0 flex-1 basis-48"><button type="button" aria-label={`Subcategories for ${item.name}`} aria-expanded={expandedCategory === item.name} aria-controls={`category-children-${encodeURIComponent(item.name)}`} disabled={busy || Boolean(action)} onClick={() => setExpandedCategory(current => current === item.name ? null : item.name)} className="flex min-h-11 w-full items-center gap-3 rounded-md py-1 pr-3 text-left hover:text-violet-700 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-60">
            <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${expandedCategory === item.name ? "rotate-0" : "-rotate-90"}`} />
            <span className="min-w-0"><span className="block break-words text-sm font-semibold">{item.name}</span><span className="mt-1 block text-xs font-normal text-slate-500">{item.subcategories.length} {item.subcategories.length === 1 ? "subcategory" : "subcategories"}</span></span>
          </button></h3>
          <div className="flex gap-2">
            <button type="button" disabled={busy || Boolean(action)} className={actionButton} aria-label={`Edit category ${item.name}`} onClick={() => begin("edit", item.name)}><Pencil size={14} aria-hidden="true" />Edit</button>
            <button type="button" disabled={busy || Boolean(action)} className={`${actionButton} text-rose-700`} aria-label={`Delete category ${item.name}`} onClick={() => begin("delete", item.name)}><Trash2 size={14} aria-hidden="true" />Delete</button>
          </div>
        </div>
        <div id={`category-children-${encodeURIComponent(item.name)}`} hidden={expandedCategory !== item.name}>
        {expandedCategory === item.name && (item.subcategories.length ? <ul className="ml-2 divide-y divide-slate-100 border-l-2 border-slate-100 pl-4">{item.subcategories.map(child => <li key={child.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="min-w-0 break-words text-sm text-slate-700">{child.name}</span>
          <div className="flex gap-2">
            <button type="button" disabled={busy || Boolean(action)} className={actionButton} aria-label={`Edit subcategory ${child.name} under ${item.name}`} onClick={() => begin("edit", item.name, child.name)}><Pencil size={14} aria-hidden="true" />Edit</button>
            <button type="button" disabled={busy || Boolean(action)} className={`${actionButton} text-rose-700`} aria-label={`Delete subcategory ${child.name} under ${item.name}`} onClick={() => begin("delete", item.name, child.name)}><Trash2 size={14} aria-hidden="true" />Delete</button>
          </div>
        </li>)}</ul> : <p className="ml-2 border-l-2 border-slate-100 py-3 pl-4 text-sm text-slate-500">No subcategories yet. Use the New subcategory form above to add one.</p>)}
        </div>
        {action?.category === item.name && <form onSubmit={applyAction} onKeyDown={event => { if (event.key === "Escape" && !busy) setAction(null); }} aria-label={`${action.mode === "edit" ? "Edit" : "Delete"} ${action.subcategory ? "subcategory" : "category"}`} className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
          <div><h4 className="break-words text-sm font-semibold">{action.mode === "edit" ? "Edit" : "Delete"} {action.subcategory ? "subcategory" : "category"}: {action.subcategory || action.category}</h4>
            <p className="mt-1 text-sm text-slate-600">{action.mode === "edit" ? "The new name will apply to linked exams and lab drafts and published versions. Previous attempt snapshots stay unchanged." : action.subcategory ? "This subcategory will be removed from the directory. Exams and labs will not be deleted. Items in use must be reassigned first." : "This category will be removed from the directory. Remove its subcategories and reassign any linked exams or labs first. This cannot be undone."}</p>
          </div>
          {action.mode === "edit" && <label className="grid max-w-lg gap-2 text-sm font-medium">{action.subcategory ? "Subcategory name" : "Category name"}<input autoFocus required maxLength={100} disabled={busy} value={editName} onChange={event => setEditName(event.target.value)} aria-describedby={actionError ? "category-action-error" : undefined} className={`${inputClass} rounded-lg`} /></label>}
          {actionError && <p id="category-action-error" role="alert" className="text-sm text-rose-800">{actionError}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || (action.mode === "edit" && !editName.trim())} className={`inline-flex min-h-10 items-center rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${action.mode === "delete" ? "bg-rose-700 hover:bg-rose-800" : "bg-slate-900 hover:bg-slate-800"}`}>{busy ? "Saving…" : action.mode === "edit" ? "Save changes" : "Confirm delete"}</button>
            <button type="button" disabled={busy} className={actionButton} onClick={() => setAction(null)}>Cancel</button>
          </div>
        </form>}
      </li>)}</ul>}
    </section>
  </div>;
}
