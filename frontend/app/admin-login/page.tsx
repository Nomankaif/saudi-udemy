"use client";
import { useState } from "react";
export default function AdminLogin() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const password = new FormData(event.currentTarget).get("password");
    try {
      const response = await fetch("/api/admin-auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.message || "Unable to sign in."); return; }
      window.location.replace("/admin");
    } catch { setMessage("Unable to sign in. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-16"><div className="w-full max-w-md border border-slate-200 bg-white p-8 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-violet-700">Certify administration</p><h1 className="mt-3 text-3xl font-extrabold">Admin sign in</h1><p className="mt-3 text-sm text-slate-600">Enter your admin password to access the control panel.</p><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-bold">Password<input className="mt-2 w-full border border-slate-400 px-4 py-3 outline-none focus:border-violet-600" name="password" type="password" autoComplete="current-password" required /></label><button disabled={busy} className="w-full bg-violet-700 px-5 py-3 font-bold text-white hover:bg-violet-800 disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button><p role="status" className="text-sm text-red-700">{message}</p></form></div></section>;
}
