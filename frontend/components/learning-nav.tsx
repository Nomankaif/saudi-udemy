"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Network, ShieldCheck, UserRound } from "lucide-react";

export function LearningNav() {
  const pathname = usePathname();
  return <nav className="portal-learning-nav" aria-label="Your learning"><div className="portal-container"><span>Your workspace</span>{[
    { href: "/dashboard", title: "My exams", Icon: BookOpen },
    { href: "/labs/history", title: "My labs", Icon: Network },
    { href: "/dashboard/access-requests", title: "Access requests", Icon: ShieldCheck },
    { href: "/dashboard/profile", title: "Profile", Icon: UserRound },
  ].map(({ href, title, Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={15} />{title}</Link>)}</div></nav>;
}
