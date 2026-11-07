import Link from "next/link";
import { BookOpen, Check, Network } from "lucide-react";
import { AuthForm } from "./auth-form";

export function AuthLayout({ mode }: { mode: "login" | "register" }) {
  const login = mode === "login";
  return <section className="portal-auth"><div className="portal-container"><div className="portal-auth-grid">
    <div className="portal-auth-story"><div><p className="portal-eyebrow">A LITTLE PRACTICE. A CLEARER PATH.</p><h2>Your next chapter<br />starts with you.</h2><p>A dedicated space for your certification preparation, from the first practice question to your next hands-on lab.</p></div><ul><li><BookOpen size={18} />Focused practice, clear explanations</li><li><Network size={18} />Hands-on simulated lab sessions</li><li><Check size={18} />Your progress, all in one place</li></ul></div>
    <div className="portal-auth-form"><h1>{login ? "Welcome back." : "Let’s get you started."}</h1><p>{login ? "Log in to pick up where you left off." : "Create your account and start your preparation."}</p><AuthForm mode={mode} /><div className="portal-auth-switch">{login ? "New to Certify? " : "Already have an account? "}<Link href={login ? "/register" : "/login"}>{login ? "Create an account" : "Log in"}</Link></div></div>
  </div></div></section>;
}
