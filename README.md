# Florida Customer Pulse App

An installable Progressive Web App for Florida cannabis market intelligence. The public application shell is separate from the private research archive.

## Account model

- Invitation-only accounts. Public self-registration must be disabled in Supabase Auth settings.
- Two roles: `admin` and `standard`.
- Administrators invite users by email, change roles, and suspend or restore accounts from the dashboard.
- Standard users can browse the dashboard but cannot manage accounts.
- Users do not need GitHub accounts or GitHub personal access tokens.
- The browser uses Supabase Auth sessions. It never receives the GitHub archive token or Supabase service-role key.

## Architecture

`Browser/PWA -> Supabase Auth -> authenticated Edge Functions -> private GitHub archive`

The `archive-read` Edge Function verifies the user's session and reads only paths under `archive/` using a server-side fine-grained GitHub token. The `admin-users` Edge Function checks the caller's `user_profiles.role` on every request before inviting users, listing accounts, changing roles, or suspending accounts. The database has row-level security and users can read only their own profile. Client-side role checks are presentation only; authorization is enforced server-side.

## Supabase setup (required before sign-in works)

1. Create a Supabase project on the free tier if available in your region/plan.
2. In Authentication settings, disable **Allow new users to sign up**. Invitations from the admin Edge Function remain the supported account-creation route.
3. Set the Site URL and allowed redirect URL to the exact HTTPS GitHub Pages app URL.
4. Run `supabase/schema.sql` in the Supabase SQL Editor.
5. Copy `config.example.js` to `config.js` and fill in the project's public Project URL and publishable/anon key. These are browser-public values; never use a service-role key here.
6. Link the project with `npx supabase link --project-ref YOUR_PROJECT_REF`, then deploy the Edge Functions with `npx supabase functions deploy archive-read` and `npx supabase functions deploy admin-users`.
7. Configure Edge Function secrets with `npx supabase secrets set` (run locally; do not paste values into chat): `GITHUB_ARCHIVE_READ_TOKEN` (fine-grained token restricted to `VYBN3D/curaleaf-customer-pulse`, Contents: Read-only), `APP_ORIGIN` (origin only, `https://vybn3d.github.io`) and `APP_URL` (full HTTPS app URL, `https://vybn3d.github.io/florida-customer-pulse-app/`). Supabase supplies its project URL and service-role key to Edge Functions automatically; never copy the service-role key into browser files.
8. Configure Supabase email/SMTP delivery and invitation redirect URLs. Use a verified sender for reliable delivery.
9. Invite the owner's email using the Supabase dashboard once, accept the invitation, then run the one-time administrator role update at the bottom of `schema.sql` with that exact email.
10. Test with a standard invitation and verify it cannot open the admin panel or invoke admin Edge Function actions.

The Supabase CLI is required for function deployment (`supabase link`, then `supabase functions deploy archive-read` and `supabase functions deploy admin-users`). Project linking and secret setup require the project owner's Supabase account. Do not paste service-role keys or GitHub tokens into chat or commit them to Git.

## Local development

`config.js` is intentionally git-ignored. Use `config.example.js` as a template. No secrets belong in the public repository.

## Data

The private archive remains in `VYBN3D/curaleaf-customer-pulse`. The app reads the private metadata index and fetches complete records on demand through the authenticated backend. Reddit entries remain limited to compliant public search-index previews; this app does not bypass source access restrictions.

## Install

- Android: open the HTTPS site in Chrome and choose Install app / Add to Home screen.
- iOS: open in Safari and choose Share > Add to Home Screen.
- macOS: Safari File > Add to Dock, or Chrome/Edge Install.
- Windows: Edge/Chrome Install this site as an app.

The application shell can be cached for offline launch. Authentication and private data require an internet connection.
