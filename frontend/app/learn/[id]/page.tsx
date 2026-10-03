import {ExamRunner} from "@/components/exam-runner";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <ExamRunner id={id}/>;}
