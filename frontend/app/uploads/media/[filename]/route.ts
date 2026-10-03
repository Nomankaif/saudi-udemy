export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!/^[a-zA-Z0-9_.-]+$/.test(filename) || filename.includes("..")) return new Response(null, {status:400});
  const base = (process.env.API_INTERNAL_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");
  try {
    const response = await fetch(`${base}/uploads/media/${encodeURIComponent(filename)}`);
    if (!response.ok) return new Response(null, { status: response.status });
    return new Response(response.body, { headers: { "Content-Type": response.headers.get("content-type") || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400" } });
  } catch { return new Response(null, {status:502}); }
}
