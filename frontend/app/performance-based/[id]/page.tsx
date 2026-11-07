import { StandalonePracticePlayer } from "@/components/standalone-practice-player";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <StandalonePracticePlayer kind="performance-based" id={id} />; }
