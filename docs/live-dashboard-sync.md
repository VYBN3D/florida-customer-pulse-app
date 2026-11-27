# Florida Customer Pulse: secure live scraper sync

## Architecture

- The Curaleaf collector remains local on the Mac and runs on its existing 15-minute collection cycle.
- After each collection cycle, `scripts/supabase_sync.py` compares the local SQLite database with a local SHA-256 hash manifest and sends only changed records outbound to the private `scraper-ingest` Supabase Edge Function.
- The Edge Function authenticates a dedicated random ingestion token and writes with the server-side Supabase service role. The service-role key is never stored in the scraper config or sent to the browser.
- Invited dashboard users read data through Supabase Auth and row-level security. Anonymous users cannot read `pulse_records` or `pulse_sync_state`.
- The GitHub archive remains an independent backup and fallback. It is not the live dashboard transport. The dashboard checks the sync timestamp every two minutes while the page is visible and automatically reloads when a new scraper run completes. The refresh button can also reload records already received by Supabase; neither action forces a new local scrape.

## Data transferred

The private `pulse_records` table supports: `mentions`, `mention_comments`, `menu_items`, `menu_stores`, `ommu_market`, `source_status`, `google_reviews_cache`, `meta_page_posts`, `meta_page_comments`, `meta_page_status`, `weedmaps_menus`, `weedmaps_products`, `weedmaps_reviews`, `sweed_menu_items`, `sweed_menu_stores`, and `sweed_menu_categories`. Empty tables are still represented in sync counts so a missing connector is not mistaken for successful customer coverage.

Mention and review records receive `entity_tags` during local sync. Tags identify matched Florida operators, Curaleaf portfolio brands, exact product names, strains, stores and product categories. Matching is evidence-based against the record text and the current local menu catalog; unmentioned products are not inferred.

The dashboard combines community previews, authorized review/comment records and Curaleaf-owned social posts while keeping their source labels distinct. Reddit search-index snippets remain previews, not complete Reddit posts. Company-owned posts and news are not counted as customer sentiment. Google and Weedmaps star ratings are labeled as rating-derived when present.

## Weekly Florida market measures

The overview displays Curaleaf's latest official OMMU weekly THC milligrams dispensed, smokable-flower ounces dispensed, share of reported THC, and an eight-week trend. The separate market table retains operator-level report records. These are regulated Florida medical-market dispensation measures, not revenue, retail sell-through, adult-use sales or customer sentiment.

## Secure activation

1. Apply the live-data migration to the linked Supabase project.
2. Set the dedicated `SCRAPER_INGEST_TOKEN` Edge Function secret and the matching value in the ignored local `config/supabase_sync.env` file.
3. Deploy `scraper-ingest` with JWT verification disabled only because the function performs its own constant-time token check.
4. Run `python3 scripts/supabase_sync.py` to seed the live database.
5. Restart the Curaleaf worker so every subsequent collection cycle also syncs changes.
6. Keep the GitHub archive backup and `archive-read` fallback until the live path has been observed across multiple collection cycles.

## Safety and limitations

- The web app never connects to the Mac, opens a local port, or controls the scraper. The Mac makes outbound HTTPS requests only.
- The ingestion token is stored only in ignored local config and as a Supabase Edge Function secret. Never put it in `config.js`, browser JavaScript or Git.
- The Edge Function allowlists record types, validates record IDs and SHA-256 hashes, limits each request to 200 records and 1.5 MB, and upserts by `(record_type, record_id)`.
- The sender batches at most 200 records and 1.2 MB per request, marks a sync fresh only after the final batch succeeds, and advances its local hash manifest only after every batch succeeds.
- A source marked `OK` means its last request succeeded, not that it returned reviews or complete coverage. Search-index previews, full text, direct APIs and unavailable connectors are explicitly distinguished.
- The public menu sitemap does not establish live inventory or prices when those fields are absent.
