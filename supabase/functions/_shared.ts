import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "https://vybn3d.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function clients() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { admin };
}

export async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Sign in is required.");
  const { admin } = clients();
  const { data, error } = await admin.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Your session is invalid or expired.");
  return { user: data.user, admin };
}

export async function requireAdmin(req: Request) {
  const result = await requireUser(req);
  const { data, error } = await result.admin.from("user_profiles")
    .select("role").eq("user_id", result.user.id).single();
  if (error || data?.role !== "admin") throw new Error("Administrator permission is required.");
  return result;
}
