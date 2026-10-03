"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { UserRound, BookOpen, ShieldCheck, ArrowRight } from "lucide-react";
import { api, messageOf } from "@/lib/api";
type Account = {
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
};
export function AccountProfile() {
  const [user, setUser] = useState<Account | null>(null),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    api<Account>("/auth/me")
      .then(setUser)
      .catch((error) => setMessage(messageOf(error)));
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      setUser(
        await api<Account>("/auth/me", {
          method: "PATCH",
          body: JSON.stringify(values),
        }),
      );
      setEditing(false);
      window.dispatchEvent(new Event("auth-changed"));
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-[70vh] bg-[#f8f9fb] px-5 py-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Account
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            My profile
          </h1>
          <p className="text-sm text-slate-500">
            Personal information and exam activity.
          </p>
        </div>
        {message && (
          <p
            role="status"
            className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm"
          >
            {message}
          </p>
        )}
        {user ? (
          <div className="grid items-start gap-7 lg:grid-cols-[280px_1fr]">
            <aside className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="grid size-16 place-items-center rounded-full bg-slate-900 text-xl font-medium text-white">
                {user.firstName[0]}
                {user.lastName[0]}
              </div>
              <h2 className="mt-5 text-lg font-semibold">
                {user.firstName} {user.lastName}
              </h2>
              <p className="mt-1 break-all text-sm text-slate-500">
                {user.email}
              </p>
              <nav
                aria-label="Profile navigation"
                className="mt-6 space-y-1 border-t border-slate-100 pt-4"
              >
                <span className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm font-semibold">
                  <UserRound size={16} />
                  Profile
                </span>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <BookOpen size={16} />
                  My exams
                </Link>
                <Link
                  href="/dashboard/access-requests"
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm text-slate-600 hover:bg-slate-50"
                >
                  <ShieldCheck size={16} />
                  Access requests
                </Link>
              </nav>
            </aside>
            <div className="space-y-6">
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
                  <h2 className="text-base font-semibold">
                    Personal information
                  </h2>
                  {!editing && (
                    <button
                      onClick={() => setEditing(true)}
                      className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold hover:bg-slate-50"
                    >
                      Edit profile
                    </button>
                  )}
                </div>
                {editing ? (
                  <form onSubmit={save} className="space-y-5 p-6">
                    <div className="grid gap-5 sm:grid-cols-2">
                      {[
                        ["firstName", "First name", user.firstName],
                        ["lastName", "Last name", user.lastName],
                        ["mobile", "Mobile number", user.mobile || ""],
                      ].map(([name, label, value]) => (
                        <label
                          key={name}
                          className="grid gap-2 text-sm font-medium"
                        >
                          {label}
                          <input
                            name={name}
                            defaultValue={value}
                            required={name !== "mobile"}
                            maxLength={name === "mobile" ? 25 : 80}
                            className="rounded-md border border-slate-300 px-3 py-2.5 font-normal focus:outline-violet-600"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditing(false)}
                        className="rounded-md border border-slate-300 px-4 py-2.5 text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={busy}
                        className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <dl className="grid gap-x-8 gap-y-7 p-6 sm:grid-cols-2">
                    {[
                      ["First name", user.firstName],
                      ["Last name", user.lastName],
                      ["Email address", user.email],
                      ["Mobile number", user.mobile || "Not provided"],
                    ].map(([label, value]) => (
                      <div key={label} className="min-w-0">
                        <dt className="text-xs text-slate-500">{label}</dt>
                        <dd className="mt-2 break-words text-sm font-medium text-slate-900">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="text-base font-semibold">Your learning</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Resume an exam or review your previous attempts and results.
                </p>
                <Link
                  href="/dashboard"
                  className="mt-5 inline-flex items-center gap-3 text-sm font-semibold text-slate-900"
                >
                  View my exams
                  <ArrowRight size={16} />
                </Link>
              </section>
            </div>
          </div>
        ) : (
          !message && (
            <p role="status" className="text-sm text-slate-500">
              Loading profile…
            </p>
          )
        )}
      </div>
    </main>
  );
}
