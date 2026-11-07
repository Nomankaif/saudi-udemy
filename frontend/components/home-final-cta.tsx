"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

type Session = "checking" | "guest" | "signed-in";

export function HomeFinalCta() {
  const [session, setSession] = useState<Session>("checking");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/backend/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!active) return;
        if (response.ok) setSession("signed-in");
        else if (response.status === 401 || response.status === 403) setSession("guest");
      } catch {
        // Keep the last known state during temporary connection problems.
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
  }, []);

  const content = session === "signed-in"
    ? { eyebrow: "READY WHEN YOU ARE", heading: "Ready for your next exam?", description: "Choose an exam and keep your preparation moving.", label: "Take your exam", href: "/exams" }
    : session === "guest"
      ? { eyebrow: "THE NEXT STEP IS YOURS", heading: "Give your ambition a place to start.", description: "Create an account to keep your practice and progress together.", label: "Create your account", href: "/register" }
      : { eyebrow: "FIND YOUR NEXT STEP", heading: "Find your next exam.", description: "Explore practice exams and choose where to begin.", label: "Browse exams", href: "/exams" };

  return <section className="portal-container portal-final-cta">
    <div><p className="portal-eyebrow">{content.eyebrow}</p><h2>{content.heading}</h2><p>{content.description}</p></div>
    <Link href={content.href} className="portal-button">{content.label} <ArrowRight size={18} /></Link>
  </section>;
}
