import type { Metadata } from "next";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { ExamCard } from "@/components/exam-card";
import { publicExams } from "@/lib/exams";
import { CatalogCategoryFields } from "@/components/catalog-category-fields";

export const metadata: Metadata = { title: "Practice exams" };
const field = "mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100";

export default async function ExamsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; category?: string; subcategory?: string; access?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const category = typeof params.category === "string" ? params.category : "";
  const subcategory = category && typeof params.subcategory === "string" ? params.subcategory : "";
  const access = ["free", "premium"].includes(params.access || "") ? params.access : "";
  const sort = ["rating", "newest", "title", "questions"].includes(params.sort || "") ? params.sort : "newest";
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
  const active = Boolean(q || category || subcategory || access || sort !== "newest");
  return <main className="bg-slate-50 pb-20">
    <section className="bg-slate-950 px-5 py-14 text-white">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-violet-300">Exam marketplace</p>
        <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">Find your next practice exam</h1>
        <p className="mt-4 text-lg text-slate-300">Search the library and narrow your results by category and access.</p>
      </div>
    </section>
    <section className="mx-auto grid max-w-7xl items-start gap-8 px-5 py-8 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside aria-label="Exam filters" className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
      <form action="/exams" method="get">
        <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4 text-sm font-semibold"><SlidersHorizontal size={17} className="text-violet-700" />Search and filter exams</div>
        <div className="flex flex-col gap-5">
          <label className="min-w-0 text-xs font-semibold text-slate-600">Search
            <div className="relative mt-2"><Search size={18} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input key={q} name="q" defaultValue={q} placeholder="Exam or certification" className="min-h-11 w-full rounded-md border border-slate-300 py-2 pl-10 pr-3 text-sm font-normal text-slate-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-100" /></div>
          </label>
          <CatalogCategoryFields key={`${category}:${subcategory}`} items={exams} initialCategory={category} initialSubcategory={subcategory} fieldClass={field} />
          <label className="text-xs font-semibold text-slate-600">Access<select key={access} name="access" defaultValue={access} className={field}><option value="">All exams</option><option value="free">Fully free</option><option value="premium">Includes premium questions</option></select></label>
          <label className="text-xs font-semibold text-slate-600">Sort by<select key={sort} name="sort" defaultValue={sort} className={field}><option value="newest">Newest published</option><option value="rating">Highest rated</option><option value="title">Name: A–Z</option><option value="questions">Most questions</option></select></label>
          <button type="submit" className="min-h-11 w-full rounded-md bg-violet-700 px-6 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700">Apply filters</button>
        </div>
      </form>
      </aside>
      <div className="min-w-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-2xl font-bold">{subcategory ? `${category} / ${subcategory}` : category || "All exams"}</h2><p className="mt-1 text-sm text-slate-500">{filtered.length} of {exams.length} exams{q.trim() ? ` matching “${q.trim()}”` : ""}</p></div>{active && <Link href="/exams" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Clear filters</Link>}</div>
      {filtered.length ? <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(exam => <ExamCard key={exam.id} exam={exam} />)}</div> : <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center"><h3 className="text-xl font-semibold">No exams found</h3><p className="mt-2 text-sm text-slate-500">Try another search or clear your filters.</p><Link href="/exams" className="mt-5 inline-block text-sm font-semibold text-violet-700 underline underline-offset-4">Show all exams</Link></div>}
      </div>
    </section>
  </main>;
}
