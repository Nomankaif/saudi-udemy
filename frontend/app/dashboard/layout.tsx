import {cookies} from "next/headers";
import {redirect} from "next/navigation";
export default async function Layout({children}:{children:React.ReactNode}){
 const jar=await cookies();let allowed=false;
 try{const response=await fetch(`${process.env.API_INTERNAL_URL||"http://localhost:4000/api"}/auth/me`,{headers:{Cookie:jar.toString()},cache:"no-store"});allowed=response.ok;}catch{}
 if(!allowed)redirect("/login");return <>{children}</>;
}
