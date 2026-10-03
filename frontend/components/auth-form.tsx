"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass =
  "min-h-12 border border-slate-300 bg-white px-3 outline-none focus:border-violet-600 focus:ring-4 focus:ring-violet-100";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setMessage("The service is unavailable. Please try again shortly.");
    }
  }
  return (
    <form className="mt-8 flex flex-col gap-4" onSubmit={submit}>
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
      <label className="flex flex-col gap-2 text-sm font-bold text-slate-700">
        Password
        <input
          className={inputClass}
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {mode === "login" && (
        <div className="flex justify-between text-xs">
          <label className="flex flex-row items-center gap-2">
            <input type="checkbox" />
            Remember me
          </label>
          <Link className="font-bold text-violet-600" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
      )}
      <button
        className="min-h-12 w-full bg-violet-600 px-5 font-bold text-white hover:bg-violet-700"
        type="submit"
      >
        {mode === "login" ? "Log in" : "Create account"}
      </button>
      {message && (
        <p
          className="bg-emerald-50 p-3 text-center text-sm text-emerald-700"
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  );
}
