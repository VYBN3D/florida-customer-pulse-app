# Florida Customer Pulse App

An installable Progressive Web App for Android, macOS and Windows.

- Public app shell only. No research records, SQLite databases, API credentials, tokens or scraper source are included.
- Private research archive remains in https://github.com/VYBN3D/curaleaf-customer-pulse.
- GitHub token is entered by the user, held in memory only, and used directly by the browser to verify read-only access to the private archive catalog.
- The token is not stored in browser storage and is not sent to this app's hosting server.
- Other users need explicit access to the private data repository and their own fine-grained read-only token to see private archive counts.

## Install

After GitHub Pages deployment:
- Android: open the site in Chrome and choose Install app / Add to Home screen.
- macOS: open in Safari and choose File > Add to Dock, or use Chrome/Edge Install.
- Windows: open in Edge or Chrome and choose Install this site as an app.

The app shell is cached for offline launch. Private data requires an internet connection and valid GitHub access.

## Private data connection

Create a fine-grained personal access token with:
- Repository access: only VYBN3D/curaleaf-customer-pulse
- Repository permissions: Contents = Read-only
- No write permissions

Paste the token into the app's Connect private data dialog. Disconnect or close the tab to clear the in-memory token.

## Data limitations

The first public build verifies private archive access and reads archive/catalog.json for record counts. It does not yet render individual archived records. The private archive is not mirrored or copied into this public app repository.

## Development

This is a static PWA. No paid APIs, hosting or runtime services are required. GitHub Pages deploys the site using .github/workflows/pages.yml.
