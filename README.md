# Florida Customer Pulse App

An installable Progressive Web App for Android, macOS and Windows. The public repository contains only the application shell. Research records remain in the private GitHub repository.

## What the app can browse

After connecting an authorized read-only token, the app loads a compact metadata index from the private archive and lets users search and filter:

- 700 community mentions, with source, date, sentiment and indexed text previews
- 7,052 menu product listings, searchable by product, strain, format, type and store
- 82 store records
- 301 official OMMU market benchmark records

Selecting a result fetches its full JSON record directly from the private repository. The public app repository contains neither the index nor the underlying private records. The private index contains searchable metadata and file paths only; it is not a second copy of full record content.

The token is entered by each user, held in browser memory only, and used directly by the browser to call GitHub. It is not stored in browser storage or sent to this app's hosting server. Other users need explicit access to the private data repository and their own fine-grained token.

## Install

- Android: open the site in Chrome and choose Install app / Add to Home screen.
- macOS: open in Safari and choose File > Add to Dock, or use Chrome/Edge Install.
- Windows: open in Edge or Chrome and choose Install this site as an app.

The app shell is cached for offline launch. Private data requires an internet connection and valid GitHub access.

## Private data connection

Create a fine-grained personal access token with repository access limited to `VYBN3D/curaleaf-customer-pulse` and repository permission `Contents: Read-only`. No write permissions are required. Disconnect or close the tab to clear the in-memory token.

## Data notes

Community entries are archive records and may be search-index previews rather than complete source posts. Reddit records are limited to compliant public search-index previews; this app does not bypass Reddit's automated access restrictions. OMMU benchmarks are shown separately from customer sentiment.

## Development

Static PWA, hosted with GitHub Pages. No paid APIs, hosting or runtime services are required.
