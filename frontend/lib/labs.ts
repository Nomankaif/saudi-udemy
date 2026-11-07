export async function publicLabCount(): Promise<number> {
  const response = await fetch(`${process.env.API_INTERNAL_URL || "http://localhost:4000/api"}/labs`, { cache: "no-store" });
  if (!response.ok) throw new Error("Labs are temporarily unavailable");
  const labs: unknown = await response.json();
  if (!Array.isArray(labs)) throw new Error("Unexpected labs response");
  return labs.length;
}
