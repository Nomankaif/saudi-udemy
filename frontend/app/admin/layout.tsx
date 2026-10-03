import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLogout } from "@/components/admin/logout";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const session = jar.get("admin_session");
  if (!session) redirect("/admin-login");
  let allowed = false;
  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL || "http://localhost:4000/api"}/auth/admin/me`, {
      headers: { Cookie: `admin_session=${encodeURIComponent(session.value)}` }, cache: "no-store",
    });
    allowed = response.ok;
  } catch { /* Fail closed when the authentication service is unavailable. */ }
  if (!allowed) redirect("/admin-login");
  return <><div className="mb-5 flex justify-end"><AdminLogout /></div>{children}</>;
}
