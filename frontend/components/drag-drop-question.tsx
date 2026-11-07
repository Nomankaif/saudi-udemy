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
  const item = (i: Item, placed = false) => <div key={i.id} className="drag-drop-item flex min-w-0 items-stretch border" data-selected={selected === i.id}>
    <button type="button" disabled={disabled} draggable={!disabled} aria-pressed={selected === i.id} aria-label={`Select ${i.text || "untitled item"}`} onClick={() => { setSelected(selected === i.id ? null : i.id); setAnnouncement(`Select a destination for ${i.text}.`); }}
      onDragStart={e => { e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; setSelected(i.id); }} onDragEnd={() => setOver(null)}
      className="flex min-w-0 flex-1 cursor-grab items-center gap-2 px-3 py-2.5 text-left text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-blue-700)] disabled:cursor-wait disabled:opacity-60">
      <GripVertical size={16} aria-hidden="true" className="drag-drop-grip shrink-0" /><span className="break-words">{i.text || "Untitled item"}</span>
    </button>
    {placed && <button type="button" aria-label={`Return ${i.text} to available items`} disabled={disabled} onClick={() => move(i.id, null)} className="shrink-0 px-3 text-slate-500 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-[var(--site-blue-700)] disabled:opacity-40"><X size={15} /></button>}
  </div>;
  return <div className="drag-drop-question space-y-4" aria-describedby={instructionId} onKeyDown={e => { if (e.key === "Escape") { setSelected(null); setAnnouncement("Selection cancelled."); } }}>
    <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
      <p id={instructionId} className="max-w-xl leading-6 text-slate-500">Drag items into the groups, or select an item and then a destination. Use Tab and Enter with a keyboard. Items may be left unused; order within a group does not matter.</p>
      <span className="drag-drop-count shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold">{value.length} / {totalSlots} placed</span>
    </div>
    <div className="grid items-start gap-4 md:grid-cols-2">
      <section aria-label="Available items" {...dropHandlers(null)} className="drag-drop-bank space-y-2.5" data-over={over === "bank"}>
        <h3 className="drag-drop-column-heading">Available items</h3>
        {items.filter(i => !value.some(p => p.itemId === i.id)).map(i => item(i))}
        {!items.some(i => !value.some(p => p.itemId === i.id)) && <p className="py-4 text-sm text-slate-500">All items placed.</p>}
        {!disabled && selected && value.some(p => p.itemId === selected) && <button type="button" onClick={() => move(selected, null)} className="drag-drop-link text-xs font-semibold underline underline-offset-4">Return selected item here</button>}
      </section>
      <div className="space-y-2.5"><h3 className="drag-drop-column-heading">Destinations</h3>{targets.map(t => {
        const entries = items.filter(i => value.some(p => p.itemId === i.id && p.targetId === t.id));
        const full = entries.length >= t.capacity;
        return <section key={t.id} aria-label={t.label || "Destination group"} {...dropHandlers(t.id)} className="drag-drop-target space-y-2 border px-3 py-2.5" data-over={over === t.id}>
          <div className="flex items-start justify-between gap-3"><h4 className="break-words text-sm font-semibold">{t.label || "Untitled group"}</h4><span className="shrink-0 text-xs text-slate-600">{entries.length}/{t.capacity}</span></div>
          {entries.map(i => item(i, true))}
          {!full && <p className="drag-drop-empty text-xs">{entries.length ? `${t.capacity - entries.length} more ${t.capacity - entries.length === 1 ? "item" : "items"} can be placed here` : "Drop an item here"}</p>}
          {!disabled && selected && !full && <button type="button" onClick={() => move(selected, t.id)} className="drag-drop-place border px-3 py-2 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-[var(--site-blue-700)]">Place selected item here</button>}
        </section>;
      })}</div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" aria-live="polite" className="text-xs text-slate-600">{announcement || (selected ? "Choose a destination." : "Select or drag an item to begin.")}</p>
      <button type="button" disabled={disabled || !value.length} onClick={() => { onChange([]); setSelected(null); setAnnouncement("All placements cleared."); }} className="drag-drop-link text-xs font-semibold underline underline-offset-4 disabled:opacity-40">Clear placements</button>
    </div>
  </div>;
}

export function DragDropReview({ items, targets, placements, expected }: { items: Item[]; targets: DropTarget[]; placements?: Placement[]; expected: Placement[] }) {
  const destination = (values: Placement[], id: string) => {
    const p = values.find(entry => entry.itemId === id);
    return p ? targets.find(t => t.id === p.targetId)?.label || "Unknown group" : "Unused";
  };
  return <div className="drag-drop-review overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-left text-sm"><caption className="sr-only">Drag-and-drop answer mapping</caption>
    <thead className="text-xs"><tr><th className="p-3">Item</th>{placements && <th className="p-3">Your placement</th>}<th className="p-3">Correct placement</th></tr></thead>
    <tbody>{items.map(i => { const correct = destination(expected, i.id), actual = destination(placements || [], i.id); const same = (placements || []).find(p => p.itemId === i.id)?.targetId === expected.find(p => p.itemId === i.id)?.targetId; return <tr key={i.id} className="border-t border-slate-100"><th scope="row" className="p-3 font-medium">{i.text}</th>{placements && <td className={`p-3 ${same ? "text-emerald-700" : "text-rose-700"}`}>{actual}<span className="ml-2 text-xs">({same ? "Correct" : "Incorrect"})</span></td>}<td className="p-3 text-slate-700">{correct}</td></tr>; })}</tbody>
  </table></div>;
}
