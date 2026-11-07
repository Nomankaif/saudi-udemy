"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, messageOf } from "@/lib/api";
import type { PracticeItem, PracticeKind } from "@/lib/standalone-practice";
import { practiceLabel } from "@/lib/standalone-practice";
import { AdminHeading, primaryButton } from "./ui";
import { CardActions, cardOpenButton, cardPublishButton } from "./card-actions";
import { CatalogFilters } from "./catalog-filters";

export function StandalonePracticeList({ kind }: { kind: PracticeKind }) {
  const label = practiceLabel(kind);
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await api<PracticeItem[]>(`/practice-items/${kind}/admin`));
      setMessage("");
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setLoading(false);
    }
  }, [kind]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const visible = items.filter(item =>
    item.title.toLowerCase().includes(query.trim().toLowerCase()) && (!status || item.status === status),
  );

  async function act(item: PracticeItem, action: "publish" | "retire" | "delete") {
    if (busy) return;
    if (action === "delete" && !window.confirm(`Delete “${item.title}” permanently?`)) return;
    setBusy(item._id);
    setMessage("");
    try {
      const suffix = action === "delete" ? "" : action === "publish" && kind === "drag-drop" ? "/publish-bank" : `/${action}`;
      await api(`/practice-items/${kind}/admin/${item._id}${suffix}`, { method: action === "delete" ? "DELETE" : "POST" });
      await load();
      setMessage(`“${item.title}” ${action === "delete" ? "deleted" : action === "retire" ? "retired" : "published"}.`);
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy("");
    }
  }

  return <div className="space-y-6">
    <AdminHeading
      eyebrow="Question studio"
      title={kind === "drag-drop" ? "Your Drag and Drop banks" : label}
      description={kind === "drag-drop" ? "Create a bank, add or import Drag and Drop questions, then publish it." : `Create and publish standalone ${label.toLowerCase()} questions.`}
      action={<Link href={`/admin/${kind}/new`} className={`${primaryButton} rounded-lg`}>Create {kind === "drag-drop" ? "bank" : "PBQ"}</Link>}
    />
    <CatalogFilters kind={kind === "drag-drop" ? "Drag and Drop banks" : "performance-based questions"} query={query} status={status} onQuery={setQuery} onStatus={setStatus} includeRetired />
    {message && <p role="status" className="rounded-xl bg-white p-6 text-sm text-slate-600">{message}</p>}
    {loading ? <p className="text-sm text-slate-500">Loading questions…</p> : !visible.length ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{items.length ? "No questions match your filters." : `Create your first ${kind === "drag-drop" ? "Drag and Drop bank" : "performance-based question"}.`}</p> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {visible.map(item => <article key={item._id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase text-violet-600">{[item.category, item.subcategory].filter(Boolean).join(" / ") || "Unassigned"}</span>
          <div className="flex shrink-0 items-center gap-1">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === "PUBLISHED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.status === "INACTIVE" ? "RETIRED" : item.status}</span>
            <CardActions
              title={item.title}
              updateHref={`/admin/${kind}/${item._id}${kind === "drag-drop" ? "?tab=settings" : ""}`}
              disabled={Boolean(busy)}
              onRetire={item.status === "PUBLISHED" ? () => void act(item, "retire") : undefined}
              onDelete={() => void act(item, "delete")}
            />
          </div>
        </div>
        <h2 className="mt-5 text-xl font-bold text-slate-950">{item.title}</h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{kind === "drag-drop" ? item.shortDescription || "Build your Drag and Drop question bank." : item.draftQuestion?.text}</p>
        <p className="mt-5 text-xs text-slate-500">{kind === "drag-drop" ? `${item.draftCount || 0} questions in bank` : "1 performance-based question"}</p>
        {item.hasUnpublishedChanges && item.status === "PUBLISHED" && <p className="mt-2 text-xs text-amber-700">Draft changes waiting to publish</p>}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-6">
          <Link href={`/admin/${kind}/${item._id}`} aria-label={`Open ${item.title}`} className={cardOpenButton}>Open</Link>
          <button type="button" className={cardPublishButton} disabled={Boolean(busy)} aria-label={`Publish ${item.title}`} aria-busy={busy === item._id} onClick={() => void act(item, "publish")}>{busy === item._id ? "Working…" : "Publish"}</button>
        </div>
      </article>)}
    </div>}
  </div>;
}
