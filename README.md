# <img src="./extension/assets/favicon.png" height="32"> Indexical

A browser extension and local server that automatically captures the content of every web page you visit and lets you search through it instantly with full-text search, spelling correction, and rich filtering.

All data stays on your machine. The server binds to `127.0.0.1` by default and never phones home (there is no home, actually).

## Supported Platforms

### Browser Extension

| Browser | Status | Install |
|---------|--------|---------|
| Firefox | Supported | [Install from AMO](https://addons.mozilla.org/en-US/firefox/addon/indexical/) or download `indexical-firefox-vX.Y.Z.xpi` from [Releases](../../releases) |
| Chrome | Supported | Download `indexical-chromium-vX.Y.Z.zip` from [Releases](../../releases) ([instructions](#2-install-the-extension)) |
| Edge, Brave, etc. | Should work | Any Chromium-based browser that supports MV3 |

### Server Deployment

| Method | Platform | What you get |
|--------|----------|--------------|
| **Single executable** | Windows, macOS, Linux | Download from [Releases](../../releases) and run. No dependencies. |
| **Docker** | Linux, macOS, Windows | `docker compose up -d` — container with health checks, named volume, auto-restart. |
| **From source** | Windows, macOS, Linux | `npm install && npm start` — requires Node.js 22+. |

The spellfix1 SQLite extension (for spelling correction) is bundled for Windows (x64, x86, ARM64), macOS (x64/ARM64 universal), and Linux (x64, x86).

## How It Works

1. **You browse the web normally.** The extension runs silently in the background, extracting the readable content of each page you visit (via Mozilla Readability), converting it to Markdown, and sending it to a local server.
2. **You search your history.** Click the toolbar icon or use a keyboard shortcut to open a search interface. Type a query using Google-like syntax and get ranked, highlighted results from pages you've actually read.
3. **You preview stored content.** On the full results page, click "Preview" on any result to see the stored Markdown rendered in a side panel — useful for pages that have since changed or gone offline.

The extension captures metadata too: title, author, excerpt, site name, favicon, language, published/modified dates, word count, and content hashes for deduplication.

## Features

<table>
  <tr>
    <td valign="top">A separate tab:<br/><br/><img width="1280" height="805" alt="image" src="https://github.com/user-attachments/assets/3bec0094-a162-469c-aa22-89cd57d52f64" /></td>
    <td valign="top">As extension popup:<br/><br/><img width="376" height="537" alt="image" src="https://github.com/user-attachments/assets/923896be-bb62-42a0-9e8e-3d5703f4ab6e" /></td>
  </tr>
</table>

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
- Extracts clean article content via [Mozilla Readability](https://github.com/mozilla/readability) with DOM-walk fallback
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

## Getting Started

### 1. Start the Server

Pick whichever deployment method suits you (see [Server](#server) for details on each):

- **Single executable:** download from [Releases](../../releases) and run it.
- **Docker:** `cd server && docker compose up -d`
- **From source:** `cd server && npm install && npm start` (requires [Node.js](https://nodejs.org/) 22+)

The server starts on `http://127.0.0.1:11435` and creates `indexical.db` in the working directory. Migrations run automatically on first start.

### 2. Install the Extension

**Firefox:**

Install from [AMO](https://addons.mozilla.org/en-US/firefox/addon/indexical/), or download `indexical-firefox-vX.Y.Z.xpi` from [Releases](../../releases) and open it in Firefox.

(or load temporarily for development: `about:debugging` → Load Temporary Add-on → `extension/src/manifest.json`)

**Chrome / Chromium:**
1. Download `indexical-chromium-vX.Y.Z.zip` from [Releases](../../releases)
2. Extract the zip into a directory
3. Open `chrome://extensions`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the directory you extracted the zip into

The extension generates an API key automatically on first run (this is important for the temporary extension approach, every load counts as "first run"). Both the daemon URL and API key are configurable in the extension's Options page (so you can save it to have permanent identity or access the same history from multiple browsers).

### 3. Verify

Click the Indexical icon in your toolbar. If the daemon is running and reachable, you'll see the search interface without any warning banner. Browse a few pages, then try searching.

## Server

### Single Executable

Pre-built binaries for Windows (x64), macOS (ARM64), and Linux (x64) are available on the [Releases](../../releases) page. Download and run — no installation, no dependencies.

To build it yourself:

```bash
cd server
npm run build:sea
```

Produces `dist/indexical-server` (or `.exe` on Windows) — a true single-file executable. Native addons and migration files are embedded as SEA assets and extracted to a temp directory at runtime.

### Docker

```bash
cd server
docker compose up -d
```

Binds port `11435`, stores data in a named volume (`indexical-data`), includes a health check, and restarts automatically. The container uses `tini` as PID 1 for proper signal handling.

### From Source

Requires [Node.js](https://nodejs.org/) 22 or later.

```bash
cd server
npm install
npm start
```

### Standalone Bundle

```bash
cd server
npm run bundle
```

Produces `dist/bundle/` — a self-contained directory with the Node.js binary, compiled code, production dependencies, spellfix1 libraries, and launcher scripts (`indexical` / `indexical.cmd` / `indexical.ps1`). No system Node.js required.

### Running as a Windows Service

To have Indexical start automatically on boot and run in the background, install the executable as a Windows service. Two options:

#### Option A — NSSM (recommended)

[NSSM](https://nssm.cc/) (Non-Sucking Service Manager) is a lightweight tool for running any executable as a service.

```powershell
# Install the service
nssm install Indexical C:\path\to\indexical.exe

# Optional: set environment variables
nssm set Indexical AppEnvironmentExtra DB_PATH=C:\ProgramData\Indexical\indexical.db
nssm set Indexical AppEnvironmentExtra +LOG_LEVEL=info

# Optional: configure output logging
nssm set Indexical AppStdout C:\ProgramData\Indexical\service.log
nssm set Indexical AppStderr C:\ProgramData\Indexical\service.log

# Start the service
nssm start Indexical
```

To remove: `nssm remove Indexical confirm`

#### Option B — PowerShell (no extra tools)

Requires an elevated (Administrator) shell. Uses the built-in `New-Service` cmdlet.

```powershell
New-Service -Name "Indexical" `
  -BinaryPathName "C:\path\to\indexical.exe" `
  -DisplayName "Indexical" `
  -Description "Indexical local search daemon" `
  -StartupType Automatic

Start-Service Indexical
```

To remove:

```powershell
Stop-Service Indexical
sc.exe delete Indexical
```

> **Note:** `New-Service` expects the executable to implement the Windows Service Control Manager protocol. Node.js SEA binaries don't do this natively, so the service may report a startup timeout warning — but the process will still run. If this is a problem, use NSSM instead.

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

The extension is plain JavaScript with no build step. Pre-built archives are available on the [Releases](../../releases) page (`indexical-firefox-vX.Y.Z.xpi` and `indexical-chromium-vX.Y.Z.zip`). For local builds:

```bash
cd extension
build.bat
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
