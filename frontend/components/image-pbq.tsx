"use client";
import Image from "next/image";
import { useId, useState } from "react";
import { pbqFields, isTextField } from "@/lib/pbq-fields";
import { elementName, hotspotBounds } from "@/lib/pbq-hotspots";
import type { PbqDefinition, PbqAnswer, PbqKey } from "@/lib/types";
import { QuestionContent } from "./question-content";

const control = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";

export function ImagePbq({ imageUrl, definition, value, onChange, disabled = false }: {
  imageUrl: string; definition: PbqDefinition; value: PbqAnswer[]; onChange: (value: PbqAnswer[]) => void; disabled?: boolean;
}) {
  const panelId = useId();
  const [selected, setSelected] = useState("");
  const [zoom, setZoom] = useState(100);
  const [dragged, setDragged] = useState<{fieldId: string; value: string} | null>(null);
  const area = definition.areas.find(a => a.id === selected);
  const [selectedTab, setSelectedTab] = useState("");
  const activeTab = area?.tabs?.find(t => t.id === selectedTab)?.id || area?.tabs?.[0]?.id;
  const fields = pbqFields(definition).filter(ref => ref.area.id === area?.id);
  const points = fields.reduce((n, ref) => n + ref.field.points, 0);
  function update(values: string[], fieldId?: string) {
    if (!area || disabled) return;
    onChange([...value.filter(v => v.areaId !== area.id || v.fieldId !== fieldId), ...(values.length ? [{ areaId: area.id, ...(fieldId ? {fieldId} : {}), values }] : [])]);
  }
  return <section className="overflow-hidden rounded-lg border border-slate-200">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div><h3 className="text-sm font-semibold">Interactive diagram</h3><p className="mt-1 text-xs text-slate-500">Click a device or element in the diagram to view its question or evidence.</p></div>
      <div className="flex items-center gap-3 text-xs"><label>Zoom <select aria-label="Diagram zoom" className="rounded border border-slate-300 bg-white p-1.5" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[100, 150, 200].map(z => <option key={z} value={z}>{z}%</option>)}</select></label><button type="button" disabled={disabled} className="rounded border border-slate-300 px-3 py-2 disabled:opacity-40" onClick={() => { if (!disabled && window.confirm("Clear all answers for this question?")) onChange([]); }}>Reset answers</button></div>
    </div>
    <div className={`grid min-w-0 ${definition.areas.some(a => a.kind === "form") ? "xl:grid-cols-[minmax(0,1fr)_380px]" : "xl:grid-cols-[minmax(0,1fr)_300px]"}`}>
      <div className="min-w-0 overflow-auto bg-slate-100 p-4" style={{ maxHeight: 720 }}>
        <div className="relative bg-white" style={{ width: `${zoom}%` }}>
          {imageUrl ? <Image unoptimized src={imageUrl} alt={definition.alt || "Question diagram"} width={1600} height={1000} className="block h-auto w-full" /> : <p className="p-10 text-sm text-slate-500">Upload a diagram to preview.</p>}
          {definition.areas.map(a => {
            const bounds = hotspotBounds(a);
            return <button key={a.id} type="button" aria-label={`Open ${elementName(a.label)}`} aria-expanded={a.id === area?.id} aria-controls={panelId} title={elementName(a.label)}
              onClick={() => {setSelected(a.id);setSelectedTab("");setDragged(null);}}
              style={{left: `${bounds.left}%`, top: `${bounds.top}%`, width: `${bounds.width}%`, height: `${bounds.height}%`}}
              className="absolute cursor-pointer rounded-sm border-0 bg-transparent p-0 hover:outline hover:outline-2 hover:outline-slate-400/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600 focus-visible:outline-offset-2">{a.marker === "question" ? <span aria-hidden="true" className="absolute left-1/2 top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-amber-600 bg-white text-sm font-bold text-amber-700 shadow-sm">?</span> : undefined}</button>;
          })}
        </div>
      </div>
      <div id={panelId} className="min-w-0 space-y-5 border-t border-slate-200 bg-white p-4 xl:border-l xl:border-t-0" aria-live="polite">
        {area ? <><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{elementName(area.label)}</h4><p className="mt-1 text-xs text-slate-500">{area.kind === "evidence" ? "Supporting evidence · Not scored" : `${points} point${points === 1 ? "" : "s"}`}</p></div><button type="button" className="text-xs text-slate-500 underline" onClick={() => {setSelected("");setDragged(null);}}>Close</button></div>
          {area.evidence && <div className="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-sm"><QuestionContent text={area.evidence} /></div>}
          {area.kind === "form" && Boolean(area.tabs?.length) && <div role="tablist" aria-label={elementName(area.label) + " settings"} className="flex overflow-x-auto border-b border-slate-200">
            {area.tabs!.map((tab, index) => <button key={tab.id} type="button" role="tab" id={panelId + "-" + tab.id} aria-selected={activeTab === tab.id} aria-controls={panelId + "-fields"} tabIndex={activeTab === tab.id ? 0 : -1}
              className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${activeTab === tab.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-900"}`}
              onClick={() => {setSelectedTab(tab.id);setDragged(null);}}
              onKeyDown={e => {const tabs = area.tabs!; const next = e.key === "ArrowRight" ? (index + 1) % tabs.length : e.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1; const target = tabs[next]; if (target) {e.preventDefault();setSelectedTab(target.id);setDragged(null);document.getElementById(panelId + "-" + target.id)?.focus();}}}>{tab.label}</button>)}
          </div>}
          <div id={panelId + "-fields"} role={area.kind === "form" && area.tabs?.length ? "tabpanel" : undefined} aria-labelledby={area.kind === "form" && activeTab ? panelId + "-" + activeTab : undefined}>
          <fieldset disabled={disabled} className="min-w-0 space-y-3"><legend className="sr-only">{elementName(area.label)}</legend>
            {fields.filter(ref => area.kind !== "form" || !area.tabs?.length || ref.field.tabId === activeTab).map(ref => {
              const field = ref.field, answer = value.find(v => v.areaId === area.id && v.fieldId === ref.fieldId)?.values || [];
              const fieldLabel = area.kind === "form" ? field.label : "Your answer";
              const updateField = (values: string[]) => update(values, ref.fieldId);
              const dragId = area.id + ":" + field.id;
              return <div key={ref.fieldId || area.id} className="space-y-3">
                {area.kind === "form" && !isTextField(field.kind) && field.kind !== "select" && <p className="text-sm font-medium">{field.label}</p>}
                {area.kind === "form" && field.evidence && <QuestionContent text={field.evidence} />}
            {isTextField(field.kind) && <label className="block text-sm">{fieldLabel}{field.kind === "textarea" ? <textarea rows={4} maxLength={500} className={`${control} mt-2 resize-y`} value={answer[0] || ""} onChange={e => updateField(e.target.value ? [e.target.value] : [])} /> : <input autoComplete="off" spellCheck={false} maxLength={500} className={`${control} mt-2`} value={answer[0] || ""} onChange={e => updateField(e.target.value ? [e.target.value] : [])} />}{(area.kind !== "form" || field.caseSensitive) && <span className="mt-2 block text-xs text-slate-500">{field.caseSensitive ? "Case-sensitive answer." : "Capitalization does not affect grading."}</span>}</label>}
            {field.kind === "select" && <label className="block text-sm">{fieldLabel}<select className={`${control} mt-2`} value={answer[0] || ""} onChange={e => updateField(e.target.value ? [e.target.value] : [])}><option value="">Select an answer</option>{field.options.map(o => <option key={o.id} value={o.id}>{o.text}</option>)}</select></label>}
            {(field.kind === "radio" || field.kind === "checkbox") && <><p className="text-xs text-slate-500">{field.kind === "checkbox" ? "Select all that apply." : "Select one answer."}</p>{field.options.map(o => <label key={o.id} className="flex items-start gap-3 rounded border border-slate-200 p-3 text-sm"><input className="mt-1 accent-violet-600" type={field.kind === "radio" ? "radio" : "checkbox"} name={`pbq-${panelId}-${area.id}-${field.id}`} checked={answer.includes(o.id)} onChange={() => updateField(field.kind === "radio" ? [o.id] : answer.includes(o.id) ? answer.filter(v => v !== o.id) : [...answer, o.id])} /><span>{o.text}</span></label>)}</>}
            {field.kind === "match" && <><p className="text-xs text-slate-500">Drag a choice to the answer box, or select a choice then select the box. Choices may be reused at other locations.</p><div className="flex flex-wrap gap-2">{field.options.map(o => <button type="button" key={o.id} draggable={!disabled} onDragStart={e => { e.dataTransfer.setData("text/plain", o.id); setDragged({fieldId: dragId, value: o.id}); }} onClick={() => setDragged({fieldId: dragId, value: o.id})} aria-pressed={dragged?.fieldId === dragId && dragged.value === o.id} className={`rounded border px-3 py-2 text-sm ${dragged?.fieldId === dragId && dragged.value === o.id ? "border-violet-600 bg-violet-50" : "border-slate-300"}`}>{o.text}</button>)}</div><button type="button" className="w-full rounded border-2 border-dashed border-slate-400 p-5 text-sm" onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault();const id = e.dataTransfer.getData("text/plain");if (field.options.some(o => o.id === id)) {updateField([id]);setDragged(null);}}} onClick={() => {if (dragged?.fieldId === dragId && field.options.some(o => o.id === dragged.value)) {updateField([dragged.value]);setDragged(null);}}}>{field.options.find(o => o.id === answer[0])?.text || "Place answer here"}</button></>}
            {area.kind !== "form" && field.kind !== "evidence" && <button type="button" className="text-xs text-slate-600 underline disabled:opacity-40" onClick={() => updateField([])}>Clear this answer</button>}
              </div>;
            })}
            {area.kind === "form" && <button type="button" className="text-xs text-slate-600 underline disabled:opacity-40" onClick={() => {if (!disabled && window.confirm("Clear every field for this element, including all tabs?")) onChange(value.filter(v => v.areaId !== area.id));}}>Reset this element</button>}
          </fieldset></div></> : <p className="text-sm text-slate-500">Select an element in the diagram to open its question. You can also use Tab and Enter to select an element.</p>}
      </div>
    </div>
  </section>;
}

