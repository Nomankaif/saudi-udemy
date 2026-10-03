"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, ShoppingBag, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfileMenu } from "./profile-menu";
import { CategoryMenu } from "./category-menu";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<{
    firstName: string;
    lastName: string;
  } | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState({
    title: "New practice exams are now available.",
    buttonText: "Explore exams",
    buttonUrl: "/exams",
  });

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/backend/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (response.ok) {
          const account = await response.json();
          if (active) setUser(account);
        } else if (response.status === 401 || response.status === 403) {
          if (active) setUser(null);
        }
      } catch {
        // Keep the last known session during temporary network failures.
      } finally {
        if (active) setSessionChecked(true);
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("auth-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("auth-changed", refresh);
    };
  }, [pathname]);

  useEffect(() => {
    fetch(`${apiUrl}/banners/active`)
      .then((response) => (response.ok ? response.json() : []))
      .then((items) => {
        const item = items.find(
          (banner: { type: string }) => banner.type === "ANNOUNCEMENT",
        );
        if (item) setAnnouncement(item);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="relative z-50 bg-white">
      <div className="flex min-h-9 items-center justify-center gap-2 bg-slate-900 px-5 py-2 text-center text-xs text-white">
        <span className="font-medium">{announcement.title}</span>
        {announcement.buttonUrl && (
          <Link
            className="font-bold underline underline-offset-2"
            href={announcement.buttonUrl}
          >
            {announcement.buttonText || "Learn more"}
          </Link>
        )}
      </div>
      <header className="sticky top-0 flex h-[76px] items-center gap-9 border-b border-slate-200 bg-white px-5 lg:px-[max(20px,calc((100vw-1180px)/2))]">
        <Link
          className="inline-flex items-center gap-2.5 text-2xl font-extrabold tracking-tight"
          href="/"
          aria-label="Certify home"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-violet-600 text-xl text-white">
            C
          </span>
          Certify
        </Link>
        <nav
          className={`${open ? "flex" : "hidden"} absolute inset-x-0 top-[76px] flex-col gap-5 border-b border-slate-200 bg-white p-5 text-sm font-semibold shadow-xl lg:static lg:flex lg:flex-row lg:border-0 lg:p-0 lg:shadow-none`}
          aria-label="Primary navigation"
        >
          <Link className="hover:text-violet-600" href="/exams">
            Exams
          </Link>
          <Link className="hover:text-violet-600" href="/labs">Labs</Link>
          <CategoryMenu key={pathname} defaultKind={pathname.startsWith("/labs") ? "labs" : "exams"} onNavigate={() => setOpen(false)} />
          <Link className="hover:text-violet-600" href="/blog">
            Articles
          </Link>
          <Link className="hover:text-violet-600" href="/about">
            About
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="hidden size-10 place-items-center bg-transparent text-slate-900 sm:grid"
            aria-label="Search"
          >
            <Search size={20} />
          </button>
          <Link
            className="grid size-10 place-items-center"
            href="/dashboard"
            aria-label="My learning"
          >
            <ShoppingBag size={20} />
          </Link>
          {user ? (
            <ProfileMenu key={pathname} user={user} />
          ) : sessionChecked ? (
            <>
              <Link
                className="hidden min-h-11 items-center gap-2 border border-slate-900 px-4 text-sm font-bold hover:bg-slate-50 sm:inline-flex"
                href="/login"
              >
                <UserRound size={18} />
                Log in
              </Link>
              <Link
                className="inline-flex min-h-11 items-center bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700"
                href="/register"
              >
                Join now
              </Link>
            </>
          ) : (
            <span
              aria-label="Checking your session"
              className="h-10 w-20 animate-pulse rounded-full bg-slate-100"
            />
          )}
          <button
            className="grid size-10 place-items-center lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </header>
    </div>
  );
}
