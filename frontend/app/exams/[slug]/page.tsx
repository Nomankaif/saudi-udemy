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
    <div className="portal-exam-detail bg-white">
      <section className="portal-detail-hero">
        <div className="portal-container grid gap-10 lg:grid-cols-[1fr_340px]">
<div className="min-w-0">
            <nav aria-label="Breadcrumb" className="portal-breadcrumb"><Link href="/exams">Practice exams</Link><span>/</span><span>{exam.subcategory || exam.category}</span></nav>
            <h1 className="mt-7 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {exam.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600">
              {exam.shortDescription}
            </p>
            <div className="portal-detail-facts"><span><FileQuestion size={17} />{exam.questionCount} questions</span><span><Clock3 size={17} />{exam.durationMinutes} min default</span>{exam.reviewCount > 0 && <span><Star size={17} fill="var(--site-gold-star)" color="var(--site-gold-star-stroke)" />{exam.rating} · {exam.reviewCount} reviews</span>}</div><p className="mt-6 text-sm text-slate-500">Independent practice material. Prepare with practice or timed sessions.</p>
          </div>
          <aside className="rounded-lg border border-slate-200 bg-white p-6 text-slate-950 shadow-sm">
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md bg-slate-900 text-white">
              {exam.imageUrl ? <Image src={exam.imageUrl} alt={exam.title} width={640} height={360} unoptimized className="aspect-video w-full object-cover" /> : <FileQuestion size={48} />}
            </div>
            <p className="mt-5 text-xl font-semibold">
              Practice at your pace
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Choose practice or timed mode. Your available questions are based on your current exam access.
            </p>
            <Link
              className="portal-button mt-6 w-full"
              href={`/exams/${exam.slug}/start`}
            >
              Start practice exam
            </Link>
            {exam.questionCount > exam.freeQuestionCount ? <div className="mt-4"><RequestAccess examId={exam.id}/></div> : <p className="mt-4 text-center text-xs text-slate-500">All {exam.questionCount} questions are available with free access.</p>}
          </aside>
        </div>
      </section>
      <div className="portal-container grid gap-10 py-14 lg:grid-cols-[1fr_320px]">
        <article className="min-w-0">
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold text-slate-950">
              What this exam includes
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                "Real exam-style questions",
                "Answer review after each attempt",
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
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full table-fixed border-collapse text-sm">
                <caption className="sr-only">Simulator details for {exam.title}</caption>
                <tbody className="divide-y divide-slate-200">
                  {([
                    [FileQuestion, "Total questions", exam.questionCount],
                    [FileQuestion, "Types of questions", exam.kind === "DRAG_DROP" ? "Drag and Drop matching with answer review" : "Multiple question formats with answer review"],
                    [Check, "Free questions", exam.freeQuestionCount],
                    [LockKeyhole, "Premium questions", Math.max(0, exam.questionCount - exam.freeQuestionCount)],
                    [Clock3, "Exam time limit", `You choose · Default ${exam.durationMinutes} minutes`],
                    [Award, "Access validity", `${exam.validityDays} days`],
                    [LockKeyhole, "Premium access", "Available with administrator approval"],
                    [Clock3, "Last published update", exam.publishedAt ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(exam.publishedAt)) : "Not available"],
                    [PlayCircle, "Open simulator", <Link key="start" href={`/exams/${exam.slug}/start`} className="inline-flex min-h-11 items-center justify-center gap-5 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2">Start exam<ArrowRight aria-hidden="true" size={16} strokeWidth={1.75} /></Link>],
                  ] as const).map(([Icon, label, value]) => (
                    <tr key={label} className="bg-white transition hover:bg-slate-50">
                      <th scope="row" className="w-[42%] border-r border-slate-200 px-3 py-4 text-left font-bold leading-6 text-slate-900 sm:px-5"><span className="flex items-start gap-2"><Icon aria-hidden="true" size={17} className="mt-1 shrink-0" />{label}</span></th>
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
            <li>Use practice mode first to review correct answers.</li>
            <li>Mark difficult questions and revisit them.</li>
            <li>Take a timed attempt when you are ready.</li>
            <li>Review your result history after every attempt.</li>
          </ul>
          </div>
        </aside>
      </div>
      <section className="bg-slate-50 px-5 py-14">
        <div className="portal-container">
          <p className="text-xs font-extrabold uppercase tracking-[.2em] text-violet-600">
            Keep exploring
          </p>
          <h2 className="mt-3 text-3xl font-extrabold text-slate-950">
            More practice exams
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
    </div>
  );
}
