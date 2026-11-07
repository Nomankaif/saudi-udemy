"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Menu, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ProfileMenu } from "./profile-menu";
import { CategoryMenu } from "./category-menu";
import { Brand } from "./brand";

export function Header() {
  const pathname = usePathname();
  const [user, setUser] = useState<{
    firstName: string;
    lastName: string;
  } | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [open, setOpen] = useState(false);

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

  return (
    <div className="portal-header-wrap">
      <header className="portal-header portal-container" onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
        <Brand />
        <nav id="primary-navigation" className={`portal-nav ${open ? "is-open" : ""}`} aria-label="Primary navigation">
          {([["/", "Home"], ["/exams", "Exams"], ["/labs", "Labs"]] as const).map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href || (href !== "/" && pathname.startsWith(href + "/")) ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}
          <CategoryMenu key={pathname} defaultKind={pathname.startsWith("/labs") ? "labs" : "exams"} onNavigate={() => setOpen(false)} />
          <Link href="/about" aria-current={pathname === "/about" ? "page" : undefined} onClick={() => setOpen(false)}>About</Link>
          <Link href="/faq" onClick={() => setOpen(false)} className="portal-mobile-help">Help & FAQs</Link>
        </nav>
        <div className="portal-header-actions">
          <Link className="portal-icon-button portal-header-search" href="/exams" aria-label="Search exam library"><Search size={20} /></Link>
          {user ? <><Link className="portal-icon-button portal-learning-link" href="/dashboard" aria-label="My learning"><BookOpen size={20} /></Link><ProfileMenu key={pathname} user={user} /></> : sessionChecked ? <><Link className="portal-login-link" href="/login">Log in</Link><Link className="portal-button portal-register-link" href="/register">Get started <span aria-hidden="true">↗</span></Link></> : <span aria-label="Checking your session" className="h-10 w-20 animate-pulse rounded-md bg-slate-100" />}
          <button className="portal-icon-button portal-menu-toggle" onClick={() => setOpen(!open)} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="primary-navigation">{open ? <X /> : <Menu />}</button>
        </div>
      </header>
    </div>
  );
}
