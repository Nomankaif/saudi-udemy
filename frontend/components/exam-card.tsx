import type { ExamSummary } from "@/lib/types";
import { ArrowUpRight, Clock3, FileQuestion, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function ExamCard({ exam }: { exam: ExamSummary }) {
  return <article className="portal-card">
    <Link className="portal-card-cover" href={`/exams/${exam.slug}`} aria-label={`View ${exam.title}`}>
      {exam.imageUrl ? <Image unoptimized src={exam.imageUrl} alt="" fill sizes="(max-width: 600px) 100vw, (max-width: 1150px) 50vw, 33vw" /> : <div className="portal-card-fallback"><div><small>{exam.kind === "DRAG_DROP" ? "DRAG AND DROP" : "PRACTICE EXAM"}</small><FileQuestion size={23} /></div><strong>{exam.subcategory || exam.category}</strong></div>}
      {exam.featured && <span className="portal-card-badge">Featured exam</span>}
    </Link>
    <div className="portal-card-body"><p className="portal-card-category">{exam.category}{exam.subcategory ? ` / ${exam.subcategory}` : ""}</p><h3><Link href={`/exams/${exam.slug}`}>{exam.title}</Link></h3><p className="portal-card-description">{exam.shortDescription}</p>
      <div className="portal-card-meta"><span><FileQuestion size={14} />{exam.questionCount} {exam.questionCount === 1 ? "question" : "questions"}</span><span><Clock3 size={14} />{exam.durationMinutes} min</span></div>
      <div className="portal-card-extra">{exam.reviewCount > 0 ? <><Star size={13} fill="var(--site-gold-star)" color="var(--site-gold-star-stroke)" /><strong>{exam.rating}</strong><span>({exam.reviewCount} {exam.reviewCount === 1 ? "review" : "reviews"})</span></> : <span>Practice & timed sessions</span>}</div>
      <div className="portal-card-footer"><span>{exam.freeQuestionCount > 0 ? <><strong>{exam.freeQuestionCount}</strong> free {exam.freeQuestionCount === 1 ? "question" : "questions"}</> : "Premium practice"}</span><Link href={`/exams/${exam.slug}`}>View exam <ArrowUpRight size={15} /></Link></div>
    </div>
  </article>;
}
