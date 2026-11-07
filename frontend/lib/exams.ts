import type { ExamSummary } from "./types";
export async function publicExams(query = ""): Promise<ExamSummary[]> {
  const base = process.env.API_INTERNAL_URL || "http://localhost:4000/api";
  const response = await fetch(`${base}/exams${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Exams are temporarily unavailable");
  return (await response.json()).map((exam: ExamSummary & { _id: string; sourceKind?: string }) => ({ ...exam, id: exam._id, kind: exam.sourceKind === "DRAG_DROP_BANK" ? "DRAG_DROP" : "EXAM" }));
}
export async function publicExam(slug: string): Promise<ExamSummary | null> {
  const response = await fetch(`${process.env.API_INTERNAL_URL || "http://localhost:4000/api"}/exams/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Exam is temporarily unavailable");
  const exam = await response.json(); return { ...exam, id: exam._id, kind: exam.sourceKind === "DRAG_DROP_BANK" ? "DRAG_DROP" : "EXAM" };
}
