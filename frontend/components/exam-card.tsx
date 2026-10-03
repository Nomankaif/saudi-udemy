import type { ExamSummary } from "@/lib/types";
import { Clock3, FileQuestion, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function ExamCard({ exam }: { exam: ExamSummary }) {
  return (
    <article className="group min-w-0 border border-slate-200 bg-white transition duration-200 hover:-translate-y-1 hover:shadow-xl">
      <Link
        className="relative block h-48 overflow-hidden bg-slate-200"
        href={`/exams/${exam.slug}`}
      >
        {exam.imageUrl && (
          <Image
            unoptimized
            className="object-cover transition duration-300 group-hover:scale-[1.025]"
            src={exam.imageUrl}
            alt=""
            fill
            sizes="(max-width: 800px) 100vw, 33vw"
          />
        )}
        {!exam.imageUrl && <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-950 to-violet-700 text-white"><FileQuestion size={56}/></div>}
        {exam.featured && (
          <span className="absolute left-3.5 top-3.5 bg-amber-200 px-2.5 py-1.5 text-[11px] font-extrabold text-amber-950">
            Featured
          </span>
        )}
      </Link>
      <div className="p-5">
        <p className="m-0 text-xs font-extrabold uppercase tracking-wider text-violet-600">
          {exam.category}
        </p>
        <h3 className="my-2 text-lg font-bold leading-snug tracking-tight">
          <Link href={`/exams/${exam.slug}`}>{exam.title}</Link>
        </h3>
        <p className="line-clamp-2 min-h-12 text-sm leading-6 text-slate-500">
          {exam.shortDescription}
        </p>
        <div className="flex gap-5 py-3 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <FileQuestion size={16} />
            {exam.questionCount} questions
          </span>
          <span className="flex items-center gap-1">
            <Clock3 size={16} />
            {exam.durationMinutes} min
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-amber-700">
          <strong>{exam.rating}</strong>
          <Star size={16} fill="currentColor" />
          <span className="text-slate-500">({exam.reviewCount})</span>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
          <span>
            <strong className="text-slate-900">{exam.freeQuestionCount}</strong>{" "}
            free questions
          </span>
          <Link
            className="font-extrabold text-violet-600"
            href={`/exams/${exam.slug}`}
          >
            View exam
          </Link>
        </div>
      </div>
    </article>
  );
}
