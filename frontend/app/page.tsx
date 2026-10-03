import Link from "next/link";
import {
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  FileText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ExamCard } from "@/components/exam-card";
import { articles } from "@/lib/data";
import { publicExams } from "@/lib/exams";

const shell = "mx-auto w-[min(1180px,calc(100%-40px))]";

export default async function Home() {
  const exams = await publicExams().catch(() => []);
  return (
    <div className="bg-white">
      <section className="overflow-hidden bg-gradient-to-br from-violet-50 via-white to-sky-50">
        <div
          className={`${shell} grid min-h-[505px] grid-cols-1 items-center gap-16 py-14 text-center lg:grid-cols-[1.12fr_.88fr] lg:text-left`}
        >
          <div className="min-w-0 text-center lg:text-left">
            <p className="inline-flex rounded-full border border-violet-200 bg-white/70 px-3 py-2 text-xs font-extrabold uppercase tracking-wider text-violet-700">
              Learn. Practice. Pass.
            </p>
            <h1 className="my-5 max-w-3xl text-[clamp(42px,5vw,68px)] font-bold leading-[1.04] tracking-[-3px]">
              Prepare smarter for your next certification.
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-500 lg:mx-0">
              Realistic practice exams, detailed explanations, and progress
              insights—all in one focused learning experience.
            </p>
            <form
              className="mx-auto mt-7 flex h-14 max-w-2xl items-center border border-slate-400 bg-white pl-4 shadow-lg lg:mx-0"
              action="/exams"
            >
              <Search size={20} />
              <input
                className="h-full min-w-0 flex-1 border-0 px-3 outline-none"
                name="q"
                aria-label="Search exams"
                placeholder="What do you want to prepare for?"
              />
              <button className="h-full bg-violet-600 px-4 font-bold text-white sm:px-7">
                Search
              </button>
            </form>
            <div className="mt-5 flex flex-wrap justify-center gap-5 text-xs font-semibold text-slate-600 lg:justify-start">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Free questions included
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Learn at your pace
              </span>
            </div>
          </div>
          <div className="relative hidden min-h-96 place-items-center lg:grid">
            <div className="grid aspect-square w-[340px] place-items-center rounded-full bg-gradient-to-br from-violet-600 to-violet-400 shadow-[30px_30px_0_#e0dafb]">
              <div className="flex aspect-square w-60 flex-col items-center justify-center rounded-full border border-white/50 text-white">
                <BarChart3 size={70} />
                <strong className="mt-4 text-xl">Build confidence</strong>
                <span className="mt-1 text-sm text-white/75">
                  one question at a time
                </span>
              </div>
            </div>
            <div className="absolute left-0 top-5 z-10 flex items-center gap-3 rounded-md bg-white p-4 shadow-xl">
              <Award className="text-violet-600" />
              <span className="flex flex-col text-xs text-slate-500">
                <strong className="text-sm text-slate-900">
                  Industry focused
                </strong>
                Real exam-style practice
              </span>
            </div>
            <div className="absolute bottom-7 right-0 z-10 flex items-center gap-3 rounded-md bg-white p-4 shadow-xl">
              <ShieldCheck className="text-violet-600" />
              <span className="flex flex-col text-xs text-slate-500">
                <strong className="text-sm text-slate-900">
                  Detailed results
                </strong>
                Know where to improve
              </span>
            </div>
          </div>
        </div>
      </section>
      <div
        className={`${shell} flex gap-8 overflow-x-auto whitespace-nowrap border-b border-slate-200 py-6 text-sm font-bold md:justify-between`}
      >
        {[
          "Cybersecurity",
          "Cloud Computing",
          "Networking",
          "Project Management",
          "IT Service Management",
        ].map((item) => (
          <Link
            className="hover:text-violet-600"
            key={item}
            href={`/exams?category=${encodeURIComponent(item)}`}
          >
            {item}
          </Link>
        ))}
      </div>
      <section className={`${shell} py-16 sm:py-20`}>
        <div className="mb-8 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-wider text-violet-600">
              Popular right now
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Featured practice exams
            </h2>
          </div>
          <Link
            className="flex items-center gap-2 text-sm font-bold text-violet-600"
            href="/exams"
          >
            View all exams
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {exams.slice(0, 3).map((exam) => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      </section>
      <section className="bg-slate-900 py-16 text-white sm:py-20">
        <div className={shell}>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-wider text-violet-300">
              Built for better preparation
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to know you’re ready
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              [
                FileText,
                "Realistic practice",
                "Practice with exam-style questions organized around real certification objectives.",
              ],
              [
                CheckCircle2,
                "Clear explanations",
                "Understand every answer instead of simply memorizing it.",
              ],
              [
                BarChart3,
                "Performance insights",
                "Review attempts and identify the topics that need more attention.",
              ],
            ].map(([Icon, title, text]) => {
              const FeatureIcon = Icon as typeof FileText;
              return (
                <div
                  className="border border-slate-700 p-8"
                  key={title as string}
                >
                  <span className="grid size-14 place-items-center bg-slate-800 text-violet-300">
                    <FeatureIcon />
                  </span>
                  <h3 className="mb-2 mt-6 text-lg font-bold">
                    {title as string}
                  </h3>
                  <p className="text-sm leading-7 text-slate-400">
                    {text as string}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <section className={`${shell} py-16 sm:py-20`}>
        <div className="mb-8 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-wider text-violet-600">
              From the knowledge hub
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Latest articles
            </h2>
          </div>
          <Link
            className="flex items-center gap-2 text-sm font-bold text-violet-600"
            href="/blog"
          >
            Explore articles
            <ArrowRight size={18} />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {articles.map((article, index) => (
            <article className="border border-slate-200" key={article.title}>
              <div
                className={`flex h-40 items-end p-4 ${index === 0 ? "bg-gradient-to-br from-violet-600 to-violet-300" : index === 1 ? "bg-gradient-to-br from-slate-800 to-cyan-600" : "bg-gradient-to-br from-orange-500 to-amber-200"}`}
              >
                <span className="bg-slate-900/80 px-2 py-1.5 text-xs font-bold text-white">
                  {article.category}
                </span>
              </div>
              <div className="p-5">
                <p className="text-xs font-extrabold uppercase tracking-wider text-violet-600">
                  {article.read}
                </p>
                <h3 className="my-3 min-h-12 text-lg font-bold leading-snug">
                  {article.title}
                </h3>
                <Link
                  className="inline-flex items-center gap-1 text-sm font-bold text-violet-600"
                  href="/blog"
                >
                  Read article
                  <ArrowRight size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section
        className={`${shell} mb-20 flex flex-col items-start justify-between gap-7 bg-violet-600 p-8 text-white sm:flex-row sm:items-center sm:p-11`}
      >
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold">
            Start preparing with free questions today.
          </h2>
          <p className="mt-2 text-white/80">
            Create an account, choose an exam, and begin your first practice
            session.
          </p>
        </div>
        <Link
          className="inline-flex min-h-11 items-center gap-2 bg-white px-5 font-bold text-violet-700"
          href="/register"
        >
          Create free account
          <ArrowRight size={18} />
        </Link>
      </section>
    </div>
  );
}
