import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  Award,
  ArrowRight,
  Check,
  Clock3,
  FileQuestion,
  LockKeyhole,
  PlayCircle,
  Star,
} from "lucide-react";
import { ExamCard } from "@/components/exam-card";
import { publicExam, publicExams } from "@/lib/exams";
import { RequestAccess } from "@/components/access-requests";
import { ExamReviews } from "@/components/exam-reviews";
export default async function ExamDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const exam = await publicExam(slug);
  const exams = await publicExams();
  if (!exam) notFound();
  return (
    <main className="bg-white">
      <section className="bg-slate-950 px-5 py-14 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_360px]">
<div className="min-w-0">
            <p className="text-sm text-violet-300">Exams / {exam.category}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
              {exam.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
              {exam.shortDescription}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <strong className="text-amber-300">{exam.rating}</strong>
              <span className="flex text-amber-300">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star fill="currentColor" key={i} size={16} />
                ))}
              </span>
              <u>{exam.reviewCount} reviews</u>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              Updated regularly to reflect current exam objectives
            </p>
          </div>
          <aside className="border border-slate-700 bg-white p-6 text-slate-950 shadow-xl">
            <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-violet-700 to-cyan-500 text-white">
              {exam.imageUrl ? <Image src={exam.imageUrl} alt={exam.title} width={640} height={360} unoptimized className="aspect-video w-full object-cover" /> : <PlayCircle size={58} />}
            </div>
            <p className="mt-6 text-2xl font-extrabold">
              Practice at your pace
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Choose practice or timed mode. Your available questions are based on your current exam access.
            </p>
            <Link
              className="mt-6 block bg-violet-700 px-5 py-3 text-center font-bold text-white hover:bg-violet-800"
              href={`/exams/${exam.slug}/start`}
            >
              Start practice exam
            </Link>
            <div className="mt-4"><RequestAccess examId={exam.id}/></div>
          </aside>
        </div>
      </section>
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 lg:grid-cols-[1fr_320px]">
        <article className="min-w-0">
          <section className="border border-slate-300 p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold text-slate-950">
              What this exam includes
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                "Real exam-style questions",
                "Detailed answer explanations",
                "Timed and practice modes",
                "Attempt and performance history",
              ].map((item) => (
                <span
                  className="flex items-center gap-3 font-semibold text-slate-700"
                  key={item}
                >
                  <Check className="text-violet-700" size={20} />
                  {item}
                </span>
              ))}
            </div>
          </section>
          <section className="mt-12">
            <h2 className="text-2xl font-extrabold text-slate-950">
              About this exam
            </h2>
            <p className="mt-4 whitespace-pre-line text-lg leading-8 text-slate-700">
              {exam.description}
            </p>
          </section>
          <section className="mt-12">
            <h2 className="text-2xl font-extrabold text-slate-950">
              Simulator details
            </h2>
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-700">
              <table className="w-full table-fixed border-collapse text-sm">
                <caption className="sr-only">Simulator details for {exam.title}</caption>
                <tbody className="divide-y divide-slate-700">
                  {([
                    [FileQuestion, "Total questions", exam.questionCount],
                    [FileQuestion, "Types of questions", "Multiple question formats with answer explanations"],
                    [Check, "Free questions", exam.freeQuestionCount],
                    [LockKeyhole, "Premium questions", Math.max(0, exam.questionCount - exam.freeQuestionCount)],
                    [Clock3, "Exam time limit", `You choose · Default ${exam.durationMinutes} minutes`],
                    [Award, "Access validity", `${exam.validityDays} days`],
                    [LockKeyhole, "Premium access", "Available with administrator approval"],
                    [Clock3, "Last published update", exam.publishedAt ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(exam.publishedAt)) : "Not available"],
                    [PlayCircle, "Open simulator", <Link key="start" href={`/exams/${exam.slug}/start`} className="inline-flex min-h-11 items-center justify-center gap-5 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2">Start exam<ArrowRight aria-hidden="true" size={16} strokeWidth={1.75} /></Link>],
                  ] as const).map(([Icon, label, value]) => (
                    <tr key={label} className="bg-white transition hover:bg-slate-50">
                      <th scope="row" className="w-[42%] border-r border-slate-700 px-3 py-4 text-left font-bold leading-6 text-slate-900 sm:px-5"><span className="flex items-start gap-2"><Icon aria-hidden="true" size={17} className="mt-1 shrink-0" />{label}</span></th>
                      <td className="w-[58%] break-words px-3 py-4 text-left leading-6 text-slate-600 sm:px-5">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </article>
        <aside className="h-fit space-y-6">
          <ExamReviews examId={exam.id} />
          <div className="border-t-4 border-violet-700 bg-slate-50 p-6">
          <h2 className="text-lg font-bold text-slate-950">Preparation tips</h2>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6 text-slate-700">
            <li>Use practice mode first to study explanations.</li>
            <li>Mark difficult questions and revisit them.</li>
            <li>Take a timed attempt when you are ready.</li>
            <li>Review your result history after every attempt.</li>
          </ul>
          </div>
        </aside>
      </div>
      <section className="bg-slate-50 px-5 py-14">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-violet-600">
            Keep exploring
          </p>
          <h2 className="mt-3 text-3xl font-extrabold text-slate-950">
            Related exams
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {exams
              .filter((item) => item.id !== exam.id)
              .slice(0, 3)
              .map((item) => (
                <ExamCard key={item.id} exam={item} />
              ))}
          </div>
        </div>
      </section>
    </main>
  );
}
