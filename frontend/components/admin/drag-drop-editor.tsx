"use client";
import type { Question } from "@/lib/types";
import { inputClass, secondaryButton } from "./ui";

export function dragDropIssues(q: Question) {
  const targets = q.dropTargets || [], key = q.correctPlacements || [];
  const issues: string[] = [];
  if (q.options.length < 2 || q.options.length > 20) issues.push("Use 2–20 draggable items.");
  q.options.forEach((item, index) => {
    if (!item.text.trim()) issues.push(`Item ${index + 1}: enter the item text.`);
    if (item.text.length > 1000) issues.push(`Item ${index + 1}: shorten the text to 1,000 characters or fewer.`);
  });
  if (!targets.length || targets.length > 10) issues.push("Use 1–10 destination groups.");
  targets.forEach((target, index) => {
    const name = target.label.trim() ? `Group “${target.label.slice(0, 80)}”` : `Group ${index + 1}`;
    if (!target.label.trim()) issues.push(`${name}: enter a group name.`);
    if (target.label.length > 200) issues.push(`${name}: shorten the name to 200 characters or fewer.`);
    if (!Number.isInteger(target.capacity) || target.capacity < 1 || target.capacity > 20) {
      issues.push(`${name}: set Slots to a whole number between 1 and 20.`);
      return;
    }
    const assigned = new Set(key.filter(p => p.targetId === target.id && q.options.some(i => i.id === p.itemId)).map(p => p.itemId)).size;
    if (assigned !== target.capacity) {
      const difference = Math.abs(target.capacity - assigned);
      const action = assigned < target.capacity ? `Assign ${difference} more item${difference === 1 ? "" : "s"} using Correct destination` : `Remove ${difference} item assignment${difference === 1 ? "" : "s"}`;
      issues.push(`${name} has ${target.capacity} slot${target.capacity === 1 ? "" : "s"} but ${assigned} item${assigned === 1 ? "" : "s"} assigned. ${action}${assigned > 0 && assigned <= 20 ? ` or change Slots to ${assigned}` : ""}.`);
    }
  });
  return issues;
}

export function DragDropEditor({ question: q, onChange }: { question: Question; onChange: (q: Question) => void }) {
  const targets = q.dropTargets || [], key = q.correctPlacements || [];
  return <div className="space-y-6">
    <section className="space-y-3">
      <h3 className="font-semibold">Destination groups</h3>
      <p className="text-sm leading-6 text-slate-500">Name each group and set how many items belong in it. Use one slot per group for matching or numbered steps.</p>
      {targets.map((t, index) => <div key={t.id} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-4">
        <label className="min-w-40 flex-1 space-y-2 text-xs font-semibold">Group {index + 1} name<input className={`${inputClass} block w-full rounded-md`} maxLength={200} value={t.label} onChange={e => onChange({ ...q, dropTargets: targets.map(g => g.id === t.id ? { ...g, label: e.target.value } : g) })} /></label>
        <label className="w-20 space-y-2 text-xs font-semibold">Slots<input type="number" min={1} max={20} aria-label={`Slots for group ${index + 1}`} className={`${inputClass} block w-full rounded-md`} value={t.capacity} onChange={e => onChange({ ...q, dropTargets: targets.map(g => g.id === t.id ? { ...g, capacity: Number(e.target.value) } : g) })} /></label>
        <button type="button" aria-label={`Remove group ${index + 1}`} onClick={() => onChange({ ...q, dropTargets: targets.filter(g => g.id !== t.id), correctPlacements: key.filter(p => p.targetId !== t.id) })} className="px-2 py-3 text-xs font-medium text-rose-700">Remove</button>
        <p className={`w-full text-xs ${key.filter(p => p.targetId === t.id).length === t.capacity ? "text-emerald-700" : "text-amber-800"}`}>
          {key.filter(p => p.targetId === t.id).length} of {t.capacity} slots assigned in the answer key
        </p>
      </div>)}
      <button type="button" disabled={targets.length >= 10} className={secondaryButton} onClick={() => onChange({ ...q, dropTargets: [...targets, { id: `g_${crypto.randomUUID()}`, label: "", capacity: 1 }] })}>Add group</button>
    </section>
    <section className="space-y-3">
      <h3 className="font-semibold">Draggable items & answer key</h3>
      <p className="text-sm leading-6 text-slate-500">Choose each item’s correct destination. “Unused distractor” stays in the item bank. The answer key is hidden from students during the exam.</p>
      {q.options.map((i, index) => <div key={i.id} className="space-y-3 rounded-lg border border-slate-200 p-4">
        <label className="block space-y-2 text-xs font-semibold">Item {index + 1}<input maxLength={1000} value={i.text} className={`${inputClass} block w-full rounded-md`} onChange={e => onChange({ ...q, options: q.options.map(item => item.id === i.id ? { ...item, text: e.target.value } : item) })} /></label>
        <div className="flex items-end gap-3"><label className="min-w-0 flex-1 space-y-2 text-xs font-semibold">Correct destination<select aria-label={`Correct destination for item ${index + 1}`} value={key.find(p => p.itemId === i.id)?.targetId || ""} className={`${inputClass} block w-full rounded-md`} onChange={e => onChange({ ...q, correctPlacements: [...key.filter(p => p.itemId !== i.id), ...(e.target.value ? [{ itemId: i.id, targetId: e.target.value }] : [])] })}><option value="">Unused distractor</option>{targets.map((t, j) => <option key={t.id} value={t.id}>{t.label || `Group ${j + 1}`}</option>)}</select></label>
        <button type="button" aria-label={`Remove item ${index + 1}`} onClick={() => onChange({ ...q, options: q.options.filter(item => item.id !== i.id), correctPlacements: key.filter(p => p.itemId !== i.id) })} className="px-2 py-3 text-xs font-medium text-rose-700">Remove</button></div>
      </div>)}
      <button type="button" disabled={q.options.length >= 20} className={secondaryButton} onClick={() => onChange({ ...q, options: [...q.options, { id: `i_${crypto.randomUUID()}`, text: "" }] })}>Add item</button>
      <p className="text-xs leading-5 text-slate-500">Scoring: all placements must match the key for credit. Order within a group does not matter. Distractors must remain unused.</p>
    </section>
  </div>;
}
