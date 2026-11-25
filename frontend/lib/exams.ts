import type { ExamSummary } from "./types";
export async function publicExams(query = ""): Promise<ExamSummary[]> {
  const base = process.env.API_INTERNAL_URL || "http://localhost:4000/api";
  const response = await fetch(`${base}/exams${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Exams are temporarily unavailable");
  return (await response.json()).map((exam: ExamSummary & { _id: string; sourceKind?: string }) => ({ ...exam, id: exam._id, kind: exam.sourceKind === "DRAG_DROP_BANK" ? "DRAG_DROP" : "EXAM" }));
}

type PublishedPbq = {
  _id: string;
  title: string;
  category: string;
  subcategory: string;
  prompt?: string;
  shortDescription?: string;
  questionCount?: number;
  publishedAt?: string;
};

export async function publicPerformanceBased(): Promise<ExamSummary[]> {
  const base = process.env.API_INTERNAL_URL || "http://localhost:4000/api";
  const response = await fetch(`${base}/practice-items/performance-based`, { cache: "no-store" });
  if (!response.ok) throw new Error("Performance-based questions are temporarily unavailable");
  const items: PublishedPbq[] = await response.json();
  return items.map(item => ({
    kind: "PBQ" as const,
    id: item._id,
    slug: item._id,
    title: item.title,
    shortDescription: item.shortDescription || item.prompt || "Interactive performance-based practice question",
    category: item.category,
    subcategory: item.subcategory,
    questionCount: item.questionCount || 1,
    freeQuestionCount: item.questionCount || 1,
    durationMinutes: 0,
    validityDays: 0,
    featured: false,
    rating: 0,
    reviewCount: 0,
    publishedAt: item.publishedAt,
  }));
}
export async function publicExam(slug: string): Promise<ExamSummary | null> {
  const response = await fetch(`${process.env.API_INTERNAL_URL || "http://localhost:4000/api"}/exams/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Exam is temporarily unavailable");
  const exam = await response.json(); return { ...exam, id: exam._id, kind: exam.sourceKind === "DRAG_DROP_BANK" ? "DRAG_DROP" : "EXAM" };
}
