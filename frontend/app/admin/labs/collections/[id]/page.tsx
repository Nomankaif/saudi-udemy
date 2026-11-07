import { LabCollectionEditor } from "@/components/labs/collection-editor";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <LabCollectionEditor id={id} />; }
