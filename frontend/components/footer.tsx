import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "./brand";

export function Footer() {
  return <footer className="portal-footer"><div className="portal-container">
    <div className="portal-footer-main"><div className="portal-footer-brand"><Brand inverse /><p>A focused place to prepare.<br />Practice exams, hands-on labs and a clearer picture of your progress.</p><Link href="/exams" className="portal-text-link">Find your next exam <ArrowUpRight size={16} /></Link></div>
      <div><h2>Explore</h2><Link href="/exams">Practice exams</Link><Link href="/performance-based">Performance-based</Link><Link href="/labs">Hands-on labs</Link><Link href="/#certifications">Certifications</Link><Link href="/blog">Study guides</Link></div>
      <div><h2>Your learning</h2><Link href="/dashboard">My exams</Link><Link href="/labs/history">My lab sessions</Link><Link href="/dashboard/access-requests">Access requests</Link></div>
      <div><h2>Here to help</h2><Link href="/about">About Certify</Link><Link href="/faq">Help & FAQs</Link><Link href="/contact">Contact</Link></div>
    </div>
    <div className="portal-footer-bottom"><span>© {new Date().getFullYear()} Certify. All rights reserved.</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div></div>
    <p className="portal-disclaimer">Independent certification preparation. Certification names and trademarks belong to their respective owners. Their inclusion does not imply affiliation or endorsement.</p>
  </div></footer>;
}
