"use client";
import { Plus, Trash2 } from "lucide-react";
import { Device, field, button } from "./types";

export function DeviceEditor({ value, onChange, network = false }: { value: string; onChange: (value: string) => void; network?: boolean }) {
  let devices: Device[];
  try { devices = JSON.parse(value); if (!Array.isArray(devices) || devices.some(d => !d?.interfaces || typeof d.interfaces !== "object" || Object.values(d.interfaces).some(v => !v || typeof v !== "object"))) throw new Error(); }
  catch { return <p role="alert" className="text-sm text-red-700">Correct the device JSON below to use the editor.</p>; }
  const save = (next: Device[]) => onChange(JSON.stringify(next, null, 2));
  const update = (index: number, next: Device) => save(devices.map((d, i) => i === index ? next : d));
  function add(type: string) {
    const prefix = type === "host" ? "PC" : type === "switch" ? "SW" : "R";
    let number = 1; while (devices.some(d => d.name === prefix + number)) number++;
    const names = type === "host" ? ["eth0"] : type === "switch" ? ["FastEthernet0/1", "FastEthernet0/2"] : ["GigabitEthernet0/0", "GigabitEthernet0/1"];
    save([...devices, { name: prefix + number, type, interfaces: Object.fromEntries(names.map(n => [n, { status: "up" }])) }]);
  }
  return <div className="space-y-4">{devices.map((d, index) => <section key={index} className="space-y-4 rounded-lg border border-slate-200 p-5">
    <div className="flex items-end gap-3"><label className="min-w-0 flex-1 text-sm font-medium">Device name<input className={field + " mt-2"} value={d.name} onChange={e => update(index, { ...d, name: e.target.value })} /></label><div className="flex-1 pb-3 text-sm text-slate-500">{d.type === "host" ? "PC / host" : d.type === "switch" ? "Switch" : "Router"}</div><button type="button" aria-label={"Remove " + d.name} className="p-3 text-slate-400 hover:text-red-700" onClick={() => save(devices.filter((_, i) => i !== index))}><Trash2 size={16} /></button></div>
    {Object.entries(d.interfaces).map(([name, info], n) => <div key={n} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="text-xs text-slate-500">Interface<input disabled={d.type === "host"} className={field + " mt-1"} value={name} onChange={e => { if (e.target.value !== name && Object.hasOwn(d.interfaces, e.target.value)) return; update(index, { ...d, interfaces: Object.fromEntries(Object.entries(d.interfaces).map(([key, val]) => [key === name ? e.target.value : key, val])) }); }} /></label>
      <label className="text-xs text-slate-500">IPv4 / prefix<input className={field + " mt-1"} placeholder="Unassigned" value={info.ip || ""} onChange={e => update(index, { ...d, interfaces: { ...d.interfaces, [name]: { ...info, ip: e.target.value } } })} /></label>
      <label className="text-xs text-slate-500">Initial status<select className={field + " mt-1"} value={info.status} onChange={e => update(index, { ...d, interfaces: { ...d.interfaces, [name]: { ...info, status: e.target.value } } })}><option value="up">Enabled</option><option value="administratively down">Shutdown</option><option value="down">Down</option></select></label>
      <button type="button" disabled={d.type === "host"} aria-label={"Remove " + d.name + " " + name} className="p-3 text-slate-400 disabled:opacity-30" onClick={() => update(index, { ...d, interfaces: Object.fromEntries(Object.entries(d.interfaces).filter(([key]) => key !== name)) })}><Trash2 size={14} /></button>
    </div>)}
    {d.type !== "host" && <button type="button" className="text-xs font-semibold" onClick={() => { let n = Object.keys(d.interfaces).length; while (Object.hasOwn(d.interfaces, "GigabitEthernet0/" + n)) n++; update(index, { ...d, interfaces: { ...d.interfaces, ["GigabitEthernet0/" + n]: { status: "up" } } }); }}>+ Add interface</button>}
    {network && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.console !== false} onChange={e => update(index, { ...d, console: e.target.checked })} />Allow student console access</label>{d.type === "host" && <label className="block text-sm">Default gateway<input className={field + " mt-2 max-w-xs"} value={d.gateway || ""} onChange={e => update(index, { ...d, gateway: e.target.value })} /></label>}<details><summary className="cursor-pointer text-sm text-slate-600">Preconfigured commands</summary><p className="my-2 text-xs text-slate-500">Optional commands applied before the session starts. Include enable and configure terminal when needed. These are not the reference solution.</p><textarea aria-label={d.name + " initial commands"} className={field + " min-h-32 font-mono text-xs"} value={d.initialConfig || ""} onChange={e => update(index, { ...d, initialConfig: e.target.value })} /></details></>}
  </section>)}<div className="flex flex-wrap gap-3">{(network ? ["router", "switch", "host"] : ["router", "switch"]).map(t => <button type="button" key={t} className={button} disabled={devices.length >= 12} onClick={() => add(t)}><Plus size={15} />Add {t === "host" ? "PC" : t}</button>)}</div></div>;
}
