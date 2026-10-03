"use client";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  FileQuestion,
  Flag,
  ImageIcon,
  LayoutDashboard,
  Menu,
  Newspaper,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
const links = [
  ["/admin", "Overview", LayoutDashboard],
  ["/admin/exams", "Exams", BookOpen],
  ["/admin/labs", "Labs", FileQuestion],
  ["/admin/categories", "Categories", LayoutDashboard],
  ["/admin/questions", "Question banks", FileQuestion],
  ["/admin/access-requests", "Access requests", ShieldCheck],
  ["/admin/users", "Users & admins", Users],
  ["/admin/banners", "Banners", ImageIcon],
  ["/admin/content", "CMS & articles", Newspaper],
  ["/admin/reports", "Results & reports", BarChart3],
  ["/admin/settings", "Settings", Settings],
] as const;
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-white transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-slate-800 px-6">
          <span className="flex size-10 items-center justify-center bg-violet-600 text-xl font-black">
            C
          </span>
          <div className="flex flex-col font-extrabold">
            Certify
            <small className="font-normal text-slate-400">Administration</small>
          </div>
          <button
            className="ml-auto p-2 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {links.map(([href, label, Icon]) => (
            <Link
              className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold transition ${path === href || (href !== "/admin" && path.startsWith(`${href}/`)) ? "bg-violet-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
              href={href}
              key={href}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-slate-800 p-5 text-sm">
          <Flag size={20} />
          <span className="flex flex-col font-bold">
            English
          </span>
        </div>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close overlay"
        />
      )}
      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 flex h-20 items-center border-b border-slate-200 bg-white px-5 sm:px-8">
          <button
            className="mr-4 p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </button>
          <div className="text-sm font-semibold text-slate-500">
            Administration console
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-violet-100 text-sm font-black text-violet-800">
              AD
            </div>
            <span className="hidden flex-col text-sm font-bold sm:flex">
              Admin User
              <small className="font-normal text-slate-500">
                Super administrator
              </small>
            </span>
            <ChevronDown size={17} />
          </div>
        </header>
        <main className="p-5 sm:p-8 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
