"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Shell } from "@/components/admin/shell";

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin-login") return <>{children}</>;
  if (pathname.startsWith("/learn/")) return <>{children}</>;
  if (pathname.startsWith("/labs/session/")) return <>{children}</>;
  if (pathname.startsWith("/admin")) return <Shell>{children}</Shell>;
  if (pathname.endsWith("/start"))
    return <main className="min-h-screen">{children}</main>;
  return (
    <div className="min-h-screen">
      <Header />
      <main className="min-h-[50vh]">{children}</main>
      <Footer />
    </div>
  );
}
