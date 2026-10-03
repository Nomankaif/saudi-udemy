"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="text-2xl font-bold">Exams are temporarily unavailable</h1><p className="mt-3 text-slate-500">Please try again shortly.</p><button onClick={reset} className="mt-5 rounded-lg bg-violet-700 px-5 py-3 font-bold text-white">Try again</button></div>;}
