import type { ReactNode } from "react";
export const inputClass =
  "border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-600";
export const primaryButton =
  "inline-flex items-center justify-center gap-2 bg-violet-700 px-5 py-3 text-sm font-bold text-white hover:bg-violet-800";
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 border border-slate-900 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-100";
export function AdminHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-violet-600">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-slate-950">{title}</h1>
        <span className="mt-2 block text-slate-600">{description}</span>
      </div>
      {action}
    </div>
  );
}
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}
export function StatusBadge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "gray";
}) {
  return (
    <span
      className={`inline-block px-2.5 py-1 text-xs font-bold ${tone === "green" ? "bg-emerald-100 text-emerald-800" : tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700"}`}
    >
      {children}
    </span>
  );
}
