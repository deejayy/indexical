// Results page script

const resultsLogger = createLogger("results");

let lastQuery = null;

function dateRangeFrom(preset) {
  if (!preset) return undefined;
  const now = new Date();
  const offsets = { day: 1, week: 7, month: 30, year: 365 };
  const days = offsets[preset];
  if (!days) return undefined;
  return new Date(now - days * 864e5).toISOString();
}

function renderCorrections(corrections) {
  const entries = corrections && typeof corrections === "object"
    ? Object.entries(corrections).filter(([k, v]) => k && v && k !== v)
    : [];

  const el = document.getElementById("corrections-notice");
  if (!entries.length) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }

  el.textContent = "";

  const label = document.createTextNode("Showing results for ");
  el.appendChild(label);

  entries.forEach(([original, replacement], i) => {
    if (i > 0) el.appendChild(document.createTextNode(", "));
    const replacementSpan = document.createElement("span");
    replacementSpan.className = "correction-replacement";
    replacementSpan.textContent = replacement;
    el.appendChild(replacementSpan);

    el.appendChild(document.createTextNode(" (instead of "));
    const originalSpan = document.createElement("span");
    originalSpan.className = "correction-term";
    originalSpan.textContent = original;
    el.appendChild(originalSpan);
    el.appendChild(document.createTextNode(")"));
  });

  el.style.display = "block";
}

async function openPreview(result) {
  const pane = document.getElementById("results-pane");
  const body = document.getElementById("preview-body");
  const title = document.getElementById("preview-panel-title");

  title.textContent = result.title || "Preview";
  body.innerHTML = "";
  pane.classList.add("preview-open");

  const loadingEl = document.createElement("div");
  loadingEl.className = "loading";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  loadingEl.appendChild(spinner);
  loadingEl.appendChild(document.createTextNode("Loading preview…"));
  body.appendChild(loadingEl);

  try {
    const config = await getConfig();
    const traceparent = generateTraceParent();
    const res = await fetch(`${config.daemonUrl}/pages/${result.id}/markdown`, {
      headers: {
        "X-API-Key": config.userId,
        "traceparent": traceparent,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { contentMarkdown } = await res.json();
    body.innerHTML = "";
    if (contentMarkdown) {
      body.innerHTML = DOMPurify.sanitize(marked.parse(contentMarkdown));
    } else {
      const msg = document.createElement("div");
      msg.className = "no-results";
      msg.textContent = "No preview available for this page.";
      body.appendChild(msg);
    }
  } catch (e) {
    body.innerHTML = "";
    const msg = document.createElement("div");
    msg.className = "error";
    msg.textContent = `Failed to load preview: ${e.message}`;
    body.appendChild(msg);
  }
}

function closePreview() {
  const pane = document.getElementById("results-pane");
  const body = document.getElementById("preview-body");
  pane.classList.remove("preview-open");
  body.innerHTML = "";
}

// Perform search
async function doSearch(query) {
  const resultsDiv = document.getElementById("results");
  const statsDiv = document.getElementById("stats");
  const searchBtn = document.getElementById("searchBtn");

  if (!query || !query.trim()) {
    resultsDiv.innerHTML =
      '<div class="no-results">Please enter a search query</div>';
    statsDiv.style.display = "none";
    return;
  }

  resultsDiv.innerHTML =
    '<div class="loading"><div class="spinner"></div>Searching your memory...</div>';
  statsDiv.style.display = "none";
  renderCorrections(null);
  searchBtn.disabled = true;

  const startTime = Date.now();

  // Load configuration
  const config = await getConfig();
  const traceparent = generateTraceParent();

  try {
    const res = await fetch(`${config.daemonUrl}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.userId,
        "traceparent": traceparent,
      },
      body: JSON.stringify(Object.assign(
        { query, k: 20 },
        dateRangeFrom(document.getElementById("dateRange").value)
          ? { from: dateRangeFrom(document.getElementById("dateRange").value) }
          : {}
      )),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    notifyHealth(true);
    const searchTime = ((Date.now() - startTime) / 1000).toFixed(2);

    resultsDiv.innerHTML = "";
    closePreview();
    renderCorrections(data.corrections);

    if (!data.results || !data.results.length) {
      const noResultsDiv = document.createElement("div");
      noResultsDiv.className = "no-results";
      noResultsDiv.textContent = `No results found for "${query}"`;
      resultsDiv.appendChild(noResultsDiv);
      statsDiv.style.display = "none";
      return;
    }

    // Show stats
    statsDiv.textContent = `About ${data.results.length} results (${searchTime} seconds)`;
    statsDiv.style.display = "block";

    // Display results
    data.results.forEach((r) => {
      resultsDiv.appendChild(
        createResultElement(r, true, { onPreview: openPreview })
      );
    });
  } catch (e) {
    notifyHealth(false);
    resultsLogger.error({
      query,
      traceparent,
      error: e.message,
      stack: e.stack,
      msg: "Search error",
    });
    const config = await getConfig();

    // Safe error display - no innerHTML
    resultsDiv.innerHTML = "";
    const errorDiv = document.createElement("div");
    errorDiv.className = "error";

    const errorTitle = document.createElement("strong");
    errorTitle.textContent = "Error: ";
    errorDiv.appendChild(errorTitle);

    const errorMsg = document.createTextNode(e.message);
    errorDiv.appendChild(errorMsg);

    const errorHint = document.createElement("div");
    errorHint.textContent = `Make sure the daemon is running at ${config.daemonUrl}`;
    errorHint.style.marginTop = "10px";
    errorDiv.appendChild(errorHint);

    resultsDiv.appendChild(errorDiv);
    statsDiv.style.display = "none";
  } finally {
    searchBtn.disabled = false;
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  const queryInput = document.getElementById("query");
  const searchBtn = document.getElementById("searchBtn");

  document.getElementById("preview-close-btn").addEventListener("click", closePreview);

  // Get query from URL params if present
  const urlParams = new URLSearchParams(window.location.search);
  const initialQuery = urlParams.get("q");

  if (initialQuery) {
    queryInput.value = initialQuery;
    doSearch(initialQuery);
  }

  // Event listeners
  searchBtn.addEventListener("click", () => {
    const query = queryInput.value.trim();
    if (query) {
      // Update URL - use replaceState if same query to avoid history pollution
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set("q", query);

      if (query === lastQuery) {
        window.history.replaceState({}, "", newUrl);
      } else {
        window.history.pushState({}, "", newUrl);
        lastQuery = query;
      }

      doSearch(query);
    }
  });

  queryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const query = queryInput.value.trim();
      if (query) {
        // Update URL - use replaceState if same query
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set("q", query);

        if (query === lastQuery) {
          window.history.replaceState({}, "", newUrl);
        } else {
          window.history.pushState({}, "", newUrl);
          lastQuery = query;
        }

        doSearch(query);
      }
    }
  });

  // Handle browser back/forward
  window.addEventListener("popstate", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get("q");
    if (query) {
      queryInput.value = query;
      doSearch(query);
    }
  });
});
