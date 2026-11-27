import { corsHeaders, json, requireUser } from "../_shared.ts";
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    await requireUser(req);
    const body = await req.json();
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (query.length < 2 || query.length > 100 || /[\u0000-\u001f]/.test(query)) return json({ error: "Enter a search phrase between 2 and 100 characters." }, 400);
    const token = Deno.env.get("GITHUB_CORPUS_READ_TOKEN");
    if (!token) return json({ error: "Corpus search is waiting for its read-only GitHub connection." }, 503);
    const q = `${query} repo:VYBN3D/cannabis-knowledge-corpus`;
    const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=20`;
    const response = await fetch(url, { headers: {
      "Accept": "application/vnd.github.text-match+json",
      "Authorization": `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VYBN-Cannabis-Research-Portal",
    }});
    if (!response.ok) {
      const status = response.status === 403 || response.status === 429 ? 503 : response.status === 422 ? 400 : 502;
      return json({ error: status === 503 ? "Corpus search is temporarily rate-limited. Try again shortly." : "The private corpus search request failed." }, status);
    }
    const data = await response.json();
    const results = (data.items || []).map((item: any) => ({
      name: item.name,
      path: item.path,
      url: item.html_url,
      repository: item.repository?.full_name || "VYBN3D/cannabis-knowledge-corpus",
      matches: (item.text_matches || []).slice(0, 3).map((match: any) => String(match.fragment || "").slice(0, 1200)),
    }));
    return json({ total_count: data.total_count || 0, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    return json({ error: message.includes("Sign in") || message.includes("session") ? "Please sign in again." : "Corpus search could not be completed." }, message.includes("Sign in") || message.includes("session") ? 401 : 500);
  }
});
