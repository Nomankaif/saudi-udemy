import { LabRunner } from "@/components/labs/runner";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <LabRunner id={id} />; }
