// Shared utility functions for Indexical extension
// Used by popup.js and results.js to avoid code duplication

const utilsLogger = createLogger("utils");

/**
 * Validate if a URL is safe to use (no javascript:, data:, etc.)
 * @param {string} url - URL to validate
 * @returns {boolean} True if safe
 */
function isSafeUrl(url) {
  if (!url || typeof url !== "string") return false;

  try {
    const parsed = new URL(url);
    // Only allow http, https, and data URLs for images
    return ["http:", "https:", "data:"].includes(parsed.protocol);
  } catch (e) {
    return false;
  }
}

/**
 * Highlight query terms in text - SAFE VERSION using DOM
 * @param {string} text - The text to highlight
 * @param {string} query - The search query
 * @returns {DocumentFragment} DOM fragment with highlighted matches
 */
function highlightText(text) {
  const fragment = document.createDocumentFragment();

  if (!text || typeof text !== "string") {
    return fragment;
  }

  const parts = text.split(/\x02|\x03/);

  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const mark = document.createElement("mark");
      mark.textContent = part;
      fragment.appendChild(mark);
    } else {
      fragment.appendChild(document.createTextNode(part));
    }
  });

  return fragment;
}

/**
 * Format a date string in a human-readable relative format
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date string
 */
function formatDate(isoString) {
  if (!isoString) return "Unknown date";

  const date = new Date(isoString);

  // Check if date is valid
  if (isNaN(date.getTime())) {
    utilsLogger.warn({ date: isoString, msg: "Invalid date" });
    return "Unknown date";
  }

  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    try {
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (e) {
      return "Unknown date";
    }
  }
}

/**
 * Create a result card element from search result data
 * @param {Object} result - Search result object
 * @param {string} query - The search query (for highlighting)
 * @param {boolean} showFullDate - Whether to show full date or relative
 * @param {Object} [opts] - Optional features; opts.onPreview(result) enables Preview button
 * @returns {HTMLElement} The result card element
 */
