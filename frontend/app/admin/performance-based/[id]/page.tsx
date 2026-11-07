import { StandalonePracticeEditor } from "@/components/admin/standalone-practice-editor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StandalonePracticeEditor kind="performance-based" id={id} />;
}
