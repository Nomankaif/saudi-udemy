import { LabCatalog } from "@/components/labs/catalog";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const initialFilters = { query: value("q"), category: value("category"), subcategory: value("category") ? value("subcategory") : "", access: ["FREE", "PREMIUM"].includes(value("access")) ? value("access") : "", sort: ["title", "tasks", "duration"].includes(value("sort")) ? value("sort") : "title" };
  return <LabCatalog key={JSON.stringify(initialFilters)} initialFilters={initialFilters} />;
}