function createResultElement(result, showFullDate = false, opts = {}) {
  try {
    // Validate result object
    if (!result || typeof result !== "object") {
      throw new Error("Invalid result object");
    }

    const el = document.createElement("div");
    el.className = "result";

    // Header with favicon and site info
    const headerDiv = document.createElement("div");
    headerDiv.className = "result-header";

    // Favicon with fallback
    if (result.favicon && isSafeUrl(result.favicon)) {
      const faviconImg = document.createElement("img");
      faviconImg.className = "result-favicon";
      faviconImg.src = result.favicon;
      faviconImg.alt = "";

      // Handle favicon load errors gracefully
      faviconImg.onerror = function () {
        // Try to use Google's favicon service as fallback
        if (result.domain && !this.src.includes("google.com/s2/favicons")) {
          const fallbackUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
            result.domain
          )}&sz=16`;
          if (isSafeUrl(fallbackUrl)) {
            this.src = fallbackUrl;
          } else {
            this.style.display = "none";
          }
        } else {
          // If that also fails, hide it
          this.style.display = "none";
        }
      };

      headerDiv.appendChild(faviconImg);
    } else if (result.domain) {
      // No favicon URL stored, try Google's favicon service
      const faviconImg = document.createElement("img");
      faviconImg.className = "result-favicon";
      const fallbackUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        result.domain
      )}&sz=16`;
      if (isSafeUrl(fallbackUrl)) {
        faviconImg.src = fallbackUrl;
        faviconImg.alt = "";
        faviconImg.onerror = function () {
          this.style.display = "none";
        };
        headerDiv.appendChild(faviconImg);
      }
    }

    // Site name or domain
    const siteInfoDiv = document.createElement("div");
    siteInfoDiv.className = "result-site";
    if (result.siteName) {
      siteInfoDiv.textContent = result.siteName;
    } else if (result.domain) {
      siteInfoDiv.textContent = result.domain;
    }

    if (result.siteName || result.domain) {
      headerDiv.appendChild(siteInfoDiv);
    }

    el.appendChild(headerDiv);

    if (opts.onPreview) {
      const previewBtn = document.createElement("button");
      previewBtn.className = "preview-btn btn-small";
      previewBtn.textContent = "Preview";
      if (result.id != null) {
        previewBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          opts.onPreview(result);
        });
      } else {
        previewBtn.disabled = true;
        previewBtn.title = "No preview available";
      }
      headerDiv.appendChild(previewBtn);
    }

    // Title as anchor for native link behavior
    const titleLink = document.createElement("a");
    titleLink.className = "title";
    titleLink.textContent = result.title || "(no title)";
    if (result.url && isSafeUrl(result.url)) {
      titleLink.href = result.url;
    }

    // Author (if available, show separately)
    if (result.author) {
      const authorSpan = document.createElement("span");
      authorSpan.className = "result-author";
      authorSpan.textContent = ` · by ${result.author}`;
      titleLink.appendChild(authorSpan);
    }

    // URL
    const urlLink = document.createElement("a");
    urlLink.className = "url";
    urlLink.textContent = result.url;
    if (result.url && isSafeUrl(result.url)) {
      urlLink.href = result.url;
    }

    // Metadata bar (date, word count, language, etc.)
    const metaDiv = document.createElement("div");
    metaDiv.className = "meta";
    let metaParts = [];

    // Date captured
    if (result.capturedAt) {
      if (showFullDate) {
        metaParts.push(formatDate(result.capturedAt));
      } else {
        const date = new Date(result.capturedAt);
        metaParts.push(date.toLocaleDateString());
      }
    }

    // Published date (if different from captured)
    if (result.publishedTime && result.publishedTime !== result.capturedAt) {
      const pubDate = new Date(result.publishedTime);
      metaParts.push(`Published: ${pubDate.toLocaleDateString()}`);
    }

    // Word count
    if (result.wordCount) {
      const wordCountText = showFullDate
        ? `${result.wordCount.toLocaleString()} words`
        : `${result.wordCount} words`;
      metaParts.push(wordCountText);
    }

    // Language
    if (result.lang && result.lang !== "en") {
      metaParts.push(result.lang.toUpperCase());
    }

    // Add the rest of the metadata as text (without overwriting badge)
    if (metaParts.length > 0) {
      metaDiv.appendChild(document.createTextNode(metaParts.join(" • ")));
    }

    // Capture reason (for debugging/info)
    if (result.captureReason && result.captureReason !== "initial") {
      if (metaParts.length > 0) {
        metaDiv.appendChild(document.createTextNode(" • "));
      }
      const reasonBadge = document.createElement("span");
      reasonBadge.className = "capture-reason";
      reasonBadge.textContent = result.captureReason;
      reasonBadge.title = "How this page was captured";
      metaDiv.appendChild(reasonBadge);
    }

    // Excerpt (from meta tags, if available and different from snippet)
    let excerptDiv = null;
    if (result.excerpt && result.excerpt.trim()) {
      // Check if excerpt is meaningfully different from snippet
      const snippetText = result.snippet || "";
      const excerptLower = result.excerpt.toLowerCase().substring(0, 100);
      const snippetLower = snippetText.toLowerCase().substring(0, 100);

      if (
        excerptLower !== snippetLower &&
        snippetText &&
        !snippetText.includes(result.excerpt.substring(0, 50))
      ) {
        excerptDiv = document.createElement("div");
        excerptDiv.className = "excerpt";
        excerptDiv.textContent = result.excerpt;
      }
    }

    // Snippet (matched chunk from search)
    const snippetDiv = document.createElement("div");
    snippetDiv.className = "snippet";
    const highlightedSnippet = highlightText(result.snippet || "");
    snippetDiv.appendChild(highlightedSnippet); // Safe - appends DOM nodes

    // Assemble result card
    el.appendChild(titleLink);
    el.appendChild(urlLink);
    el.appendChild(metaDiv);

    // Show excerpt before snippet if available
    if (excerptDiv) {
      el.appendChild(excerptDiv);
    }

    el.appendChild(snippetDiv);

    return el;
  } catch (error) {
    utilsLogger.error({
      url: result?.url,
      error: error.message,
      stack: error.stack,
      msg: "Error creating result element",
    });

    // Return error placeholder
    const errorEl = document.createElement("div");
    errorEl.className = "result error";
    errorEl.textContent = `Error displaying result: ${
      result?.url || "Unknown URL"
    }`;
    return errorEl;
  }
}

/**
 * Get the browser API (Firefox or Chrome)
 * @returns {Object|null} Browser API object
 */
function getBrowserAPI() {
  if (typeof browser !== "undefined") return browser;
  if (typeof chrome !== "undefined") return chrome;
  return null;
}

/**
 * Open a URL in a new tab (with validation)
 * @param {string} url - The URL to open
 */
function openInNewTab(url) {
  if (!isSafeUrl(url)) {
    utilsLogger.error({ url, msg: "Refusing to open unsafe URL" });
    return;
  }

  const browserAPI = getBrowserAPI();
  if (browserAPI && browserAPI.tabs && browserAPI.tabs.create) {
    browserAPI.tabs.create({ url: url });
  } else {
    window.open(url, "_blank");
  }
}

function notifyHealth(healthy) {
  const msg = { type: "HEALTH_UPDATE", healthy };
  try {
    if (typeof browser !== "undefined" && browser.runtime) {
      browser.runtime.sendMessage(msg).catch(() => {});
    } else if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.sendMessage(msg);
    }
  } catch {
    // Extension context unavailable
  }
}
