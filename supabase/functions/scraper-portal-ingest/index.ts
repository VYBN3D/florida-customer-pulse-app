import { clients, corsHeaders, json } from "../_shared.ts";
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const expected = Deno.env.get("SCRAPER_PORTAL_INGEST_TOKEN") || "";
    const supplied = req.headers.get("x-ingest-token") || "";
    if (!expected || !safeEqual(expected, supplied)) return json({ error: "Unauthorized." }, 401);
    const raw = await req.text();
    if (raw.length > 300_000) return json({ error: "Status payload too large." }, 413);
    const payload = JSON.parse(raw);
    if (!payload || payload.schema_version !== 1 || !payload.pipeline || !Array.isArray(payload.collectors) || !Array.isArray(payload.datasets)) {
      return json({ error: "Invalid portal status payload." }, 400);
    }
    if (payload.collectors.length > 80 || payload.datasets.length > 100) return json({ error: "Portal status limits exceeded." }, 400);
    const { admin } = clients();
    const { error } = await admin.from("scraper_portal_state").upsert({ id: "latest", payload, updated_at: new Date().toISOString() });
    if (error) throw error;
    return json({ ok: true, updated_at: new Date().toISOString() });
  } catch (_error) {
    return json({ error: "Portal status update failed." }, 500);
  }
});
