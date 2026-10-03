import type { Metadata } from "next";
import { SiteFrame } from "@/components/site-frame";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Certify — Practice exams that prepare you", template: "%s | Certify" },
  description: "Professional practice exams with detailed explanations and performance insights.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="m-0 bg-white font-sans text-slate-900 antialiased"><SiteFrame>{children}</SiteFrame></body></html>;
}
