"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { PbqArea, PbqField, PbqKey } from "@/lib/types";
import { isTextField } from "@/lib/pbq-fields";
import { inputClass, secondaryButton } from "./ui";

const input = `${inputClass} mt-2 w-full rounded-md`;
export const fieldTypes = [
  ["text", "Short text answer"], ["textarea", "Text area (multiple lines)"], ["select", "Dropdown"],
  ["radio", "Single choice"], ["checkbox", "Multiple selections"], ["match", "Drag / select and place"],
] as const;

export function PbqFieldSettings({ field, answerKey, onField, onKey }: {
  field: PbqField | PbqArea; answerKey: PbqKey;
  onField: (patch: Partial<PbqField>) => void; onKey: (patch: Partial<PbqKey>) => void;
}) {
  if (field.kind === "evidence" || field.kind === "form") return null;
  return <div className="space-y-4">
    {!isTextField(field.kind) && <div><p className="mb-2 text-sm font-medium">Choices</p><div className="space-y-2">{field.options.map((o, i) => <div key={o.id} className="flex gap-2">
      <input aria-label={`Choice ${i + 1}`} className={`${inputClass} min-w-0 flex-1 rounded-md`} maxLength={500} value={o.text} onChange={e => onField({options: field.options.map(v => v.id === o.id ? {...v, text: e.target.value} : v)})}/>
      <button type="button" aria-label={`Remove choice ${i + 1}`} className="p-2 text-slate-500" onClick={() => onField({options: field.options.filter(v => v.id !== o.id)})}><Trash2 size={14}/></button>
    </div>)}</div><button type="button" disabled={field.options.length >= 30} className="mt-2 text-sm underline" onClick={() => onField({options: [...field.options, {id: crypto.randomUUID(), text: ""}]})}>Add choice</button></div>}
    <div className="space-y-3 border-t border-slate-200 pt-4">
      <h4 className="text-sm font-semibold">Private answer key · Never shown during an active timed exam</h4>
      {isTextField(field.kind) ? <>
        {field.kind === "textarea" ? <div className="space-y-3"><p className="text-sm">Accepted answers · One complete response per box</p>{(answerKey.values.length ? answerKey.values : [""]).map((v, i) => <div key={i} className="flex items-start gap-2"><label className="min-w-0 flex-1 text-xs">Accepted response {i + 1}<textarea className={input} rows={3} maxLength={500} value={v} onChange={e => {const values = answerKey.values.length ? [...answerKey.values] : [""]; values[i] = e.target.value; onKey({values});}}/></label><button type="button" aria-label={`Remove accepted response ${i + 1}`} className="mt-6 p-2 text-slate-500" onClick={() => onKey({values: answerKey.values.filter((_, n) => n !== i)})}><Trash2 size={14}/></button></div>)}<button type="button" className="text-sm underline" disabled={answerKey.values.length >= 30} onClick={() => onKey({values: [...(answerKey.values.length ? answerKey.values : [""]), ""]})}>Add accepted response</button></div>
          : <label className="block text-sm">Accepted answers — one alternative per line<textarea className={input} rows={3} value={answerKey.values.join("\n")} onChange={e => onKey({values: e.target.value.split("\n")})}/></label>}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={field.caseSensitive} onChange={e => onField({caseSensitive: e.target.checked})}/>Case-sensitive matching</label>
        <p className="text-xs text-slate-500">Up to 500 characters per response. Leading/trailing spaces are ignored; internal text and line breaks must match an accepted response. This is exact-answer grading, not AI grading.</p>
      </> : field.kind === "checkbox" ? <div className="space-y-2">{field.options.map(o => <label key={o.id} className="flex gap-2 text-sm"><input type="checkbox" checked={answerKey.values.includes(o.id)} onChange={() => onKey({values: answerKey.values.includes(o.id) ? answerKey.values.filter(v => v !== o.id) : [...answerKey.values, o.id]})}/>{o.text || "Unnamed choice"}</label>)}<p className="text-xs text-slate-500">All required selections must match for this field to earn its points.</p></div>
        : <label className="block text-sm">Correct choice<select className={input} value={answerKey.values[0] || ""} onChange={e => onKey({values: e.target.value ? [e.target.value] : []})}><option value="">Choose correct answer</option>{field.options.map(o => <option key={o.id} value={o.id}>{o.text || "Unnamed choice"}</option>)}</select></label>}
      <label className="block text-sm">Answer feedback<textarea className={input} maxLength={5000} rows={2} value={answerKey.explanation} onChange={e => onKey({explanation: e.target.value})}/></label>
    </div>
  </div>;
}

