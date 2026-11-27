import { clients, corsHeaders, json, requireAdmin } from "../_shared.ts";
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const workerAuthorized = (req: Request) => {
  const expected = Deno.env.get("SCRAPER_PORTAL_INGEST_TOKEN") || "";
  const supplied = req.headers.get("x-ingest-token") || "";
  return !!expected && safeEqual(expected, supplied);
};
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin } = clients();
    // The Mac worker uses its dedicated secret, never a browser credential.
    if (workerAuthorized(req)) {
      if (req.method === "GET") {
        const { data: pending, error: readError } = await admin.from("scraper_portal_commands")
          .select("id,action").eq("status", "queued").order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (readError) throw readError;
        if (!pending) return json({ command: null });
        const { data: claimed, error: claimError } = await admin.from("scraper_portal_commands")
          .update({ status: "claimed", claimed_at: new Date().toISOString() })
          .eq("id", pending.id).eq("status", "queued").select("id,action").maybeSingle();
        if (claimError) throw claimError;
        return json({ command: claimed || null });
      }
      if (req.method === "POST") {
        const body = await req.json();
        if (typeof body?.id !== "string" || !["succeeded", "failed"].includes(body?.status)) return json({ error: "Invalid command result." }, 400);
        const result = typeof body.result === "string" ? body.result.slice(0, 1200) : "";
        const { error } = await admin.from("scraper_portal_commands").update({ status: body.status, result, completed_at: new Date().toISOString() }).eq("id", body.id).eq("status", "claimed");
        if (error) throw error;
        return json({ ok: true });
      }
      return json({ error: "Method not allowed." }, 405);
    }
    // All browser actions and reads require an active administrator session.
    const { user } = await requireAdmin(req);
    if (req.method === "GET") {
      const { data, error } = await admin.from("scraper_portal_commands")
        .select("id,action,status,created_at,claimed_at,completed_at,result")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return json({ command: data || null });
    }
    if (req.method === "POST") {
      const body = await req.json();
      const action = body?.action;
      if (action !== "start" && action !== "stop") return json({ error: "Choose start or stop." }, 400);
      const { data: pending, error: pendingError } = await admin.from("scraper_portal_commands")
        .select("id,status").in("status", ["queued", "claimed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (pendingError) throw pendingError;
      if (pending) return json({ error: "A scraper command is already being processed. Please wait for it to finish." }, 409);
      const { data, error } = await admin.from("scraper_portal_commands")
        .insert({ action, created_by: user.id }).select("id,action,status,created_at").single();
      if (error) throw error;
      return json({ command: data }, 202);
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = message.includes("Administrator permission") ? 403 : message.includes("Sign in") || message.includes("session") ? 401 : 500;
    return json({ error: status === 500 ? "The remote scraper control request failed." : message }, status);
  }
});
