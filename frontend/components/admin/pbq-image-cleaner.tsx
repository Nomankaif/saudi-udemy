"use client";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { api, messageOf } from "@/lib/api";
import { eraseRect, imagePoint, paintCleanImage, validEraseRect, type EraseRect, type ImagePoint } from "@/lib/pbq-image-cleanup";

const button = "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40";
export function PbqImageCleaner({ imageUrl, onApply, onClose }: {
  imageUrl: string; onApply: (url: string) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const bitmap = useRef<ImageBitmap | null>(null), start = useRef<ImagePoint | null>(null);
  const active = useRef(true);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [rectangles, setRectangles] = useState<EraseRect[]>([]);
  const [selection, setSelection] = useState<EraseRect | null>(null);
  const [manual, setManual] = useState<EraseRect>({ x: 0, y: 0, width: 50, height: 30 });
  const [zoom, setZoom] = useState(100), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const modal = dialog.current;
    modal?.showModal();
    return () => modal?.close();
  }, []);
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    let disposed = false, source: ImageBitmap | null = null;
    async function load() {
      try {
        // Only our uploaded files are read; no cross-origin image proxy or tainted canvas.
        if (!/^\/uploads\/media\/[a-zA-Z0-9_-]+\.(png|jpe?g|webp)$/i.test(imageUrl))
          throw new Error("Upload this diagram first, then use Erase answer areas.");
        const response = await fetch(imageUrl, { signal: abort.signal });
        if (!response.ok) throw new Error("Could not load the diagram. Close this window and try again.");
        const blob = await response.blob();
        if (blob.size > 5 * 1024 * 1024) throw new Error("Use an image up to 5 MB.");
        source = await createImageBitmap(blob);
        if (disposed) { source.close(); return; }
        if (!source.width || !source.height || source.width * source.height > 25000000) throw new Error("Use a diagram up to 25 megapixels.");
        bitmap.current = source;
        setSize({ width: source.width, height: source.height });
      } catch (e) { if (!disposed) setError(messageOf(e)); }
    }
    void load();
    return () => { disposed = true; active.current = false; abort.abort(); source?.close(); bitmap.current = null; };
  }, [imageUrl]);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !bitmap.current || !size.width) return;
    paintCleanImage(context, bitmap.current, size.width, size.height, [...rectangles, ...(selection && selection.width && selection.height ? [selection] : [])]);
    if (selection) {
      context.strokeStyle = "#7c3aed";
      context.lineWidth = Math.max(1, size.width / 800);
      context.strokeRect(selection.x, selection.y, selection.width, selection.height);
    }
  }, [size, rectangles, selection]);
  function point(e: PointerEvent<HTMLCanvasElement>) {
    return imagePoint({ x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect(), size);
  }
  function add(rect: EraseRect) {
    if (!validEraseRect(rect, size)) { setError("Enter a rectangle that fits inside the image, with a positive width and height."); return; }
    if (rectangles.length >= 100) { setError("You can erase up to 100 rectangles at a time."); return; }
    setRectangles(old => [...old, rect]); setError("");
  }
  function cancel() { if (!busy) onClose(); }
  async function apply() {
    if (!bitmap.current || busy || !rectangles.length || selection) return;
    setBusy(true); setError("");
    try {
      // Export only flattened pixels, never the selection border, source URL or edit history.
      const output = document.createElement("canvas");
      output.width = size.width; output.height = size.height;
      const context = output.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare the cleaned image.");
      paintCleanImage(context, bitmap.current, size.width, size.height, rectangles);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error("Could not export the image.")), "image/png"));
      if (blob.size > 5 * 1024 * 1024) throw new Error("The cleaned PNG exceeds 5 MB. Resize the original image and try again.");
      const body = new FormData(); body.append("file", blob, "pbq-cleaned.png");
      const uploaded = await api<{ url: string }>("/media/pbq", { method: "POST", body });
      if (active.current) onApply(uploaded.url);
    } catch (e) { if (active.current) { setError(messageOf(e)); setBusy(false); } }
  }
  return createPortal(<dialog ref={dialog} aria-labelledby="pbq-cleaner-title" onCancel={e => { e.preventDefault(); cancel(); }}
    className="fixed inset-0 m-auto max-h-[94vh] w-[min(1100px,96vw)] max-w-none overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 open:flex open:flex-col">
    <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5">
      <div><h2 id="pbq-cleaner-title" className="text-lg font-semibold">Erase printed answers</h2>
        <p className="mt-1 text-sm text-slate-600">Drag over the options or checkmarks to replace them with white. Keep device names, addresses and connections.</p></div>
      <button type="button" className={button} disabled={busy} onClick={cancel}>Cancel</button>
    </header>
    <div className="min-h-0 space-y-4 overflow-auto p-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={button} disabled={!rectangles.length || busy || Boolean(selection)} onClick={() => setRectangles(old => old.slice(0, -1))}>Undo last erase</button>
        <button type="button" className={button} disabled={!rectangles.length || busy || Boolean(selection)} onClick={() => {setRectangles([]);setError("");}}>Restore all</button>
        <label className="ml-auto text-sm">Zoom <select className="ml-2 rounded border border-slate-300 p-2" value={zoom} disabled={busy} onChange={e => setZoom(Number(e.target.value))}>{[100,150,200].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
      </div>
      {error && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">{error}</p>}
      {!size.width && !error && <p role="status" className="p-8 text-center text-sm text-slate-500">Loading diagram…</p>}
      {size.width > 0 && <>
        <div className="max-h-[55vh] overflow-auto rounded-md border border-slate-300 bg-slate-100">
          <div style={{width: zoom + "%"}}>
            <canvas ref={canvas} width={size.width} height={size.height} aria-label="Diagram erase canvas. Drag to erase, or enter rectangle coordinates below."
              className="block h-auto w-full touch-none" style={{cursor: busy ? "wait" : "crosshair"}}
              onPointerDown={e => { if (busy || e.button !== 0 || !e.isPrimary) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); start.current = point(e); setSelection(eraseRect(start.current, start.current)); }}
              onPointerMove={e => { if (start.current && !busy) setSelection(eraseRect(start.current, point(e))); }}
              onPointerUp={e => { if (!start.current) return; const rect = eraseRect(start.current, point(e)); start.current = null; setSelection(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); if (rect.width && rect.height) add(rect); }}
              onPointerCancel={() => {start.current = null;setSelection(null);}} onLostPointerCapture={() => {start.current = null;setSelection(null);}} />
          </div>
        </div>
        <details className="rounded-md border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium">Enter a rectangle with the keyboard</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(["x","y","width","height"] as const).map(key => <label key={key} className="text-xs font-medium">{({x:"Left",y:"Top",width:"Width",height:"Height"})[key]} (px)
              <input type="number" min={key === "x" || key === "y" ? 0 : 1} step={1} disabled={busy} value={manual[key]} className="mt-1 w-full rounded border border-slate-300 p-2 text-sm" onChange={e => setManual({...manual,[key]:Math.round(Number(e.target.value))})}/></label>)}
            <button type="button" className={button + " self-end"} disabled={busy || Boolean(selection)} onClick={() => add(manual)}>Erase rectangle</button>
          </div>
        </details>
      </>}
      <p className="text-xs text-slate-500" role="status">{rectangles.length} erased area{rectangles.length === 1 ? "" : "s"}{size.width ? ` · ${size.width} × ${size.height} pixels` : ""}. Review the whole diagram before applying.</p>
    </div>
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 p-5">
      <p className="max-w-xl text-xs leading-5 text-slate-600">Apply creates a separate PNG with the selected pixels removed. It keeps the image dimensions and hotspot positions. Save the question and republish the exam to update students’ new attempts. Existing attempts keep their earlier image.</p>
      <button type="button" disabled={busy || !rectangles.length || Boolean(selection)} onClick={() => void apply()} className="rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving cleaned image…" : "Apply cleaned image"}</button>
    </footer>
  </dialog>, document.body);
}
