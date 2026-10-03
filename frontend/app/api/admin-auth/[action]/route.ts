import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!["login", "logout"].includes(action)) return NextResponse.json({}, { status: 404 });
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  try {
    const body = action === "login" ? await request.json() : {};
    const response = await fetch(`${process.env.API_INTERNAL_URL || "http://localhost:4000/api"}/auth/admin/${action}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store",
    });
    const result = NextResponse.json(await response.json(), { status: response.status });
    const cookie = response.headers.get("set-cookie");
    if (cookie) result.headers.set("set-cookie", cookie);
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch {
    return NextResponse.json({ message: "Unable to connect to the admin service. Please try again." }, { status: 503 });
  }
}
