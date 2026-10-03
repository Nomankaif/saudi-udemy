import { ExamSettings } from "@/components/admin/exam-workspace";
import { AdminHeading } from "@/components/admin/ui";
export default function Page() {
  return (
    <>
      <AdminHeading
        eyebrow="Exam studio"
        title="Create an exam"
        description="Start with the details, then build your question bank."
      />
      <ExamSettings />
    </>
  );
}
