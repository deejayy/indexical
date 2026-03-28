# Indexical

A browser extension and local server that automatically captures the content of every web page you visit and lets you search through it instantly with full-text search, spelling correction, and rich filtering.

All data stays on your machine. The server binds to `127.0.0.1` by default and never phones home (there is no home, actually).

## How It Works

1. **You browse the web normally.** The extension runs silently in the background, extracting the readable content of each page you visit (via Mozilla Readability), converting it to Markdown, and sending it to a local server.
2. **You search your history.** Click the toolbar icon or use a keyboard shortcut to open a search interface. Type a query using Google-like syntax and get ranked, highlighted results from pages you've actually read.
3. **You preview stored content.** On the full results page, click "Preview" on any result to see the stored Markdown rendered in a side panel — useful for pages that have since changed or gone offline.

The extension captures metadata too: title, author, excerpt, site name, favicon, language, published/modified dates, word count, and content hashes for deduplication.

## Features

### Search

- **Full-text search** with BM25 relevance ranking
- **Snippet highlighting** — matched terms are highlighted in context
- **Spelling correction** — automatic suggestions via SQLite spellfix1 ("Showing results for X instead of Y")
- **Date filtering** — past day, week, month, year, or all time
- **Search operators:**

| Syntax | Description | Example |
|--------|-------------|---------|
| `word` | Term search | `javascript` |
| `"exact phrase"` | Phrase match | `"machine learning"` |
| `-word` | Exclude term | `-spam` |
| `site:domain` | Filter by domain | `site:github.com` |
| `-site:domain` | Exclude domain | `-site:reddit.com` |
| `inurl:text` | Filter by URL | `inurl:blog` |
| `intitle:text` | Filter by title | `intitle:tutorial` |
| `lang:code` | Filter by language | `lang:de` |

### Capture

