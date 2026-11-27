import { corsHeaders, json, requireUser } from "../_shared.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    await requireUser(req);
    const { path } = await req.json();
    if (typeof path !== "string" || !path.startsWith("archive/") ||
        path.includes("..") || path.startsWith("/") ||
        !/^[A-Za-z0-9._/-]+$/.test(path)) {
      return json({ error: "Archive path is not permitted." }, 400);
    }
    const token = Deno.env.get("GITHUB_ARCHIVE_READ_TOKEN");
    if (!token) return json({ error: "Archive service is not configured." }, 503);
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`https://api.github.com/repos/VYBN3D/curaleaf-customer-pulse/contents/${encodedPath}`, {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Florida-Customer-Pulse",
      },
    });
    if (!response.ok) {
      const status = response.status === 404 ? 404 : response.status === 403 ? 503 : 502;
      return json({ error: status === 404 ? "Archive file not found." : "Private archive request failed." }, status);
    }
    const result = await response.json();
    return json({ name: result.name, path: result.path, encoding: result.encoding, content: result.content, sha: result.sha });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    return json({ error: message }, message.includes("Sign in") || message.includes("session") ? 401 : 403);
  }
});
