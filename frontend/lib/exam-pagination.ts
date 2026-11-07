export const EXAMS_PER_PAGE = 9;

export function paginateExams<T>(items: T[], requestedPage: unknown) {
  const totalPages = Math.ceil(items.length / EXAMS_PER_PAGE);
  const parsed = typeof requestedPage === "string" && /^[1-9]\d*$/.test(requestedPage)
    ? Number(requestedPage)
    : 1;
  const page = Math.min(Number.isSafeInteger(parsed) ? parsed : 1, Math.max(1, totalPages));
  const start = (page - 1) * EXAMS_PER_PAGE;

  return {
    items: items.slice(start, start + EXAMS_PER_PAGE),
    page,
    totalPages,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + EXAMS_PER_PAGE, items.length),
  };
}
