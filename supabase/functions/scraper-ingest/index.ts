import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared.ts";

const allowed = new Set(["mentions", "mention_comments", "menu_items", "menu_stores", "ommu_market", "source_status", "google_reviews_cache", "meta_page_posts", "meta_page_comments", "meta_page_status", "weedmaps_menus", "weedmaps_products", "weedmaps_reviews", "sweed_menu_items", "sweed_menu_stores", "sweed_menu_categories"]);
function tokenMatches(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const expected = Deno.env.get("SCRAPER_INGEST_TOKEN") || "";
  const supplied = req.headers.get("x-ingest-token") || "";
  if (!expected || !supplied || !tokenMatches(expected, supplied)) return json({ error: "Ingestion authorization failed." }, 401);
  try {
    const body = await req.json();
    if (!body || typeof body.run_id !== "string" || body.run_id.length > 128 || !Array.isArray(body.records) || body.records.length > 200 || JSON.stringify(body).length > 1_500_000) {
      return json({ error: "Invalid payload. Send a run_id and at most 250 records." }, 400);
    }
    const rows = body.records.map((r: any) => {
      if (!r || !allowed.has(r.record_type) || typeof r.record_id !== "string" || !r.record_id || r.record_id.length > 512 ||
          typeof r.record_hash !== "string" || !/^[a-f0-9]{64}$/.test(r.record_hash) || !r.payload || typeof r.payload !== "object" || Array.isArray(r.payload)) {
        throw new Error("A record is missing a valid type, ID, hash, or object payload.");
      }
      return { record_type: r.record_type, record_id: r.record_id, record_hash: r.record_hash,
        payload: r.payload, source_updated_at: typeof r.source_updated_at === "string" ? r.source_updated_at : null };
    });
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Ingestion database is not configured." }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    if (rows.length) {
      const { error } = await admin.from("pulse_records").upsert(rows, { onConflict: "record_type,record_id" });
      if (error) return json({ error: "Database write failed: " + error.message }, 500);
    }
    // Mark the run fresh only after the final batch has been written successfully.
    if (body.complete !== true) return json({ ok: true, accepted: rows.length, run_id: body.run_id, complete: false });
    const counts = body.record_counts && typeof body.record_counts === "object" ? body.record_counts : {};
    const { error: stateError } = await admin.from("pulse_sync_state").upsert({
      id: "scraper", last_success_at: new Date().toISOString(), last_run_id: body.run_id,
      last_batch_records: rows.length, record_counts: counts, updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (stateError) return json({ error: "Records were accepted but sync status could not be updated: " + stateError.message }, 500);
    return json({ ok: true, accepted: rows.length, run_id: body.run_id, complete: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid ingestion request.";
    return json({ error: message }, 400);
  }
});
