import { DragDropBankCreate } from "@/components/admin/drag-drop-bank-create";
import { DragDropBankWorkspace } from "@/components/admin/drag-drop-bank-workspace";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  return id === "new" ? <DragDropBankCreate /> : <DragDropBankWorkspace id={id} initialTab={tab === "settings" ? "settings" : "questions"} />;
}
