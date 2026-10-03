import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function Register() {
  return <section className="bg-slate-50 px-4 py-16 sm:py-24"><div className="mx-auto max-w-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-10"><p className="text-xs font-extrabold uppercase tracking-[.2em] text-violet-600">Start for free</p><h1 className="mt-3 text-3xl font-extrabold text-slate-950">Create your account</h1><p className="mt-3 text-slate-600">Explore free questions and request access to complete exams.</p><AuthForm mode="register"/><div className="mt-6 border-t border-slate-200 pt-6 text-center text-sm text-slate-600">Already registered? <Link className="font-bold text-violet-700 hover:underline" href="/login">Log in</Link></div></div></section>;
}
