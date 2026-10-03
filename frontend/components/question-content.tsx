import Markdown from "react-markdown";
export function QuestionContent({ text }: { text: string }) {
  return (
    <div className="break-words leading-7 [&_p]:mb-3 [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-auto [&_pre]:bg-slate-100 [&_pre]:p-3 [&_code]:text-violet-800 [&_a]:text-violet-700 [&_img]:max-h-80 [&_img]:object-contain">
      <Markdown skipHtml>{text}</Markdown>
    </div>
  );
}
