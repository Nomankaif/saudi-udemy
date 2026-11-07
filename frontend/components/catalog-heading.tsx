import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function CatalogHeading({ kind }: { kind: "exams" | "labs" }) {
  const labs = kind === "labs";
  return <div className="catalog-heading"><div className="portal-container">
    <nav aria-label="Breadcrumb" className="portal-breadcrumb"><Link href="/">Home</Link><span>/</span><span>{labs ? "Hands-on labs" : "Practice exams"}</span></nav>
    <div className="catalog-heading-row"><div><p className="portal-eyebrow">{labs ? "LEARN BY DOING" : "YOUR NEXT CERTIFICATION"}</p><h1>{labs ? "Knowledge, put into practice." : "Preparation with a purpose."}</h1><p>{labs ? "Build confidence with guided configuration tasks and simulated lab environments." : "Find your exam. Practice the questions. Understand the answers."}</p></div><Link className="portal-text-link" href={labs ? "/labs/history" : "/dashboard"}>{labs ? "My lab sessions" : "My exams"}<ArrowUpRight size={17} /></Link></div>
    <div className="catalog-kind-nav"><Link href="/exams" aria-current={!labs ? "page" : undefined}>Practice exams</Link><Link href="/labs" aria-current={labs ? "page" : undefined}>Hands-on labs</Link></div>
  </div></div>;
}
