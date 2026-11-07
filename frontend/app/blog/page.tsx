import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
const guides = [
  { title: "Build a study routine you can keep.", category: "Study habits", text: "Choose a specific topic for each session. Start with a manageable set of questions, review the explanations and write down what you want to revisit. Consistent, focused sessions are easier to learn from than an occasional rush through the whole catalog." },
  { title: "Use practice and timed modes differently.", category: "Exam preparation", text: "Use practice mode to explore the reasoning behind an answer. When you want to test your pacing, start a timed session. Afterwards, review both incorrect answers and questions you answered correctly but were unsure about." },
  { title: "Make the lab part of the lesson.", category: "Hands-on learning", text: "Read the tasks and topology before entering commands. Make one change at a time, inspect the resulting configuration and check your work. If you use a reference solution, repeat the task afterwards without it." },
];
export default function Blog() {
  return <div className="portal-editorial"><section className="portal-editorial-hero"><div className="portal-container"><p className="portal-eyebrow">THE STUDY DESK</p><h1>A little structure goes a long way.</h1><p>Practical ideas for making your next study session more useful.</p></div></section><section className="portal-container portal-section portal-guides">{guides.map((guide,index)=><article key={guide.title}><span>0{index+1}</span><div><p className="portal-eyebrow">{guide.category}</p><h2>{guide.title}</h2><p>{guide.text}</p></div></article>)}<Link href="/exams" className="portal-text-link">Put it into practice <ArrowUpRight size={17}/></Link></section></div>;
}
