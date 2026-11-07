"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const inputClass =
  "min-h-12 min-w-0 w-full border border-slate-300 bg-white px-3 outline-none focus:border-violet-600 focus:ring-4 focus:ring-violet-100";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setMessage("Connecting your account…");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(`/api/backend/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await response.json();
      setFailed(!response.ok);
      setMessage(
        response.ok
          ? mode === "login"
            ? "Signed in successfully. Redirecting…"
            : "Account created. You can now log in."
          : data.message || "Unable to continue.",
      );
      if (response.ok && mode === "login") {
        window.dispatchEvent(new Event("auth-changed"));
        const next = new URLSearchParams(window.location.search).get("next");
        router.push(next?.startsWith("/exams/") ? next : "/dashboard");
      }
    } catch {
      setFailed(true);
      setMessage("The service is unavailable. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="mt-6 flex flex-col gap-4" onSubmit={submit}>
      {mode === "register" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
            First name
            <input
              className={inputClass}
              name="firstName"
              required
              autoComplete="given-name"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
            Last name
            <input
              className={inputClass}
              name="lastName"
              required
              autoComplete="family-name"
            />
          </label>
        </div>
      )}
      <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
        Email address
        <input
          className={inputClass}
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </label>
      {mode === "register" && (
        <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
          Mobile number{" "}
          <span className="font-normal text-slate-500">(optional)</span>
          <input
            className={inputClass}
            name="mobile"
            type="tel"
            autoComplete="tel"
            placeholder="+966 5X XXX XXXX"
          />
        </label>
      )}
      <div className="flex flex-col gap-2 text-sm font-bold text-slate-700"><label htmlFor="account-password">Password</label><div className="relative"><input id="account-password" className={`${inputClass} pr-12`} name="password" type={showPassword ? "text" : "password"} minLength={8} required autoComplete={mode === "login" ? "current-password" : "new-password"} /><button type="button" className="absolute right-1 top-1 grid size-10 place-items-center rounded text-slate-500" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{mode === "register" && <p className="text-xs font-normal text-slate-500">Use at least 8 characters.</p>}</div>
      {mode === "login" && (
        <div className="flex justify-end text-xs">

          <Link className="font-bold text-violet-600" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
      )}
      <button
        className="portal-button min-h-12 w-full"
        type="submit"
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
      </button>
      {message && (
        <p
          className={`rounded-md p-3 text-sm ${failed ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-600"}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </form>
  );
}