- Runs automatically on every page at `document_idle`
- Extracts clean article content via [Mozilla Readability](https://github.com/nicfontaine/nicfontaine) with DOM-walk fallback
- Converts to GFM Markdown via [Turndown](https://github.com/mixmark-io/turndown)
- Detects SPA navigation via MutationObserver and re-captures on significant content changes
- Client-side deduplication via content hashing (stable hash ignores timestamps/numbers)
- Rate-limited: max 60 ingests/minute, minimum 10 seconds between same-page captures
- Minimum 250 characters of content required

### Privacy

- **Domain blacklist** — block entire domains (subdomains included automatically). Default blacklist: `facebook.com`, `fb.com`, `tiktok.com`, `translate.google.com`, `youtube.com`, `gmail.com`, `outlook.com`, `mail.google.com`, `paypal.com`, `stripe.com`
- **Local only** — all data stored in a local SQLite database, server binds to localhost
- **Skips internal pages** — `about:`, `chrome:`, `chrome-extension:`, `moz-extension:`, `file:` URLs are never captured
- **No analytics, no telemetry, no external requests** from either the extension or the server

### UI

- **Popup** — quick search from the toolbar icon (5 results)
- **Full results page** — opens in a tab with 20 results, date range filtering, spelling corrections, and a Markdown preview panel
- **Options page** — configure daemon URL, API key, and domain blacklist
- **Dark mode** — automatic, follows your system preference
- **Daemon status** — red badge on the toolbar icon when the server is unreachable

## Supported Browsers

| Browser | Status | Notes |
|---------|--------|-------|
| Firefox | Supported | Manifest V3 event page. Load via `about:debugging` or install `.xpi`. |
| Chrome | Supported | Manifest V3 service worker. Load unpacked or install `.zip`. |
| Edge, Brave, etc. | Should work | Any Chromium-based browser that supports MV3 and `chrome.*` APIs. |

## Getting Started

### 1. Start the Server

The server requires [Node.js](https://nodejs.org/) 22 or later.

```bash
cd server
npm install
npm start
```

The server starts on `http://127.0.0.1:11435` and creates `indexical.db` in the server directory. Migrations run automatically on first start.

The spellfix1 SQLite extension is bundled for Windows (x64, x86, ARM64), macOS (x64/ARM64 universal), and Linux (x64, x86) in `server/lib/`. It loads automatically.

### 2. Install the Extension

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `extension/src/manifest.json`

**Chrome / Chromium:**
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/src/` directory

The extension generates an API key automatically on first run. Both the daemon URL and API key are configurable in the extension's Options page.

### 3. Verify

Click the Indexical icon in your toolbar. If the daemon is running and reachable, you'll see the search interface without any warning banner. Browse a few pages, then try searching.

## Server

### Running with Docker

```bash
cd server
docker compose up -d
```

This binds port `11435`, stores data in a named volume (`indexical-data`), and includes a health check. The container uses `tini` as PID 1 for proper signal handling.

### Running as a Standalone Bundle

```bash
cd server
npm run bundle
```

Produces `dist/bundle/` — a self-contained directory with the Node.js binary, compiled code, production dependencies, spellfix1 libraries, and launcher scripts (`indexical` / `indexical.cmd` / `indexical.ps1`). No system Node.js required.

### Running as a Single Executable

```bash
cd server
npm run build:sea
```

Produces `dist/indexical.exe` (Windows) — a true single-file executable. Native addons and migration files are embedded as SEA assets and extracted to a temp directory at runtime.

### Configuration

All settings have sensible defaults. Override via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `11435` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `DB_PATH` | `./indexical.db` | SQLite database path |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `MAX_FIELD_BYTES` | `2097152` (2 MB) | Max size per text field |
| `MAX_BODY_BYTES` | `4194304` (4 MB) | Max request body size |
| `REQUEST_TIMEOUT_MS` | `30000` | Request timeout |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `300` | Max requests per window |
| `SPELLFIX1_DLL` | `./lib/spellfix1` | Path to spellfix1 library (no file extension) |
| `MIGRATIONS_DIR` | `<auto>` | Override path to SQL migration files |

### Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/ingest` | POST | Required | Store a captured page |
| `/search` | POST | Required | Full-text search |
| `/pages/:id/markdown` | GET | Required | Fetch stored Markdown for preview |
| `/health` | GET | Public | Health check |
| `/stats` | GET | Public | Aggregate statistics |
| `/metrics` | GET | Public | Prometheus metrics |

Authentication is via the `X-API-Key` header. The same key the extension generates is used to scope all data — each key's pages are isolated.

### Observability

- **Structured logging** — JSON via pino, compatible with Loki. Includes `http_method`, `http_path`, `http_status`, `latency_ms`, `trace_id`, `span_id`.
- **Prometheus metrics** — all metric names prefixed with `wmd_`. Scrape `/metrics`.
- **W3C traceparent** — the extension sends a `traceparent` header on every request for distributed tracing correlation.
- **Rate limit headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response.

## Building the Extension

The extension is plain JavaScript with no build step. For distribution archives:

```bash
cd extension
_build.bat
```

Produces `dist/indexical.xpi` (Firefox) and `dist/indexical-chrome.zip` (Chrome). Requires `7za` on PATH.

## Keyboard Shortcuts

| Context | Shortcut | Action |
|---------|----------|--------|
| Popup | `Enter` | Search in popup |
| Popup | `Shift+Enter` | Open search in full page |
| Options | `Ctrl+S` / `Cmd+S` | Save settings |
| Browser | Configurable | Open full results page (set in browser's extension shortcuts) |

## Architecture

```
extension/          Browser extension (Manifest V3, plain JS, no build step)
  src/
    manifest.json   MV3 manifest (dual Firefox/Chrome support)
    background.js   Service worker / event page (health polling, alarms)
    content.js      Content script (Readability, capture, MutationObserver)
    popup.html/js   Toolbar popup UI
    results.html/js Full results page UI
    options.html/js Settings page UI
    utils.js        Shared utilities (result rendering, highlighting)
    styles.css      All styles (light + dark mode)
    *.js            Vendored libraries (Readability, Turndown, marked, DOMPurify)

server/             Node.js daemon (Express, TypeScript, SQLite)
  src/
    server.ts       Entry point (startup, graceful shutdown)
    app.ts          Express app factory, dependency injection
    config.ts       Environment-based configuration
    routes/         Route handlers (ingest, search, pages, health, stats, metrics)
    services/       Business logic (ingest, search)
    query/          Search query parser (operators, phrases, filters)
    db/             Schema, migrations, database setup
    metrics/        Prometheus registry and collectors
    errors.ts       Structured error factories
    types.ts        Shared TypeScript types
  lib/              Pre-built spellfix1 binaries (all platforms)
  Dockerfile        Multi-stage Docker build
  docker-compose.yml  One-command deployment
```