export function PbqFormEditor({ area, keys, onChange }: { area: PbqArea; keys: PbqKey[]; onChange: (area: PbqArea, keys: PbqKey[]) => void }) {
  const [selected, setSelected] = useState(area.fields?.[0]?.id || "");
  const fields = area.fields || [], tabs = area.tabs || [], field = fields.find(f => f.id === selected) || fields[0];
  const key = keys.find(k => k.fieldId === field?.id) || {areaId: area.id, fieldId: field?.id, values: [], explanation: ""};
  function changeField(patch: Partial<PbqField>) {if (!field) return;onChange({...area, fields: fields.map(f => f.id === field.id ? {...f, ...patch} : f)}, keys);}
  function changeKey(patch: Partial<PbqKey>) {if (!field) return;onChange(area, [...keys.filter(k => k.fieldId !== field.id), {...key, ...patch, areaId: area.id, fieldId: field.id}]);}
  function addField() {
    const id = crypto.randomUUID();
    onChange({...area, fields: [...fields, {id, label: "", kind: "text", ...(tabs[0] ? {tabId: tabs[0].id} : {}), points: 1, caseSensitive: false, evidence: "", options: [{id: "choice1", text: ""}, {id: "choice2", text: ""}]}]}, keys);
    setSelected(id);
  }
  return <div className="space-y-5 border-t border-slate-200 pt-5">
    <div><h4 className="font-semibold">Configuration form</h4><p className="mt-1 text-sm text-slate-500">Add labeled fields for this element. Use optional tabs for phases or separate settings. Each field is graded independently.</p></div>
    <div className="space-y-3"><p className="text-sm font-medium">Tabs (optional)</p>{tabs.map(t => <div key={t.id} className="flex gap-2"><input aria-label={`Tab name: ${t.label}`} className={`${inputClass} min-w-0 flex-1 rounded-md`} value={t.label} maxLength={80} onChange={e => onChange({...area, tabs: tabs.map(v => v.id === t.id ? {...v, label: e.target.value} : v)}, keys)}/><button type="button" aria-label={`Remove tab ${t.label}`} className="p-2 text-slate-500" onClick={() => {
      if (!window.confirm("Remove this tab? Its fields will be kept and moved to the first remaining tab.")) return;
      const remaining = tabs.filter(v => v.id !== t.id);
      onChange({...area, tabs: remaining, fields: fields.map(f => f.tabId === t.id ? {...f, tabId: remaining[0]?.id} : f)}, keys);
    }}><Trash2 size={16}/></button></div>)}<button type="button" className={secondaryButton} disabled={tabs.length >= 8} onClick={() => {
      const id = crypto.randomUUID();
      onChange({...area, tabs: [...tabs, {id, label: `Tab ${tabs.length + 1}`}], fields: tabs.length ? fields : fields.map(f => ({...f, tabId: id}))}, keys);
    }}>Add tab</button></div>
    <div className="flex flex-wrap gap-2">{fields.map((f, i) => <button type="button" key={f.id} aria-pressed={f.id === field?.id} className={`rounded border px-3 py-2 text-sm ${f.id === field?.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"}`} onClick={() => setSelected(f.id)}>{i + 1}. {f.label || "Unnamed field"}</button>)}<button type="button" className={secondaryButton} disabled={fields.length >= 20} onClick={addField}><Plus size={16}/>Add field</button></div>
    {field && <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Field {fields.indexOf(field) + 1}</h4><button type="button" aria-label="Delete selected field" className="p-2 text-rose-700" onClick={() => {if (!window.confirm("Remove this field and its private answer key?")) return;onChange({...area, fields: fields.filter(f => f.id !== field.id)}, keys.filter(k => k.fieldId !== field.id));setSelected("");}}><Trash2 size={16}/></button></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Field label<input className={input} placeholder="Protocol, Mode, Local network/mask…" value={field.label} maxLength={200} onChange={e => changeField({label: e.target.value})}/></label><label className="text-sm font-medium">Field type<select className={input} value={field.kind} onChange={e => onChange({...area, fields: fields.map(f => f.id === field.id ? {...f, kind: e.target.value as PbqField["kind"]} : f)}, keys.filter(k => k.fieldId !== field.id))}>{fieldTypes.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label></div>
      <div className="grid gap-4 sm:grid-cols-2">{tabs.length > 0 && <label className="text-sm">Show in tab<select className={input} value={field.tabId || ""} onChange={e => changeField({tabId: e.target.value})}><option value="" disabled>Choose a tab</option>{tabs.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}<label className="text-sm">Field points<input className={input} type="number" min={1} max={100} value={field.points} onChange={e => changeField({points: Number(e.target.value)})}/></label></div>
      <PbqFieldSettings field={field} answerKey={key} onField={changeField} onKey={changeKey}/>
    </div>}
    <p className="text-xs text-slate-500">Up to 20 fields and 8 tabs per element. Every tab must contain at least one field before publishing.</p>
  </div>;
}
