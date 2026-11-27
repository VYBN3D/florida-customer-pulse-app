import { corsHeaders, json, requireAdmin } from "../_shared.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const { admin, user } = await requireAdmin(req);
    const body = await req.json();
    const action = body?.action;

    if (action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
      const appUrl = Deno.env.get("APP_URL");
      if (!appUrl || !appUrl.startsWith("https://")) return json({ error: "Secure app URL is not configured." }, 503);
      const { data, error } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo: appUrl, data: { invited_by: user.id } },
      });
      if (error) return json({ error: error.message }, 400);
      const tokenHash = data.properties?.hashed_token;
      if (!tokenHash) return json({ error: "Supabase did not return an invitation token." }, 502);
      const invitationUrl = new URL(appUrl);
      invitationUrl.hash = new URLSearchParams({ token_hash: tokenHash, type: "invite" }).toString();
      return json({ ok: true, invited: data.user?.email || email, invitation_url: invitationUrl.toString() });
    }

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) return json({ error: "Could not load user list." }, 502);
      const ids = data.users.map((u) => u.id);
      const { data: profiles, error: profileError } = await admin.from("user_profiles")
        .select("user_id,email,role,created_at").in("user_id", ids);
      if (profileError) return json({ error: "Could not load account roles." }, 502);
      const byId = new Map((profiles || []).map((p) => [p.user_id, p]));
      return json({ users: data.users.map((u) => ({
        id: u.id, email: u.email, role: byId.get(u.id)?.role || "standard",
        created_at: u.created_at, invited_at: u.invited_at,
        last_sign_in_at: u.last_sign_in_at, banned_until: u.banned_until,
      })) });
    }

    if (action === "role") {
      const targetId = String(body.userId || "");
      const role = body.role;
      if (!targetId || !["admin", "standard"].includes(role)) return json({ error: "Invalid account or role." }, 400);
      if (targetId === user.id && role !== "admin") return json({ error: "You cannot remove your own administrator role." }, 400);
      const { error } = await admin.from("user_profiles").update({ role, updated_at: new Date().toISOString() }).eq("user_id", targetId);
      if (error) return json({ error: "Could not update account role." }, 400);
      return json({ ok: true });
    }

    if (action === "suspend" || action === "restore") {
      const targetId = String(body.userId || "");
      if (!targetId || targetId === user.id) return json({ error: "Invalid account. You cannot suspend your own account." }, 400);
      const banned_until = action === "suspend" ? "2999-01-01T00:00:00Z" : "none";
      const { error } = await admin.auth.admin.updateUserById(targetId, { ban_duration: action === "suspend" ? "876000h" : "none" });
      if (error) return json({ error: "Could not update account status." }, 400);
      return json({ ok: true, banned_until });
    }

    return json({ error: "Unknown administrator action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return json({ error: message }, message.includes("Sign in") || message.includes("session") ? 401 : 403);
  }
});
