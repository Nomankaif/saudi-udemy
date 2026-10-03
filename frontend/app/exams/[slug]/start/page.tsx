import {notFound,redirect} from "next/navigation";
import {cookies} from "next/headers";
import {publicExam} from "@/lib/exams";
import {ExamSetup} from "@/components/exam-setup";
export default async function Page({params}:{params:Promise<{slug:string}>}){
 const{slug}=await params;const exam=await publicExam(slug);if(!exam)notFound();const jar=await cookies();let allowed=false;
 try{allowed=(await fetch(`${process.env.API_INTERNAL_URL||"http://localhost:4000/api"}/auth/me`,{headers:{Cookie:jar.toString()},cache:"no-store"})).ok;}catch{}
 if(!allowed)redirect(`/login?next=${encodeURIComponent(`/exams/${slug}/start`)}`);
 return <ExamSetup exam={exam}/>;
}
