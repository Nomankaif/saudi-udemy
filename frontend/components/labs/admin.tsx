"use client";
import Link from "next/link";
import { CatalogFilters } from "../admin/catalog-filters";
import { AdminHeading, primaryButton } from "../admin/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Download, ArrowLeft, Trash2, Save } from "lucide-react";
import { CardActions, cardPublishButton, cardOpenButton } from "../admin/card-actions";
import { api, messageOf } from "@/lib/api";
import { Lab, Device, Rule, field, button, primary } from "./types";
import { ConnectionEditor, RuleEditor } from "./network-editor";
import { DeviceEditor } from "./device-editor";
import { NetworkTopology } from "./network-topology";
import { LabDetailsFields, LabWorkflowTabs } from "./lab-details-fields";

type SourceReview = { status?: "PENDING" | "CONFIRMED"; notes?: string[]; sourcePages?: number[]; confirmedAt?: string };
type Row = { _id: string; title: string; category: string; subcategory?: string; status: string; sourceReview?: SourceReview; draft?: { engine?: string; labIds?: string[] }; importSourceNumber?: number };
export function AdminLabs() {
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [publishing, setPublishing] = useState("");
  const [publishError, setPublishError] = useState<{ id: string; title: string; message: string } | null>(null);
  const mutation = useRef(false);
  async function publish(row: Row) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true); setPublishing(row._id); setPublishError(null); setMessage("");
    try {
      const updated = await api<Row>(`/labs/admin/${row._id}/publish`, { method: "POST" });
      setRows(items => items.map(item => item._id === row._id ? { ...item, ...updated } : item));
      setMessage(`"${row.title}" published. New sessions use this version.`);
    } catch (error) { setPublishError({ id: row._id, title: row.title, message: messageOf(error) }); }
    finally { mutation.current = false; setBusy(false); setPublishing(""); }
  }
  const refresh = () => api<Row[]>("/labs/admin/all").then(setRows);
  useEffect(() => { const imported = new URLSearchParams(window.location.search).get("imported"); refresh().then(() => { if (imported && /^\d+$/.test(imported)) setMessage(`${imported} lab${imported === "1" ? "" : "s"} imported as drafts. Review and publish them when ready.`); }).catch(e => setMessage(messageOf(e))).finally(() => setLoaded(true)); }, []);
  async function importLabs(simulation = false) { if (mutation.current) return; mutation.current = true; setBusy(true); try { const result = await api<{ message: string }>(simulation ? "/labs/admin/import-simulations" : "/labs/admin/import", { method: "POST" }); setMessage(result.message); await refresh(); } catch(e) { setMessage(messageOf(e)); } finally { mutation.current = false; setBusy(false); } }
  async function remove(row: Row) {
    if (mutation.current) return;
    if (!window.confirm(`Delete "${row.title}"? It will be archived. Existing student sessions and results will be preserved.`)) return;
    mutation.current = true; setPublishError(null);
    setBusy(true);
    try { await api(`/labs/admin/${row._id}`, { method: "DELETE" }); setRows(items => items.filter(item => item._id !== row._id)); setMessage("Lab archived. Student history is preserved."); }
    catch(e) { setMessage(messageOf(e)); } finally { mutation.current = false; setBusy(false); }
  }
  const filtered = rows.filter(row => row.title.toLowerCase().includes(query.trim().toLowerCase()) && (!statusFilter || row.status === statusFilter));
  return <section className="space-y-6">
    <AdminHeading eyebrow="Lab studio" title="Your labs" description="Create, review and publish networking practice labs." action={<div className="flex flex-wrap gap-3"><Link className={button} href="/admin/labs/import"><Download size={16} />Import PDF or JSON</Link><Link className={button} href="/admin/labs/collections/new">Create lab collection</Link><button className={button} disabled={busy} onClick={() => importLabs(true)}><Download size={16} />Add simulation templates</button><Link className={`${primaryButton} rounded-lg`} href="/admin/labs/new">Create lab</Link></div>} />
    <CatalogFilters kind="labs" query={query} status={statusFilter} onQuery={setQuery} onStatus={setStatusFilter} />
    {message && <p role="status" className="rounded-xl bg-white p-6 text-slate-500">{message}</p>}
    {publishError && <section role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900"><h2 className="font-semibold">Could not publish {publishError.title}</h2><p>{publishError.message}</p><Link className="inline-block font-semibold underline underline-offset-4" href={rows.find(row => row._id === publishError.id)?.draft?.engine === "netsim-series-v1" ? `/admin/labs/collections/${publishError.id}` : `/admin/labs/${publishError.id}`}>Review in lab studio</Link></section>}
    {!loaded && <p className="text-sm text-slate-500">Loading labs…</p>}
    {loaded && !filtered.length && <p className="rounded-xl bg-white p-6 text-sm text-slate-500">{rows.length ? "No labs match your filters." : "Create a lab or import the CCNA templates to begin."}</p>}
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map(row => <article key={row._id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase text-violet-600">{row.category}{row.subcategory ? ` / ${row.subcategory}` : ""}</span><div className="flex shrink-0 items-center gap-1"><span className={`rounded-full px-3 py-1 text-xs font-bold ${row.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{row.status}</span><CardActions title={row.title} updateHref={row.draft?.engine === "netsim-series-v1" ? `/admin/labs/collections/${row._id}` : `/admin/labs/${row._id}`} disabled={busy} onDelete={() => void remove(row)} /></div></div>
      <h2 className="mt-5 text-xl font-bold">{row.title}</h2>
      <p className="mb-6 mt-2 text-sm leading-6 text-slate-500">{row.draft?.engine === "netsim-series-v1" ? `${row.draft.labIds?.length || 0} questions in one session.` : row.sourceReview?.status === "PENDING" ? "Draft · Source review required before publishing." : row.status === "PUBLISHED" ? "Published and available to students." : "Draft — not yet visible to students."}</p>
      <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
        <Link href={row.draft?.engine === "netsim-series-v1" ? `/admin/labs/collections/${row._id}` : `/admin/labs/${row._id}`} aria-label={`Open ${row.title}`} className={cardOpenButton}>Open</Link>
        <button type="button" className={cardPublishButton} disabled={busy || row.sourceReview?.status === "PENDING"} aria-label={`Publish ${row.title}`} aria-busy={publishing === row._id} onClick={() => void publish(row)}>{publishing === row._id ? "Publishing…" : "Publish"}</button>
      </div>
    </article>)}</div>
    <p className="text-xs text-slate-500">Imported templates remain drafts until reviewed and published. Existing templates are not overwritten.</p>
    <details className="text-sm text-slate-500"><summary className="cursor-pointer">Classic configuration labs</summary><p className="my-3 text-xs">The original templates use the classic command simulator, without the new physical network engine.</p><button className={button} disabled={busy} onClick={() => importLabs(false)}>Import classic templates</button></details>
  </section>;
}

