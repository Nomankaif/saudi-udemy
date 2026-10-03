"use client";
import Image from "next/image";
import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { Question, PbqArea, PbqKey } from "@/lib/types";
import { api, messageOf } from "@/lib/api";
import { inputClass, secondaryButton } from "./ui";
import { hotspotBounds } from "@/lib/pbq-hotspots";
import { pbqFields, isTextField } from "@/lib/pbq-fields";
import { PbqFormEditor, PbqFieldSettings } from "./pbq-form-editor";
import { PbqImageCleaner } from "./pbq-image-cleaner";

export function pbqIssues(q: Question) {
  const issues: string[] = [], areas = q.pbq?.areas || [], fields = pbqFields(q.pbq);
  if (!q.imageUrl) issues.push("Upload a PBQ diagram.");
  if (!q.pbq?.alt.trim()) issues.push("Add a diagram description.");
  if (!fields.length) issues.push("Add at least one scored answer field.");
  if (fields.length > 200) issues.push("Use at most 200 answer fields in this question.");
  areas.forEach((a, i) => {
    const name = `Area ${i + 1}${a.label ? ` (${a.label})` : ""}`;
    if (!a.label.trim()) issues.push(`${name}: enter an element name, such as R1 or Firewall.`);
    if (![a.width ?? 8, a.height ?? 14].every(n => Number.isFinite(n) && n >= 1 && n <= 100)) issues.push(`${name}: clickable width and height must be 1–100%.`);
    if (a.kind === "evidence" && !a.evidence.trim()) issues.push(`${name}: add supporting evidence.`);
    if (a.kind === "form") {
      if (!a.fields?.length || a.fields.length > 20) issues.push(`${name}: add 1–20 form fields.`);
      const tabs = a.tabs || [];
      if (tabs.length > 8 || tabs.some(t => !t.label.trim())) issues.push(`${name}: use up to 8 named tabs.`);
      tabs.forEach(t => {if (!a.fields?.some(f => f.tabId === t.id)) issues.push(`${name}: tab "${t.label}" needs a field.`);});
      a.fields?.forEach((f, n) => {
        if (!f.label.trim()) issues.push(`${name}: field ${n + 1} needs a label.`);
        if (tabs.length && !tabs.some(t => t.id === f.tabId)) issues.push(`${name} / ${f.label}: choose a tab.`);
      });
    }
  });
  fields.forEach(({area, field: f, fieldId}) => {
    const name = `${area.label || "Unnamed element"}${fieldId ? " / " + (f.label || "Unnamed field") : ""}`;
    const keys = q.pbqKey?.filter(k => k.areaId === area.id && k.fieldId === fieldId) || [], key = keys[0];
    if (!Number.isInteger(f.points) || f.points < 1 || f.points > 100) issues.push(`${name}: points must be 1–100.`);
    if (keys.length !== 1 || !key?.values.length || key.values.some(v => !v.trim())) issues.push(`${name}: configure the correct answer.`);
    if (key && (key.values.length > 30 || key.values.some(v => v.length > 500))) issues.push(`${name}: use up to 30 accepted responses, each 500 characters or fewer.`);
    if (!isTextField(f.kind) && (f.options.length < 2 || f.options.some(o => !o.text.trim()))) issues.push(`${name}: add at least two non-empty choices.`);
    if (!isTextField(f.kind) && key?.values.some(v => !f.options.some(o => o.id === v))) issues.push(`${name}: reselect the answer after changing choices.`);
    if (!isTextField(f.kind) && f.kind !== "checkbox" && key?.values.length !== 1) issues.push(`${name}: select one correct choice.`);
  });
  return issues;
}

