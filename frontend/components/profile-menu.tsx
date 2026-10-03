"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  UserRound,
  BookOpen,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { api, messageOf } from "@/lib/api";
export function ProfileMenu({
  user,
}: {
  user: { firstName: string; lastName: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    if (open) {
      document.addEventListener("pointerdown", outside);
      document.addEventListener("keydown", key);
    }
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  async function logout() {
    setBusy(true);
    try {
      await api("/auth/logout", { method: "POST" });
      window.dispatchEvent(new Event("auth-changed"));
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setError(messageOf(error));
      setBusy(false);
    }
  }
  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        onClick={() => setOpen(!open)}
        aria-label="Account options"
        aria-expanded={open}
        aria-controls="account-options"
        className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-violet-600"
      >
        <span className="grid size-9 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {`${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() ||
            "U"}
        </span>
        <span className="hidden max-w-24 truncate sm:block">
          {user.firstName}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          id="account-options"
          className="absolute right-0 top-full z-50 mt-3 w-64 max-w-[calc(100vw-32px)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-3">
            <p className="truncate text-sm font-semibold text-slate-950">
              {user.firstName} {user.lastName}
            </p>
            <p className="mt-1 text-xs text-slate-500">Your account</p>
          </div>
          <nav aria-label="Account navigation" className="space-y-1 py-2">
            {[
              ["/dashboard/profile", "Profile", UserRound],
              ["/dashboard", "My exams", BookOpen],
              ["/labs/history", "My labs", BookOpen],
              ["/dashboard/access-requests", "Access requests", ShieldCheck],
            ].map(([href, label, Icon]) => {
              const ItemIcon = Icon as typeof UserRound;
              return (
                <Link
                  key={String(href)}
                  href={String(href)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <ItemIcon size={16} />
                  {String(label)}
                </Link>
              );
            })}
          </nav>
          <button
            disabled={busy}
            onClick={() => void logout()}
            className="flex w-full items-center gap-3 border-t border-slate-100 px-3 py-3 text-sm text-slate-600 hover:text-rose-700 disabled:opacity-50"
          >
            <LogOut size={16} />
            {busy ? "Signing out…" : "Sign out"}
          </button>
          {error && (
            <p role="alert" className="px-3 pb-2 text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