type EditableTask = { text: string; device: string; hint: string; checks: string; rules?: Rule[]; points?: number };
const empty: Lab = { engine: "netsim-v1", links: [], _id: "", title: "", category: "", instructions: "", topology: "", devices: [{ name: "R1", type: "router", interfaces: { "Ethernet0/0": { ip: "10.0.0.1/24", status: "up" } } }], tasks: [], access: "FREE", durationMinutes: 60 };
export function LabEditor({ id }: { id: string }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState<Lab>(empty);
  const [savedClassification, setSavedClassification] = useState({ category: "", subcategory: "" });
  const [devices, setDevices] = useState(JSON.stringify(empty.devices, null, 2));
  const [tasks, setTasks] = useState<EditableTask[]>([{ text: "", device: "R1", hint: "", checks: "", rules: [], points: 10 }]);
  const [tab, setTab] = useState("Details");
  const [status, setStatus] = useState("DRAFT");
  const [sourceReview, setSourceReview] = useState<SourceReview | null>(null);
  const [sourceChecked, setSourceChecked] = useState(false);
  const [exams, setExams] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(id === "new");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    api<Row[]>("/exams/admin/all").then(items => setExams(items.filter(e => e.status === "PUBLISHED"))).catch(e => setMessage(messageOf(e)));
    if (id !== "new") api<{ draft: Lab; status: string; sourceReview?: SourceReview }>(`/labs/admin/${id}`).then(lab => { setDraft(lab.draft); setSourceReview(lab.sourceReview || null); setSavedClassification({ category: lab.draft.category, subcategory: lab.draft.subcategory || "" }); setDevices(JSON.stringify(lab.draft.devices, null, 2)); setTasks(lab.draft.tasks.map(t => ({ text: t.text, device: t.device, hint: t.hint || "", rules: t.rules || [], points: t.points ?? 10, checks: (t.check || []).map(row => row.join(" | ")).join("\n") }))); setStatus(lab.status); setReady(true); }).catch(e => setMessage(messageOf(e)));
  }, [id]);
  async function uploadCover(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage("Choose a JPG, PNG, or WebP image up to 5 MB."); return; }
    setUploading(true); setMessage("");
    try {
      const body = new FormData(); body.append("file", file);
      const result = await api<{ url: string }>("/media/covers", { method: "POST", body });
      setDraft(d => ({ ...d, imageUrl: result.url }));
    } catch (e) { setMessage(messageOf(e)); } finally { setUploading(false); }
  }
  const network = draft.engine === "netsim-v1";
  let parsedDevices: Device[] = [];
  try { const parsed = JSON.parse(devices); if (Array.isArray(parsed)) parsedDevices = parsed; } catch {}
  const update = (key: keyof Lab, value: string | number) => setDraft(d => ({ ...d, [key]: value }));
  function taskChange(index: number, key: keyof EditableTask, value: string | number | Rule[]) { setTasks(rows => rows.map((t, i) => i === index ? { ...t, [key]: value } : t)); }
  async function save(publish = false, preview = false, verify = false) {
    if (uploading) return;
    if (!draft.category) { setMessage("Select a category."); setTab("Details"); return; }
    setBusy(true); setMessage("");
    try {
      let parsedDevices;
      try { parsedDevices = JSON.parse(devices); } catch { throw new Error("Devices: enter valid JSON before saving."); }
      const definition = { ...draft, devices: parsedDevices, tasks: tasks.map((t, i) => ({ id: i + 1, text: t.text, device: t.device, hint: t.hint, rules: t.rules || [], points: t.points ?? 10, check: t.checks.split("\n").filter(s => s.trim()).map(s => s.split("|").map(v => v.trim())) })) };
      const lab = await api<{ _id: string; status: string; category: string; subcategory?: string; sourceReview?: SourceReview }>(`/labs/admin${id === "new" ? "" : `/${id}`}`, { method: id === "new" ? "POST" : "PUT", body: JSON.stringify(definition) });
      setSavedClassification({ category: lab.category, subcategory: lab.subcategory || "" });
      setSourceReview(lab.sourceReview || null);
      setSourceChecked(false);
      if (verify) { const report = await api<{ valid: boolean; score: number; errors: string[] }>(`/labs/admin/${lab._id}/validate`, { method: "POST" }); setMessage(report.valid ? "Reference solutions verified: all tasks pass." : `Reference solutions scored ${report.score}%. ${report.errors.join(" ") || "Review the reference commands and any additional outcome checks."}`); if (id === "new") router.replace(`/admin/labs/${lab._id}`); return; }
      if (publish) { await api(`/labs/admin/${lab._id}/publish`, { method: "POST" }); setStatus("PUBLISHED"); }
      setMessage(publish ? "Lab published. New sessions use this version." : "Draft saved. Publish to make changes available to students.");
      if (preview) { const session = await api<{ _id: string }>(`/labs/admin/${lab._id}/preview`, { method: "POST" }); router.push(`/labs/session/${session._id}`); return; }
      if (id === "new") router.replace(`/admin/labs/${lab._id}`);
    } catch(e) { setMessage(messageOf(e)); } finally { setBusy(false); }
  }
  async function unpublish() { setBusy(true); try { await api(`/labs/admin/${id}/unpublish`, { method: "POST" }); setStatus("DRAFT"); setMessage("Lab unpublished. Existing attempts are retained."); } catch(e) { setMessage(messageOf(e)); } finally { setBusy(false); } }
  async function confirmSource() {
    if (!sourceChecked) return;
    setBusy(true); setMessage("");
    try {
      const lab = await api<{ sourceReview: SourceReview }>(`/labs/admin/${id}/confirm-source`, { method: "POST", body: JSON.stringify({ confirmed: true }) });
      setSourceReview(lab.sourceReview);
      setSourceChecked(false);
      setMessage("Source review confirmed and reference solution verified. This draft can now be published.");
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }
  async function archive() { setBusy(true); try { await api(`/labs/admin/${id}`, { method: "DELETE" }); router.push("/admin/labs"); } catch(e) { setMessage(messageOf(e)); setBusy(false); } }
  return <section className="mx-auto max-w-5xl"><Link className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-600" href="/admin/labs"><ArrowLeft size={16} />Labs</Link><div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div className="space-y-2"><h1 className="text-2xl font-bold tracking-tight">{id === "new" ? "Create lab" : draft.title || "Lab settings"}</h1><p className="text-xs text-slate-500">{status === "PUBLISHED" ? "Published · Changes are saved separately until republished" : "Draft · Not visible to students"}</p></div><div className="flex flex-wrap gap-3">{draft.engine === "netsim-v1" && <button className={button} disabled={!ready || busy || uploading} onClick={() => save(false, false, true)}>Verify solutions</button>}<button className={button} disabled={!ready || busy || uploading} onClick={() => save(false, true)}>Save and preview</button><button className={button} disabled={!ready || busy || uploading} onClick={() => save()}><Save size={16} />Save draft</button><button className={primary} disabled={!ready || busy || uploading || sourceReview?.status === "PENDING"} onClick={() => save(true)}>Save and publish</button></div></div>{message && <p role="status" className="mb-5 rounded-md border border-slate-300 bg-white p-4 text-sm">{message}</p>}
    {ready && <p className="mb-5 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">{network ? "Network simulation · Explicit connections · Routers, switches and PCs · Server-side assessment" : "Classic CLI lab · Existing lab and session behaviour is preserved"}</p>}
    {ready && sourceReview?.status === "PENDING" && <section className="mb-5 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-bold">Source review required before publishing</h2><p>Compare the diagram, starting state, tasks, and expected answers with the original source{sourceReview.sourcePages?.length ? ` (pages ${sourceReview.sourcePages.join(", ")})` : ""}. The simulator will also check the reference solution when you confirm.</p>{Boolean(sourceReview.notes?.length) && <ul className="list-disc space-y-1 pl-5">{sourceReview.notes?.map((note, index) => <li key={index}>{note}</li>)}</ul>}<label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1" checked={sourceChecked} onChange={event => setSourceChecked(event.target.checked)} />I compared this lab with the source and resolved these notes.</label><button type="button" className={button} disabled={!sourceChecked || busy} onClick={() => void confirmSource()}>Confirm source review</button></section>}
    {ready && <details className="mb-5 rounded-md border border-slate-200 bg-white p-4" open={Boolean(draft.authorNotes)}><summary className="cursor-pointer text-sm font-medium">Author review notes <span className="font-normal text-slate-500">· Not shown to students</span></summary><label className="mt-3 block text-sm text-slate-600">Source references, corrections and assumptions<textarea className={`${field} mt-2 min-h-24`} value={draft.authorNotes || ""} onChange={e => update("authorNotes", e.target.value)} /></label></details>}
    {ready && <div className="rounded-lg border border-slate-200 bg-white"><LabWorkflowTabs steps={["Details", "Devices & topology", "Tasks & grading"]} active={tab} onChange={setTab} /><div className="space-y-6 p-6">
      {tab === "Details" && <LabDetailsFields value={draft} onChange={changes => setDraft(current => ({ ...current, ...changes }))} onUploadCover={file => void uploadCover(file)} uploading={uploading} busy={busy} exams={exams} allowUnassigned={id !== "new" && !savedClassification.subcategory && draft.category === savedClassification.category} />}
      {tab === "Devices & topology" && <><div className="space-y-2"><h2 className="font-semibold">Initial device configuration</h2><p className="text-sm leading-6 text-slate-500">Add devices, assign initial addresses and connect their ports. Device names and interfaces referenced by links or grading rules must remain consistent.</p></div>{network && <NetworkTopology devices={parsedDevices} links={draft.links || []} />}<DeviceEditor value={devices} onChange={setDevices} network={network} />{network && <ConnectionEditor devices={parsedDevices} links={draft.links || []} onChange={links => setDraft(d => ({ ...d, links }))} />}<details className="rounded-md border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">Advanced device JSON</summary><label className="mt-4 block space-y-2 text-sm font-medium">Devices (JSON)<textarea spellCheck={false} className={`${field} min-h-80 font-mono text-xs leading-6`} value={devices} onChange={e => setDevices(e.target.value)} /></label></details><label className="block space-y-2 text-sm font-medium">Topology notes<textarea spellCheck={false} className={`${field} min-h-48 font-mono text-xs`} value={draft.topology} onChange={e => update("topology", e.target.value)} /></label><p className="text-xs text-slate-500">{network ? "The diagram uses your physical connections, independent of IP addressing. Publish validates initial commands before students can start." : "The classic diagram is inferred from device addressing."}</p></>}
      {tab === "Tasks & grading" && <><p className="text-sm leading-6 text-slate-500">{network ? "Write the task and a complete reference solution. The simulator compares the settings changed by that solution with the student's final configuration. Add optional checks for outcomes such as connectivity or neighbor status. Solutions remain hidden during assessments." : "Each task is checked on its selected device. Separate required command tokens with |. Review imported checks carefully."}</p>{tasks.map((t, i) => <section key={i} className="space-y-4 rounded-md border border-slate-200 p-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Task {i + 1}</h3><button className="p-2 text-slate-400 hover:text-red-700" aria-label={`Remove task ${i + 1}`} onClick={() => setTasks(rows => rows.filter((_, n) => n !== i))}><Trash2 size={16} /></button></div><label className="block space-y-2 text-sm font-medium">Device name<select className={`${field} max-w-xs`} value={t.device} onChange={e => taskChange(i, "device", e.target.value)}><option value="">Select device</option>{parsedDevices.map(d => <option key={d.name}>{d.name}</option>)}</select></label><label className="block space-y-2 text-sm font-medium">Task instructions<textarea className={`${field} min-h-24`} value={t.text} onChange={e => taskChange(i, "text", e.target.value)} /></label><label className="block space-y-2 text-sm font-medium">Reference solution<textarea spellCheck={false} className={`${field} min-h-28 font-mono text-xs`} value={t.hint} onChange={e => taskChange(i, "hint", e.target.value)} /></label>{network ? <><label className="block text-sm font-medium">Points<input className={`${field} mt-2 max-w-32`} type="number" min={1} max={100} value={t.points ?? 10} onChange={e => taskChange(i, "points", Number(e.target.value))} /></label><details className="rounded-lg border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">Additional outcome checks ({t.rules?.length || 0})</summary><p className="mt-2 text-xs leading-5 text-slate-500">Use these for results that configuration alone cannot verify, such as a successful ping, OSPF neighbor, LACP negotiation or saved configuration.</p><div className="mt-4"><RuleEditor device={parsedDevices.find(d => d.name === t.device)} rules={t.rules || []} onChange={r => taskChange(i, "rules", r)} /></div></details></> : <label className="block space-y-2 text-sm font-medium">Command checks<textarea spellCheck={false} className={`${field} min-h-24 font-mono text-xs`} placeholder="ip route | 192.168.1.0 | 255.255.255.0 | 10.0.0.2" value={t.checks} onChange={e => taskChange(i, "checks", e.target.value)} /></label>}</section>)}<button className={button} onClick={() => setTasks(t => [...t, { text: "", device: parsedDevices[0]?.name || "", hint: "", checks: "", points: 10, rules: [] }])}><Plus size={16} />Add task</button></>}
    </div></div>}
    {id !== "new" && <div className="mt-6 flex items-center justify-between">{status === "PUBLISHED" ? <button className={button} disabled={busy} onClick={unpublish}>Unpublish lab</button> : <span className="text-xs text-slate-500">Only published labs appear in the catalogue.</span>}<button className="text-sm font-medium text-red-700" disabled={busy} onClick={() => setConfirm(true)}>Archive lab</button></div>}
    {confirm && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/40 p-5" role="dialog" aria-modal="true" aria-labelledby="archive-lab"><div className="max-w-md rounded-lg bg-white p-6"><h2 id="archive-lab" className="text-lg font-semibold">Archive this lab?</h2><p className="mt-3 text-sm text-slate-600">The lab will be removed from the catalogue. Existing attempts and results will be retained.</p><div className="mt-6 flex justify-end gap-3"><button className={button} onClick={() => setConfirm(false)}>Cancel</button><button className={primary} disabled={busy} onClick={archive}>Archive lab</button></div></div></div>}
  </section>;
}
