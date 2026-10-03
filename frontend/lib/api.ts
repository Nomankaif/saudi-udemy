export class ApiError extends Error { constructor(message: string, public status: number, public details?: unknown) { super(message); } }
export type QuestionIssue = { question: number; questionId?: string; questionText?: string; message: string };
export function questionIssuesOf(error: unknown): QuestionIssue[] {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return [];
  return error.details.filter((issue): issue is QuestionIssue =>
    issue !== null && typeof issue === "object" && typeof issue.question === "number" &&
    typeof issue.message === "string" &&
    (issue.questionId === undefined || typeof issue.questionId === "string") &&
    (issue.questionText === undefined || typeof issue.questionText === "string"));
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/backend${path}`, { ...options, headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers }, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.message || "Request failed", response.status, data.details);
  return data;
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : "Something went wrong";
