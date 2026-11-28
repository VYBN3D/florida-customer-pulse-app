import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") || "https://vybn3d.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY")!;
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization");
  if (!anonKey || !authorization) throw new Error("Could not verify administrator permissions.");

  // Read the caller's own profile under their authenticated JWT and existing RLS policy.
  // The service_role currently has no SELECT privilege on user_profiles.
  const profileClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await profileClient.from("user_profiles")
    .select("role").eq("user_id", result.user.id).single();
  if (error) {
    console.error("Admin profile lookup failed:", { code: error.code, message: error.message });
    throw new Error("Could not verify administrator permissions.");
  }
  if (data?.role !== "admin") throw new Error("Administrator permission is required.");
  return result;
}
