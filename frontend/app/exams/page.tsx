import type { Metadata } from "next";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { ExamCard } from "@/components/exam-card";
import { publicExams } from "@/lib/exams";
import { CatalogFilters } from "@/components/catalog-filters";
import { CatalogHeading } from "@/components/catalog-heading";
import { CatalogCategoryFields } from "@/components/catalog-category-fields";
import { paginateExams } from "@/lib/exam-pagination";

export const metadata: Metadata = { title: "Practice exams" };
const field = "mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100";

export default async function ExamsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; category?: string; subcategory?: string; access?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const category = typeof params.category === "string" ? params.category : "";
  const subcategory = category && typeof params.subcategory === "string" ? params.subcategory : "";
  const access = ["free", "premium"].includes(params.access || "") ? params.access : "";
  const sort = ["rating", "newest", "title", "questions"].includes(params.sort || "") ? params.sort || "newest" : "newest";
  const exams = await publicExams();
  const query = q.trim().toLowerCase();
  const filtered = exams.filter(exam =>
    (!query || exam.title.toLowerCase().includes(query)) &&
    (!category || exam.category === category) &&
    (!subcategory || exam.subcategory === subcategory) &&
    (!access || (access === "free"
      ? exam.questionCount > 0 && exam.freeQuestionCount === exam.questionCount
      : exam.questionCount > exam.freeQuestionCount))
  ).sort((a, b) => {
    if (sort === "rating") return b.rating - a.rating || b.reviewCount - a.reviewCount || a.title.localeCompare(b.title);
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "questions") return b.questionCount - a.questionCount || a.title.localeCompare(b.title);
    return (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0) || a.title.localeCompare(b.title);
  });
  const pagination = paginateExams(filtered, params.page);
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (category) search.set("category", category);
    if (subcategory) search.set("subcategory", subcategory);
    if (access) search.set("access", access);
    if (sort !== "newest") search.set("sort", sort);
    if (target > 1) search.set("page", String(target));
    return `/exams${search.size ? `?${search}` : ""}`;
  };
  const pages = Array.from(new Set([1, 2, 3, pagination.page - 1, pagination.page, pagination.page + 1, pagination.totalPages - 2, pagination.totalPages - 1, pagination.totalPages]))
    .filter(number => number >= 1 && number <= pagination.totalPages)
    .sort((a, b) => a - b);
  const active = Boolean(q || category || subcategory || access || sort !== "newest");
  return <div className="bg-slate-50 pb-20">
    <CatalogHeading kind="exams" />
    <section className="portal-container portal-catalog-layout">
      <CatalogFilters kind="exams">
      <form action="/exams" method="get">
        <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4 text-sm font-semibold"><SlidersHorizontal size={17} className="text-violet-700" />Search and filter exams</div>
        <div className="flex flex-col gap-5">
          <label className="min-w-0 text-xs font-semibold text-slate-600">Search
            <div className="relative mt-2"><Search size={18} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input key={q} name="q" defaultValue={q} placeholder="Search by exam title" className="min-h-11 w-full rounded-md border border-slate-300 py-2 pl-10 pr-3 text-sm font-normal text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100" /></div>
          </label>
          <CatalogCategoryFields key={`${category}:${subcategory}`} items={exams} initialCategory={category} initialSubcategory={subcategory} fieldClass={field} />
          <label className="text-xs font-semibold text-slate-600">Access<select key={access} name="access" defaultValue={access} className={field}><option value="">All exams</option><option value="free">Fully free</option><option value="premium">Includes premium questions</option></select></label>
          <label className="text-xs font-semibold text-slate-600">Sort by<select key={sort} name="sort" defaultValue={sort} className={field}><option value="newest">Newest published</option><option value="rating">Highest rated</option><option value="title">Name: A–Z</option><option value="questions">Most questions</option></select></label>
          <button type="submit" className="min-h-11 w-full rounded-md bg-violet-700 px-6 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">Apply filters</button>
        </div>
      </form>
      </CatalogFilters>
      <div className="min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-2xl font-bold">{subcategory || category || "All exams"}</h2><p className="mt-1 text-sm text-slate-500">{filtered.length ? `Showing ${pagination.from}–${pagination.to} of ${filtered.length}` : "0"} exams{q.trim() ? ` matching “${q.trim()}”` : ""}</p></div>{active && <Link href="/exams" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Clear filters</Link>}</div>
      {filtered.length ? <div className="portal-catalog-grid">{pagination.items.map(exam => <ExamCard key={exam.id} exam={exam} />)}</div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"><h3 className="text-xl font-semibold">No exams found</h3><p className="mt-2 text-sm text-slate-500">Try another search or clear your filters.</p><Link href="/exams" className="mt-5 inline-block text-sm font-semibold text-violet-700 underline underline-offset-4">Show all exams</Link></div>}
      {pagination.totalPages > 1 && <nav aria-label="Exam pages" className="mt-9 flex flex-wrap items-center justify-center gap-2">
        {pagination.page > 1 ? <Link href={pageHref(pagination.page - 1)} className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-violet-700 hover:text-violet-700">Previous</Link> : <span aria-disabled="true" className="rounded-md border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-400">Previous</span>}
        {pages.map((number, index) => <span key={number} className="contents">{index > 0 && number > pages[index - 1]! + 1 && <span aria-hidden="true" className="px-1 text-slate-500">…</span>}{number === pagination.page ? <span aria-current="page" className="grid min-h-10 min-w-10 place-items-center rounded-md bg-violet-700 px-2 text-sm font-bold text-white">{number}</span> : <Link href={pageHref(number)} aria-label={`Go to page ${number}`} className="grid min-h-10 min-w-10 place-items-center rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-700 hover:border-violet-700 hover:text-violet-700">{number}</Link>}</span>)}
        {pagination.page < pagination.totalPages ? <Link href={pageHref(pagination.page + 1)} className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-violet-700 hover:text-violet-700">Next</Link> : <span aria-disabled="true" className="rounded-md border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm text-slate-400">Next</span>}
      </nav>}
      </div>
    </section>
  </div>;
}
