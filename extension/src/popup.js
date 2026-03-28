// Popup script that handles search UI

const popupLogger = createLogger("popup");

document.addEventListener("DOMContentLoaded", () => {
  const browserApi = getBrowserAPI();

  // Check if browser API is available
  if (!browserApi) {
    const resultsDiv = document.getElementById("results");
    resultsDiv.innerHTML = "";
    const errorDiv = document.createElement("div");
    errorDiv.className = "error";
    errorDiv.textContent = "Browser extension API not available";
    resultsDiv.appendChild(errorDiv);
    return;
  }

  const queryInput = document.getElementById("query");
  const searchBtn = document.getElementById("searchBtn");
  const openTabBtn = document.getElementById("openTabBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const resultsDiv = document.getElementById("results");
  const daemonStatus = document.getElementById("daemon-status");

  function showDaemonStatus(healthy) {
    daemonStatus.style.display = healthy ? "none" : "flex";
  }

  function handleHealthResponse(response) {
    if (response && typeof response.healthy === "boolean") {
      showDaemonStatus(response.healthy);
    }
  }

  if (typeof browser !== "undefined" && browser.runtime) {
    browser.runtime.sendMessage({ type: "GET_HEALTH" })
      .then(handleHealthResponse).catch(() => {});
  } else if (typeof chrome !== "undefined" && chrome.runtime) {
    chrome.runtime.sendMessage({ type: "GET_HEALTH" }, handleHealthResponse);
  }

  // Open settings page
  function openSettings() {
    if (
      browserApi &&
      browserApi.runtime &&
      browserApi.runtime.openOptionsPage
    ) {
      browserApi.runtime.openOptionsPage();
    } else {
      // Fallback: open options page manually
      const optionsUrl = browserApi.runtime.getURL("options.html");
      if (browserApi && browserApi.tabs && browserApi.tabs.create) {
        browserApi.tabs.create({ url: optionsUrl });
      } else {
        window.open(optionsUrl, "_blank");
      }
    }
  }

  // Open results in new tab
  function openInTab() {
    const query = queryInput.value.trim();
    if (!query) {
      alert("Please enter a search query");
      return;
    }

    // Build URL with query parameter
    const resultsUrl = browserApi.runtime.getURL(
      `results.html?q=${encodeURIComponent(query)}`
    );

    if (browserApi && browserApi.tabs && browserApi.tabs.create) {
      browserApi.tabs.create({ url: resultsUrl });
    } else {
      window.open(resultsUrl, "_blank");
    }
  }

  // Perform search in popup
  async function doSearch() {
    const query = queryInput.value.trim();
    if (!query) {
      resultsDiv.innerHTML =
        '<div class="no-results">Please enter a search query</div>';
      return;
    }

    // Disable button during search
    searchBtn.disabled = true;
    openTabBtn.disabled = true;

    resultsDiv.innerHTML = '<div class="loading">Searching...</div>';

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
        body: JSON.stringify({
          query: query,
          k: 5,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      notifyHealth(true);
      showDaemonStatus(true);
      resultsDiv.innerHTML = "";

      if (!data.results || !data.results.length) {
        resultsDiv.innerHTML = '<div class="no-results">No results found</div>';
        return;
      }

      // Display results
      data.results.forEach((r) => {
        resultsDiv.appendChild(createResultElement(r, false));
      });
    } catch (e) {
      notifyHealth(false);
      showDaemonStatus(false);
      popupLogger.error({
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

      const errorMsg = document.createElement("div");
      errorMsg.textContent = `Error: ${e.message}`;
      errorDiv.appendChild(errorMsg);

      const errorHint = document.createElement("div");
      errorHint.textContent = `Make sure the daemon is running at ${config.daemonUrl}`;
      errorHint.style.marginTop = "10px";
      errorDiv.appendChild(errorHint);

      resultsDiv.appendChild(errorDiv);
    } finally {
      // Re-enable buttons
      searchBtn.disabled = false;
      openTabBtn.disabled = false;
    }
  }

  // Intercept link clicks in results to open in new tab
  resultsDiv.addEventListener("click", (e) => {
    const anchor = e.target.closest("a[href]");
    if (anchor && resultsDiv.contains(anchor)) {
      e.preventDefault();
      openInNewTab(anchor.href);
    }
  });

  // Event listeners
  searchBtn.addEventListener("click", doSearch);
  openTabBtn.addEventListener("click", openInTab);
  settingsBtn.addEventListener("click", openSettings);

  queryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      // Default: search in popup (Shift+Enter for new tab)
      if (e.shiftKey) {
        openInTab();
      } else {
        doSearch();
      }
    }
  });

  // Focus the input field
  queryInput.focus();
});
