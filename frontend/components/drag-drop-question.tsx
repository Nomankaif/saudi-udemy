"use client";

import { useId, useState } from "react";
import { GripVertical, X } from "lucide-react";
import type { DropTarget, Placement } from "@/lib/types";

type Item = { id: string; text: string };
type Props = { items: Item[]; targets: DropTarget[]; value: Placement[]; onChange: (value: Placement[]) => void; disabled?: boolean };

export function DragDropQuestion({ items, targets, value, onChange, disabled = false }: Props) {
  const instructionId = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const totalSlots = targets.reduce((sum, t) => sum + t.capacity, 0);
  function move(itemId: string, targetId: string | null) {
    if (disabled || !items.some(i => i.id === itemId)) return;
    const next = value.filter(p => p.itemId !== itemId);
    const target = targets.find(t => t.id === targetId);
    if (targetId && (!target || next.filter(p => p.targetId === targetId).length >= target.capacity)) {
      setAnnouncement("This group is full. Remove an item before placing another."); return;
    }
    if (targetId) next.push({ itemId, targetId });
    setSelected(null); setOver(null);
    setAnnouncement(`${items.find(i => i.id === itemId)?.text} moved to ${target?.label || "Available items"}.`);
    onChange(next);
  }
  const dropHandlers = (targetId: string | null) => ({
    onDragOver: (e: React.DragEvent) => { if (!disabled) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(targetId || "bank"); } },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData("text/plain"), targetId); },
  });
  const item = (i: Item, placed = false) => <div key={i.id} className={`flex min-w-0 items-stretch rounded-md border bg-white ${selected === i.id ? "border-violet-600 ring-1 ring-violet-600" : "border-slate-300"}`}>
    <button type="button" disabled={disabled} draggable={!disabled} aria-pressed={selected === i.id} aria-label={`Select ${i.text || "untitled item"}`} onClick={() => { setSelected(selected === i.id ? null : i.id); setAnnouncement(`Select a destination for ${i.text}.`); }}
      onDragStart={e => { e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; setSelected(i.id); }} onDragEnd={() => setOver(null)}
      className="flex min-w-0 flex-1 cursor-grab items-start gap-2 rounded-md px-3 py-3 text-left text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-violet-600 disabled:cursor-wait disabled:opacity-60">
      <GripVertical size={16} aria-hidden="true" className="mt-1 shrink-0 text-slate-400" /><span className="break-words">{i.text || "Untitled item"}</span>
    </button>
    {placed && <button type="button" aria-label={`Return ${i.text} to available items`} disabled={disabled} onClick={() => move(i.id, null)} className="shrink-0 px-3 text-slate-500 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-40"><X size={15} /></button>}
  </div>;
  return <div className="space-y-4" aria-describedby={instructionId} onKeyDown={e => { if (e.key === "Escape") { setSelected(null); setAnnouncement("Selection cancelled."); } }}>
    <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
      <p id={instructionId} className="max-w-xl leading-6 text-slate-500">Drag items into the groups, or select an item and then a destination. Use Tab and Enter with a keyboard. Items may be left unused; order within a group does not matter.</p>
      <span className="shrink-0 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{value.length} / {totalSlots} placed</span>
    </div>
    <div className="grid items-start gap-5 md:grid-cols-2">
      <section aria-label="Available items" {...dropHandlers(null)} className={`space-y-3 rounded-lg border p-4 ${over === "bank" ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-slate-50"}`}>
        <h3 className="text-sm font-semibold">Available items</h3>
        {items.filter(i => !value.some(p => p.itemId === i.id)).map(i => item(i))}
        {!items.some(i => !value.some(p => p.itemId === i.id)) && <p className="py-4 text-sm text-slate-500">All items placed.</p>}
        <button type="button" disabled={disabled || !selected || !value.some(p => p.itemId === selected)} onClick={() => selected && move(selected, null)} className="text-xs font-semibold text-slate-700 underline underline-offset-4 disabled:opacity-40">Return selected item here</button>
      </section>
      <div className="space-y-4">{targets.map(t => {
        const entries = items.filter(i => value.some(p => p.itemId === i.id && p.targetId === t.id));
        const full = entries.length >= t.capacity;
        return <section key={t.id} aria-label={t.label || "Destination group"} {...dropHandlers(t.id)} className={`space-y-3 rounded-lg border p-4 ${over === t.id ? "border-violet-500 bg-violet-50" : "border-slate-200"}`}>
          <div className="flex items-start justify-between gap-3"><h3 className="break-words text-sm font-semibold">{t.label || "Untitled group"}</h3><span className="shrink-0 text-xs text-slate-500">{entries.length}/{t.capacity}</span></div>
          {entries.map(i => item(i, true))}
          {!full && <p className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500">{t.capacity - entries.length} empty {t.capacity - entries.length === 1 ? "slot" : "slots"}</p>}
          <button type="button" disabled={disabled || !selected || full} onClick={() => selected && move(selected, t.id)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-600 disabled:opacity-40">Place selected item in {t.label || "this group"}</button>
        </section>;
      })}</div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" aria-live="polite" className="text-xs text-slate-600">{announcement || (selected ? "Choose a destination." : "Select or drag an item to begin.")}</p>
      <button type="button" disabled={disabled || !value.length} onClick={() => { onChange([]); setSelected(null); setAnnouncement("All placements cleared."); }} className="text-xs font-semibold text-slate-600 underline underline-offset-4 disabled:opacity-40">Clear placements</button>
    </div>
  </div>;
}

export function DragDropReview({ items, targets, placements, expected }: { items: Item[]; targets: DropTarget[]; placements?: Placement[]; expected: Placement[] }) {
  const destination = (values: Placement[], id: string) => {
    const p = values.find(entry => entry.itemId === id);
    return p ? targets.find(t => t.id === p.targetId)?.label || "Unknown group" : "Unused";
  };
  return <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-sm"><caption className="sr-only">Drag-and-drop answer mapping</caption>
    <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">Item</th>{placements && <th className="p-3">Your placement</th>}<th className="p-3">Correct placement</th></tr></thead>
    <tbody>{items.map(i => { const correct = destination(expected, i.id), actual = destination(placements || [], i.id); const same = (placements || []).find(p => p.itemId === i.id)?.targetId === expected.find(p => p.itemId === i.id)?.targetId; return <tr key={i.id} className="border-t border-slate-100"><th scope="row" className="p-3 font-medium">{i.text}</th>{placements && <td className={`p-3 ${same ? "text-emerald-700" : "text-rose-700"}`}>{actual}<span className="ml-2 text-xs">({same ? "Correct" : "Incorrect"})</span></td>}<td className="p-3 text-slate-700">{correct}</td></tr>; })}</tbody>
  </table></div>;
}
