import { ExamWorkspace } from "@/components/admin/exam-workspace";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <ExamWorkspace key={`${id}-${tab}`} id={id} initialTab={tab === "settings" ? "settings" : "questions"} />;
}
