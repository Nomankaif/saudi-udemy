import { NextRequest, NextResponse } from "next/server";
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (
    path.some(
      (part) => part === ".." || part.includes("/") || part.includes("\\"),
    )
  )
    return NextResponse.json({}, { status: 400 });
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json({ message: "Invalid origin" }, { status: 403 });
  try {
    const headers = new Headers();
    for (const name of ["cookie", "content-type"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await fetch(
      `${process.env.API_INTERNAL_URL || "http://localhost:4000/api"}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await request.arrayBuffer(),
        cache: "no-store",
      },
    );
    const result = new NextResponse(response.body, { status: response.status });
    for (const name of ["content-type", "content-disposition"]) {
      const value = response.headers.get(name);
      if (value) result.headers.set(name, value);
    }
    for (const value of response.headers.getSetCookie())
      result.headers.append("set-cookie", value);
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch {
    return NextResponse.json(
      {
        message:
          "Cannot connect to the service. Check that the backend and MongoDB are running.",
      },
      { status: 503 },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
};