export function PbqReview({ definition, expected, answers = [], grades }: { definition: PbqDefinition; expected: PbqKey[]; answers?: PbqAnswer[]; grades?: { areaId: string; fieldId?: string; earned: number; maximum: number }[] }) {
  return <div className="space-y-3">{pbqFields(definition).map(({area, field: a, fieldId}) => {
    const key = expected.find(k => k.areaId === area.id && k.fieldId === fieldId), submitted = answers.find(v => v.areaId === area.id && v.fieldId === fieldId)?.values || [];
    const label = (values: string[]) => values.map(v => isTextField(a.kind) ? v : a.options.find(o => o.id === v)?.text || v).join(isTextField(a.kind) ? " / " : ", ");
    const grade = grades?.find(g => g.areaId === area.id && g.fieldId === fieldId);
    return <div key={area.id + ":" + (fieldId || "")} className="rounded border border-slate-200 bg-white p-4 text-sm"><h4 className="font-semibold">{elementName(area.label)}{fieldId ? ` · ${area.tabs?.find(t => t.id === a.tabId)?.label ? area.tabs.find(t => t.id === a.tabId)!.label + " / " : ""}${a.label}` : ""}{grade && <span className="float-right font-normal">{grade.earned}/{grade.maximum} points</span>}</h4><p className="mt-2 whitespace-pre-wrap text-slate-600">Your answer: {label(submitted) || "Unanswered"}</p><p className="mt-1 whitespace-pre-wrap text-emerald-800">{isTextField(a.kind) ? "Accepted answers" : "Correct answer"}: {label(key?.values || []) || "Not configured"}</p>{key?.explanation && <div className="mt-2"><QuestionContent text={key.explanation} /></div>}</div>;
  })}</div>;
}
