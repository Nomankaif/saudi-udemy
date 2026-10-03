"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Clock3, RotateCcw, TerminalSquare } from "lucide-react";
import { api, messageOf } from "@/lib/api";
import { Session, Grade, button, primary } from "./types";
import { NetworkTopology } from "./network-topology";

export function LabRunner({ id }: { id: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [device, setDevice] = useState("");
  const [tab, setTab] = useState("Tasks");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Grade | null>(null);
  const [remaining, setRemaining] = useState("");
  const [confirm, setConfirm] = useState<"submit" | "reset" | null>(null);
  const terminal = useRef<HTMLDivElement>(null);
  const commandInput = useRef<HTMLInputElement>(null);
  const historyIndex = useRef(-1);
  useEffect(() => { if (!busy) commandInput.current?.focus(); }, [busy, device, session?.status]);
  useEffect(() => {
    let active = true;
    api<Session>(`/labs/attempts/${id}`).then(s => { if (active) { setSession(s); setDevice(s.lab.devices.find(d => d.console !== false)?.name || ""); } }).catch(e => setError(messageOf(e)));
    return () => { active = false; };
  }, [id]);
  useEffect(() => { terminal.current?.scrollTo({ top: terminal.current.scrollHeight }); }, [session, device]);
  useEffect(() => {
    if (!session?.deadline || session.status !== "ACTIVE") return;
    let refreshing = false;
    const timer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((new Date(session.deadline!).getTime() - Date.now()) / 1000));
      setRemaining(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
      if (!seconds && !refreshing) { refreshing = true; api<Session>(`/labs/attempts/${id}`).then(setSession).catch(e => setError(messageOf(e))).finally(() => { refreshing = false; }); }
    }, 1000);
    return () => clearInterval(timer);
  }, [id, session?.deadline, session?.status]);
  async function action(name: string, body = {}) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (name === "check" || name === "solution") {
        setFeedback(await api<Grade>(`/labs/attempts/${id}/${name}`, { method: "POST", body: "{}" }));
        if (name === "solution") setSession(s => s ? { ...s, solutionViewed: true } : s);
        setTab("Tasks");
      } else {
        setSession(await api<Session>(`/labs/attempts/${id}/${name}`, { method: "POST", body: JSON.stringify(body) }));
        if (name === "command") { setInput(""); historyIndex.current = -1; setFeedback(null); }
        if (name === "reset") setFeedback(null);
      }
    } catch(e) { setError(messageOf(e)); }
    finally { setBusy(false); setConfirm(null); commandInput.current?.focus(); }
  }
  async function complete() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api<{ matches: { word: string }[]; partial: string }>(`/labs/attempts/${id}/complete`, { method: "POST", body: JSON.stringify({ device, input }) });
      const matches = result.matches.filter(m => /^[a-z][a-z0-9-]*$/i.test(m.word));
      if (matches.length === 1) setInput(input.slice(0, input.length - result.partial.length) + matches[0]!.word + " ");
    } catch(e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  if (!session) return <div className="p-10 text-sm text-slate-600">{error || "Opening lab session…"}<Link className="ml-4 underline" href="/labs">Back to labs</Link></div>;
  const network = session.lab.engine === "netsim-v1";
  const editableDevices = session.lab.devices.filter(d => d.console !== false);
  const finished = session.status === "SUBMITTED";
  const results = finished ? session.result : feedback;
  const commands = session.transcript.filter(t => t.device === device);
  return <div className="min-h-screen bg-slate-100 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4"><div className="flex items-center gap-4"><Link aria-label="Back to labs" className="rounded-md border border-slate-200 p-2" href="/labs"><ArrowLeft size={18} /></Link><div className="min-w-0"><h1 className="text-lg font-semibold">{session.lab.title}</h1><p className="mt-1 text-xs text-slate-500">{finished ? "Session completed" : session.mode === "PRACTICE" ? "Practice session" : "Timed assessment"} · {network ? "CCNA network simulation" : "Guided IOS simulator"}</p></div></div><div className="flex items-center gap-5"><span className="flex items-center gap-2 font-mono text-sm"><Clock3 size={16} />{finished ? "Submitted" : session.deadline ? remaining || "Timed" : "Untimed"}</span>{!finished && <button className={primary} disabled={busy} onClick={() => setConfirm("submit")}>Submit lab</button>}</div></header>
    <main className="mx-auto max-w-[1600px] p-4 lg:p-6">
      <p className="mb-4 text-xs text-slate-500">{network ? "Simulated network · Not actual Cisco IOS. Use PCs for ping and traceroute. Enter one command at a time; ? shows available commands." : "Configuration practice only. Ping and routing outputs are simplified simulations, not live network tests."}</p>
      {error && <div role="alert" className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button className="ml-3 underline" onClick={() => api<Session>(`/labs/attempts/${id}`).then(setSession).then(() => setError("")).catch(e => setError(messageOf(e)))}>Refresh session</button></div>}
      {finished && results && <div className="mb-5 flex flex-wrap items-center justify-between gap-5 rounded-lg border border-slate-200 bg-white p-6"><div className="flex items-center gap-6"><strong className="text-4xl tracking-tight">{results.score}%</strong><div className="text-sm"><p className="font-semibold">{results.correct} of {results.total} tasks completed</p><p className="mt-1 text-slate-500">{session.solutionViewed ? "Practice completed with solutions viewed" : "Review the task checks and reference commands below."}</p></div></div><Link className={button} href="/labs">Choose another lab</Link></div>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(350px,0.9fr)_minmax(0,1.3fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><nav className="flex border-b border-slate-200" aria-label="Lab information">{["Tasks", "Topology", "Instructions"].map(t => <button key={t} className={`border-b-2 px-5 py-4 text-sm font-semibold ${tab === t ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500"}`} onClick={() => setTab(t)}>{t}</button>)}</nav>
          <div className="max-h-[45vh] overflow-auto p-5 lg:max-h-[75vh]">
            {tab === "Instructions" && <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">{session.lab.instructions || "Complete each task using the device console. Use ? for command help and Tab for completion."}</p>}
            {tab === "Topology" && <div className="space-y-5">{network && <NetworkTopology devices={session.lab.devices} links={session.lab.links || []} active={device} onSelect={name => { setDevice(name); setInput(""); historyIndex.current = -1; }} />}{!network && session.lab.diagram && /* SVG is rendered as an inert image, never injected into the page DOM. */ <Image unoptimized width={580} height={420} className="w-full rounded-md border border-slate-100" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(session.lab.diagram)}`} alt="Network topology generated from configured devices and subnets" />}<p className="text-xs text-slate-500">{network ? "Physical connections defined by the lab author. Console access is available only for editable devices." : "Diagram inferred from initial addressing. Refer to the topology notes for task-specific connections."}</p><pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs leading-6">{session.lab.topology}</pre>{session.lab.devices.map(d => <div key={d.name} className="border-t border-slate-100 pt-3"><h3 className="text-sm font-semibold">{d.name}</h3>{Object.entries(d.interfaces).map(([name, info]) => <p key={name} className="mt-1 font-mono text-xs text-slate-500">{name} · {info.ip || "Unassigned"} · {info.status}</p>)}</div>)}</div>}
            {tab === "Tasks" && <ol className="space-y-5">{session.lab.tasks.map(task => { const check = results?.tasks.find(t => t.id === task.id); return <li key={task.id} className="border-b border-slate-100 pb-5 last:border-0"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">TASK {task.id} · {task.device}{task.points ? ` · ${task.points} points` : ""}</span>{check && <span className={`text-xs font-semibold ${check.passed ? "text-emerald-700" : "text-amber-700"}`}>{check.passed ? "Complete" : "Not complete"}</span>}</div><p className="text-sm leading-6">{task.text}</p>{check?.solution && <details className="mt-3 rounded-md bg-slate-50 p-3"><summary className="cursor-pointer text-xs font-semibold">Reference commands</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6">{check.solution}</pre></details>}</li>; })}</ol>}
          </div>
        </section>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 px-3 py-3"><TerminalSquare size={18} className="mx-2 shrink-0 text-slate-400" />{editableDevices.map(d => <button key={d.name} className={`rounded-md px-4 py-2 font-mono text-sm ${device === d.name ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`} onClick={() => { setDevice(d.name); setInput(""); historyIndex.current = -1; }}>{d.name}</button>)}</div>
          <div onClick={() => { if (!window.getSelection()?.toString()) commandInput.current?.focus(); }} className="cursor-text bg-[#101820] p-5 font-mono text-sm text-slate-200"><div ref={terminal} className="h-[45vh] min-h-[220px] max-h-[480px] overflow-auto whitespace-pre-wrap break-words leading-6"><p className="mb-5 text-slate-400">{device} console. Type ? for help.</p>{commands.map((line, index) => <div key={index} className="mb-2"><p className="text-white">{line.input}</p><p className="text-slate-300">{line.output}</p></div>)}</div>{!finished && <form className="mt-3 flex items-center gap-2 border-t border-slate-700 pt-4" onSubmit={e => { e.preventDefault(); if (!busy && input.trim()) void action("command", { device, command: input }); }}><label className="shrink-0 text-emerald-300" htmlFor="cli-command">{session.prompts[device]}</label><input ref={commandInput} id="cli-command" aria-label="Device command" placeholder="Type a command…" className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-900/40 px-3 py-2 text-white caret-emerald-300 outline-none placeholder:text-slate-500 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 disabled:opacity-50" autoComplete="off" spellCheck={false} maxLength={1000} disabled={busy || !device} value={input} onPaste={e => { if (/[\r\n]/.test(e.clipboardData.getData("text"))) { e.preventDefault(); setError("Enter commands one at a time. Press Enter after each command."); } }} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); void complete(); } if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); historyIndex.current = Math.max(-1, Math.min(commands.length - 1, historyIndex.current + (e.key === "ArrowUp" ? 1 : -1))); setInput(historyIndex.current < 0 ? "" : commands[commands.length - 1 - historyIndex.current]!.input.replace(/^\S+\s/, "")); } }} /><button type="submit" disabled={busy || !input.trim()} className="rounded border border-slate-600 px-3 py-1 text-xs disabled:opacity-40">Run</button></form>}</div>
          <div className="flex flex-wrap items-center gap-3 p-4">{!finished && session.mode === "PRACTICE" && <><button className={primary} disabled={busy} onClick={() => action("check")}><Check size={16} />Check tasks</button><button className={button} disabled={busy} onClick={() => action("solution")}>View solutions</button><button aria-label="Reset practice session" className={button} disabled={busy} onClick={() => setConfirm("reset")}><RotateCcw size={16} />Reset</button></>}{session.mode === "EXAM" && !finished && <span className="text-xs text-slate-500">Assessment mode · Checks and solutions unlock after submission</span>}<span className="ml-auto text-xs text-slate-500" role="status">{busy ? "Working…" : "Progress saved on server"}</span></div>
        </section>
      </div>
    </main>
    {confirm && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5" role="dialog" aria-modal="true" aria-labelledby="confirm-lab"><div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"><h2 id="confirm-lab" className="text-lg font-semibold">{confirm === "submit" ? "Submit this lab?" : "Reset the configuration?"}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{confirm === "submit" ? "Your current configuration will be graded. You cannot change this attempt after submission." : "All device changes in this practice session will be cleared. Solution-viewing status is retained."}</p><div className="mt-6 flex justify-end gap-3"><button className={button} disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button className={primary} disabled={busy} onClick={() => action(confirm)}>{confirm === "submit" ? "Submit lab" : "Reset lab"}</button></div></div></div>}
  </div>;
}