export function PbqEditor({ question: q, onChange, onUploading }: { question: Question; onChange: (q: Question) => void; onUploading: (value: boolean) => void }) {
  const [cleaning, setCleaning] = useState(false);
  const [selected, setSelected] = useState(q.pbq?.areas[0]?.id || ""), [message, setMessage] = useState(""), [uploading, setUploading] = useState(false);
  const definition = q.pbq || { alt: "", areas: [] }, areas = definition.areas;
  const area = areas.find(a => a.id === selected) || areas[0];
  const key = q.pbqKey?.find(k => k.areaId === area?.id) || { areaId: area?.id || "", values: [], explanation: "" };
  function changeArea(patch: Partial<PbqArea>) { if (area) onChange({ ...q, pbq: { ...definition, areas: areas.map(a => a.id === area.id ? { ...a, ...patch } : a) } }); }
  function changeKey(patch: Partial<PbqKey>) { if (area) onChange({ ...q, pbqKey: [...(q.pbqKey || []).filter(k => k.areaId !== area.id), { ...key, ...patch, areaId: area.id }] }); }
  function changeKind(kind: PbqArea["kind"]) {
    if (!area || kind === area.kind) return;
    if (area.kind === "form" && !window.confirm("Replace this configuration form with a single interaction? All its fields, tabs and answer keys will be removed.")) return;
    const otherKeys = (q.pbqKey || []).filter(k => k.areaId !== area.id);
    if (kind === "form") {
      const id = crypto.randomUUID();
      const field = {id, label: area.kind === "evidence" ? "" : "Answer", kind: area.kind === "evidence" || area.kind === "form" ? "text" as const : area.kind, points: Math.max(1, area.points), caseSensitive: area.caseSensitive, evidence: "", options: area.options};
      onChange({...q, pbq: {...definition, areas: areas.map(a => a.id === area.id ? {...a, kind, points: 0, fields: [field], tabs: []} : a)}, pbqKey: [...otherKeys, ...(key.values.length ? [{...key, fieldId: id}] : [])]});
    } else {
      onChange({...q, pbq: {...definition, areas: areas.map(a => a.id === area.id ? {...a, kind, fields: undefined, tabs: undefined, points: kind === "evidence" ? 0 : Math.max(1, a.points)} : a)}, pbqKey: otherKeys});
    }
  }
  function addArea() {
    const id = crypto.randomUUID();
    onChange({ ...q, pbq: { ...definition, areas: [...areas, { id, label: "", kind: "select", x: 50, y: 50, width: 8, height: 14, points: 1, caseSensitive: false, evidence: "", options: [{ id: "choice1", text: "" }, { id: "choice2", text: "" }] }] } });
    setSelected(id);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {setMessage("Choose a PNG, JPG or WebP image up to 5 MB.");return;}
    if (q.imageUrl && areas.length && !window.confirm("Replace this diagram? Existing locations are retained; review their positions on the new image.")) return;
    setUploading(true);onUploading(true);setMessage("");
    try {
      // Decode locally first: reject corrupt files before storing an upload.
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width * bitmap.height <= 25000000;
      bitmap.close();
      if (!valid) throw new Error("Use a diagram up to 25 megapixels.");
      const body = new FormData();body.append("file", file);
      const uploaded = await api<{url: string}>("/media/pbq", {method: "POST", body});
      onChange({...q, imageUrl: uploaded.url});
    } catch (e) {setMessage(messageOf(e));} finally {setUploading(false);onUploading(false);}
  }
  return <div className="space-y-5">
    {cleaning && <PbqImageCleaner imageUrl={q.imageUrl} onClose={() => {setCleaning(false);onUploading(false);}} onApply={url => {onChange({...q,imageUrl:url});setCleaning(false);onUploading(false);setMessage("Cleaned image applied. Review your hotspots, then save the question. Republish the exam when ready.");}}/>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">PBQ diagram & answer areas</h3><p className="mt-1 text-sm text-slate-500">Upload an unanswered diagram. Correct answers belong in the private answer key below.</p></div><label className={`${secondaryButton} cursor-pointer`}><Upload size={16}/>{uploading ? "Uploading…" : q.imageUrl ? "Replace diagram" : "Upload diagram"}<input aria-label="Upload PBQ diagram" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={e => {void upload(e.target.files?.[0]);e.target.value = "";}}/></label></div>
    <p className="text-xs text-slate-500">PNG, JPG or WebP · Up to 5 MB / 25 megapixels. Images are stored on your server, not in the source code.</p>
    {q.imageUrl && <div className="flex flex-wrap items-center gap-3"><button type="button" className={secondaryButton} disabled={uploading} onClick={() => {setCleaning(true);onUploading(true);}}>Erase answer areas</button><p className="text-xs text-slate-500">Remove printed options or checkmarks before adding student answer fields.</p></div>}
    {message && <p role="alert" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">{message}</p>}
    <label className="block text-sm font-medium">Diagram description<textarea className={`${inputClass} mt-2 w-full rounded-md`} maxLength={1000} rows={2} placeholder="Describe the devices, connections and labels needed to understand this diagram." value={definition.alt} onChange={e => onChange({...q, pbq: {...definition, alt: e.target.value}})}/></label>
    {q.imageUrl && <div className="overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="relative cursor-crosshair" onClick={e => {if (!area) return;const rect = e.currentTarget.getBoundingClientRect();changeArea({x: Math.round(Math.min(100, Math.max(0,(e.clientX-rect.left)/rect.width*100))*10)/10, y: Math.round(Math.min(100,Math.max(0,(e.clientY-rect.top)/rect.height*100))*10)/10});}}>
      <Image unoptimized src={q.imageUrl} alt={definition.alt || "Diagram editor"} width={1600} height={1000} className="block h-auto w-full"/>
      {areas.map((a,i) => <button type="button" key={a.id} aria-label={`Edit area ${i+1}: ${a.label}`} aria-pressed={a.id===area?.id} onClick={e=>{e.stopPropagation();setSelected(a.id);}} style={{left:`${hotspotBounds(a).left}%`,top:`${hotspotBounds(a).top}%`,width:`${hotspotBounds(a).width}%`,height:`${hotspotBounds(a).height}%`}} className={`absolute flex items-center justify-center rounded border-2 border-dashed text-xs font-bold ${a.id===area?.id ? "border-violet-700 bg-violet-100/20" : "border-slate-500 bg-white/10"}`}><span className={`flex size-7 items-center justify-center rounded-full ${a.id===area?.id ? "bg-violet-700 text-white" : "bg-slate-900 text-white"}`}>{i+1}</span></button>)}
    </div></div>}
    <div className="flex flex-wrap gap-2">{areas.map((a,i)=><button type="button" key={a.id} onClick={()=>setSelected(a.id)} className={`rounded border px-3 py-2 text-sm ${a.id===area?.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200"}`}>{i+1}. {a.label}</button>)}<button type="button" disabled={areas.length>=40} className={secondaryButton} onClick={addArea}><Plus size={16}/>Add area</button></div>
    {area && <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">Clickable element · Click its centre in the image, then adjust the box size</p><button type="button" aria-label="Delete selected area" className="p-2 text-rose-700" onClick={()=>{if(!window.confirm(`Remove ${area.label} and its answer key?`))return;onChange({...q,pbq:{...definition,areas:areas.filter(a=>a.id!==area.id)},pbqKey:(q.pbqKey||[]).filter(k=>k.areaId!==area.id)});setSelected("");}}><Trash2 size={16}/></button></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Element name<input placeholder="R1, Firewall, PC1, or an IP address" className={`${inputClass} mt-2 w-full rounded-md`} maxLength={200} value={area.label} onChange={e=>changeArea({label:e.target.value})}/></label><label className="text-sm font-medium">Interaction<select className={`${inputClass} mt-2 w-full rounded-md`} value={area.kind} onChange={e=>changeKind(e.target.value as PbqArea["kind"])}><option value="form">Configuration form (multiple fields)</option><option value="select">Dropdown</option><option value="text">Short text answer</option><option value="textarea">Text area (multiple lines)</option><option value="radio">Single choice</option><option value="checkbox">Multiple selections</option><option value="match">Drag / select and place</option><option value="evidence">Evidence only</option></select></label></div>
      <div className="grid grid-cols-3 gap-3">{(["x","y"] as const).map(axis=><label key={axis} className="text-sm">{axis==="x"?"Horizontal":"Vertical"} %<input className={`${inputClass} mt-2 w-full rounded-md`} type="number" min={0} max={100} step={0.1} value={area[axis]} onChange={e=>changeArea({[axis]:Math.max(0,Math.min(100,Number(e.target.value)))})}/></label>)}{area.kind!=="evidence"&&area.kind!=="form"&&<label className="text-sm">Points<input className={`${inputClass} mt-2 w-full rounded-md`} type="number" min={1} max={100} value={area.points} onChange={e=>changeArea({points:Number(e.target.value)})}/></label>}</div>
      <div className="grid gap-3 sm:grid-cols-2">{(["width","height"] as const).map(axis=><label key={axis} className="text-sm">Clickable {axis} %<input className={`${inputClass} mt-2 w-full rounded-md`} type="number" min={1} max={100} step={0.5} value={area[axis] ?? (axis==="width"?8:14)} onChange={e=>changeArea({[axis]:Math.max(1,Math.min(100,Number(e.target.value)))})}/></label>)}</div>
      <p className="text-xs text-slate-500">Fit the dashed box around the device or image element. Numbers and boxes appear only in the editor; students click the element itself. For a question-mark spot, choose the optional marker below.</p>
      <label className="block text-sm font-medium">Student marker<select className={`${inputClass} mt-2 w-full rounded-md`} value={area.marker || "none"} onChange={e=>changeArea({marker:e.target.value as PbqArea["marker"]})}><option value="none">None — click the image element</option><option value="question">Question mark (?)</option></select><span className="mt-2 block text-xs font-normal text-slate-500">For a diagram label: choose Short text answer, then place the clickable box over the label or question mark. If a ? is already printed in the image, leave the marker set to None.</span></label>
      <label className="block text-sm font-medium">{area.kind==="evidence"?"Evidence / logs":"Supporting evidence (optional)"}<textarea className={`${inputClass} mt-2 w-full rounded-md font-mono text-xs`} rows={4} maxLength={20000} placeholder="Shown to students when they select this location. Markdown and code blocks are supported. Do not put the answer here." value={area.evidence} onChange={e=>changeArea({evidence:e.target.value})}/></label>
      {area.kind === "form" ? <PbqFormEditor key={area.id} area={area} keys={(q.pbqKey || []).filter(k => k.areaId === area.id)} onChange={(updated, keys) => onChange({...q, pbq: {...definition, areas: areas.map(a => a.id === area.id ? updated : a)}, pbqKey: [...(q.pbqKey || []).filter(k => k.areaId !== area.id), ...keys]})}/> : <PbqFieldSettings field={area} answerKey={key} onField={changeArea} onKey={changeKey}/>}

    </div>}
    <p className="text-xs text-slate-500">Partial credit is awarded per correct field. Evidence locations carry no points. Preview the diagram and test the answers before publishing.</p>
  </div>;
}
