"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";
import { LearningNav } from "@/components/learning-nav";
import { Footer } from "@/components/footer";
import { Shell } from "@/components/admin/shell";

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin-login") return <>{children}</>;
  if (pathname.startsWith("/learn/")) return <div className="portal-theme">{children}</div>;
  if (pathname.startsWith("/labs/session/")) return <div className="portal-theme">{children}</div>;
  if (pathname.startsWith("/admin")) return <Shell>{children}</Shell>;
  if (pathname.endsWith("/start"))
    return <main className="portal-theme min-h-screen">{children}</main>;
  return (
    <div className="portal-theme min-h-screen"><a href="#main-content" className="portal-skip-link">Skip to content</a>
      <Header />
      {(pathname.startsWith("/dashboard") || pathname === "/labs/history") && <LearningNav />}
      <main id="main-content" tabIndex={-1} className="min-h-[50vh] outline-none">{children}</main>
      <Footer />
    </div>
  );
}
