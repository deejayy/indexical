// Content script with SPA support, MutationObserver, and stable hashing

(function () {
  const contentLogger = createLogger("content");
  // State tracking per tab
  let lastStableHash = null;
  let lastLength = 0;
  let lastIngestTime = 0;
  let ingestCountWindow = [];
  let extractTimer = null;
  let observer = null;
  let configCache = null; // Cache config to avoid repeated lookups

  // Configuration
  const MIN_CONTENT_LENGTH = 250;
  const MIN_DELTA_CHARS = 500; // Must change by 1000+ chars to re-ingest
  const DEBOUNCE_MS = 2000; // Wait 2s of quiet before extracting
  const RATE_LIMIT_WINDOW = 60000; // 1 minute
  const MAX_INGESTS_PER_MINUTE = 60;
  const MIN_INGEST_INTERVAL = 10000; // 10s minimum between ingests

  // Load and cache configuration
  async function loadConfig() {
    if (!configCache) {
      configCache = await getConfig();
    }
    return configCache;
  }

  // Utility: simple SHA-256 hash (browser-compatible)
  // Falls back to simple hash on insecure contexts (HTTP)
  async function sha256(text) {
    // Check if crypto.subtle is available (requires HTTPS)
    if (crypto && crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch (e) {
        contentLogger.warn({
          error: e.message,
          msg: "crypto.subtle failed, using fallback hash",
        });
      }
    }

    // Fallback: simple string hash for HTTP pages
    contentLogger.warn({
      msg: "crypto.subtle not available (HTTP?), using simple hash",
    });
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  // Normalize text for stable hashing
  function normalizeText(text) {
    let normalized = text;

    // Remove relative timestamps
    normalized = normalized.replace(
      /\b\d+\s+(seconds?|minutes?|hours?|days?)\s+ago\b/gi,
      "<TIME>"
    );
    normalized = normalized.replace(/\bjust now\b/gi, "<TIME>");
    normalized = normalized.replace(/\byesterday\b/gi, "<TIME>");

    // Remove absolute timestamps (optional, can be aggressive)
    normalized = normalized.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "<DATE>");
    normalized = normalized.replace(
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/gi,
      "<DATE>"
    );
    normalized = normalized.replace(
      /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/gi,
      "<TIME>"
    );

    // Normalize large numbers (comment counts, views, etc.)
    normalized = normalized.replace(/\b\d{3,}\b/g, "<NUM>");

    // Lowercase and collapse whitespace
    normalized = normalized.toLowerCase();
    normalized = normalized.replace(/\s+/g, " ");
    normalized = normalized.trim();

    return normalized;
  }

  // Extract text with proper separation between HTML elements
  function extractTextWithSeparation(element) {
    if (!element) return "";

    // Block-level elements that should have line breaks after them
    const blockElements = new Set([
      "P",
      "DIV",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "LI",
      "TR",
      "TD",
      "TH",
      "SECTION",
      "ARTICLE",
      "HEADER",
      "FOOTER",
      "NAV",
      "ASIDE",
      "BLOCKQUOTE",
      "PRE",
      "HR",
    ]);

    // Use iterative approach to avoid stack overflow
    const stack = [{ node: element, depth: 0 }];
    const maxDepth = 1000; // Safety limit
    let text = "";

    while (stack.length > 0) {
      const { node, depth } = stack.pop();

      // Safety check for depth
      if (depth > maxDepth) {
        contentLogger.warn({ depth, maxDepth, msg: "Max DOM depth exceeded, truncating" });
        continue;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      // Skip script, style, and other non-content elements
      const tagName = node.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME"].includes(tagName)) {
        continue;
      }

      // Add children to stack in reverse order (to process in correct order)
      const children = Array.from(node.childNodes).reverse();
      for (const child of children) {
        stack.push({ node: child, depth: depth + 1 });
      }

      // Add separation for block-level elements
      if (blockElements.has(tagName)) {
        text += "\n";
      }
    }

    // Clean up excessive whitespace while preserving intentional line breaks
    return text.replace(/\n{3,}/g, "\n\n").trim();
  }

  // Check if this page should be ingested
  async function shouldIngest() {
    const url = window.location.href;
    const hostname = window.location.hostname;

    // Exclude internal browser pages
    if (url.startsWith("about:")) return false;
    if (url.startsWith("moz-extension:")) return false;
    if (url.startsWith("chrome-extension:")) return false;
    if (url.startsWith("chrome:")) return false;
    if (url.startsWith("file:")) return false;

    // Load configuration to get blacklist
    const config = await loadConfig();
    const blacklistDomains = config.blacklistDomains || [];

    // Check blacklist
    for (const domain of blacklistDomains) {
      if (hostname.includes(domain)) {
        return false;
      }
    }

    return true;
  }

  // Rate limiting check
  function isRateLimited() {
    const now = Date.now();

    // Clean old entries from window
    ingestCountWindow = ingestCountWindow.filter(
      (t) => now - t < RATE_LIMIT_WINDOW
    );

    // Check count
    if (ingestCountWindow.length >= MAX_INGESTS_PER_MINUTE) {
      return true;
    }

    // Check minimum interval
    if (now - lastIngestTime < MIN_INGEST_INTERVAL) {
      return true;
    }

    return false;
  }

  function convertToMarkdown(html) {
    try {
      const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
      td.use(turndownPluginGfm.gfm);
      return td.turndown(html);
    } catch (e) {
      contentLogger.warn({ error: e.message, msg: 'Markdown conversion failed' });
      return null;
    }
  }

  // Extract clean content using Readability and rich metadata
  function extractContent() {
    let content = "";
    let contentMarkdown = null;
    let title = document.title || window.location.href;
    let author = null;
    let excerpt = null;
    let siteName = null;
    let publishedTime = null;
    let modifiedTime = null;
    let lang = null;
    let byline = null;

    try {
      // Clone the document for Readability (it modifies the DOM)
      const documentClone = document.cloneNode(true);

      // Check if Readability is available
      if (typeof Readability !== "undefined") {
        const reader = new Readability(documentClone);
        const article = reader.parse();

        if (article && article.textContent) {
          content = article.textContent;
          if (article.content) contentMarkdown = convertToMarkdown(article.content);

          // Extract Readability metadata
          if (article.title) title = article.title;
          if (article.byline) byline = article.byline;
          if (article.excerpt) excerpt = article.excerpt;
          if (article.siteName) siteName = article.siteName;
        } else {
          // Fallback to innerText with better text separation
          content = extractTextWithSeparation(document.body);
        }
      } else {
        // Fallback if Readability is not loaded
        content = extractTextWithSeparation(document.body);
      }
    } catch (e) {
      contentLogger.error({
        url: window.location.href,
        error: e.message,
        stack: e.stack,
        msg: "Error using Readability",
      });
      content = extractTextWithSeparation(document.body);
    }

    // Extract additional metadata from meta tags
    const metaTags = document.querySelectorAll("meta");
    metaTags.forEach((tag) => {
      const property = tag.getAttribute("property") || tag.getAttribute("name");
      const content = tag.getAttribute("content");

      if (!content) return;

      // Open Graph / Twitter Cards / Schema.org
      if (property === "og:site_name" || property === "twitter:site") {
        siteName = siteName || content;
      } else if (
        property === "author" ||
        property === "article:author" ||
        property === "og:article:author"
      ) {
        author = author || content;
      } else if (
        property === "description" ||
        property === "og:description" ||
        property === "twitter:description"
      ) {
        excerpt = excerpt || content;
      } else if (
        property === "article:published_time" ||
        property === "datePublished"
      ) {
        publishedTime = publishedTime || content;
      } else if (
        property === "article:modified_time" ||
        property === "dateModified"
      ) {
        modifiedTime = modifiedTime || content;
      }
    });

    // Get language
    lang = document.documentElement.lang || navigator.language || "en";

    // Extract domain
    const domain = window.location.hostname;

    // Validate dates - only send if they parse correctly
    let validPublishedTime = null;
    if (publishedTime) {
      const testDate = new Date(publishedTime);
      if (!isNaN(testDate.getTime())) {
        validPublishedTime = publishedTime;
      }
    }

    let validModifiedTime = null;
    if (modifiedTime) {
      const testDate = new Date(modifiedTime);
      if (!isNaN(testDate.getTime())) {
        validModifiedTime = modifiedTime;
      }
    }

    // Get favicon using browser's built-in favicon service
    // Both Firefox and Chrome expose favicons through this pattern
    let favicon = null;
    const iconLink = document.querySelector('link[rel*="icon"]');
    if (iconLink && iconLink.href) {
      favicon = iconLink.href;
    } else {
      // Use browser's favicon service which handles fallback to /favicon.ico
      favicon = `${window.location.origin}/favicon.ico`;
    }

    return {
      content,
      contentMarkdown,
      title,
      author: author || byline,
      excerpt,
      siteName,
      publishedTime: validPublishedTime,
      modifiedTime: validModifiedTime,
      lang,
      domain,
      favicon,
    };
  }

  // Compute hashes for content
  async function computeHashes(content) {
    const normalized = normalizeText(content);
    const stableHash = await sha256(normalized);
    const exactHash = await sha256(content);
    return { stableHash, exactHash, normalized };
  }

  // Send to background script
  function sendToBackground(payload) {
    try {
      if (typeof browser !== "undefined" && browser.runtime) {
        browser.runtime.sendMessage({
          type: "INGEST_PAGE",
          payload: payload,
        }).catch(() => {});
      } else if (typeof chrome !== "undefined" && chrome.runtime) {
        chrome.runtime.sendMessage({
          type: "INGEST_PAGE",
          payload: payload,
        });
      }
    } catch (e) {
      contentLogger.error({
        error: e.message,
        stack: e.stack,
        msg: "Failed to send message to background",
      });
    }
  }

  // Main extraction and ingestion logic
  async function extractAndIngest(reason = "initial") {
    if (!(await shouldIngest())) return;

    const extracted = extractContent();
    const {
      content,
      contentMarkdown,
      title,
      author,
      excerpt,
      siteName,
      publishedTime,
      modifiedTime,
      lang,
      domain,
      favicon,
    } = extracted;

    // Check minimum length
    if (!content || content.length < MIN_CONTENT_LENGTH) {
      return;
    }

    // Compute hashes
    const { stableHash, exactHash, normalized } = await computeHashes(content);
    const currentLength = normalized.length;

    // Check if content changed meaningfully
    const lengthDelta = Math.abs(currentLength - lastLength);
    const hashChanged = stableHash !== lastStableHash;

    if (!hashChanged) {
      return;
    }

    if (lengthDelta < MIN_DELTA_CHARS && lastStableHash !== null) {
      return;
    }

    // Rate limiting
    if (isRateLimited()) {
      return;
    }

    // Update state
    lastStableHash = stableHash;
    lastLength = currentLength;
    lastIngestTime = Date.now();
    ingestCountWindow.push(lastIngestTime);

    // Prepare payload with rich metadata
    const payload = {
      url: window.location.href,
      title: title,
      content: content,
      contentMarkdown: contentMarkdown,
      stableHash: stableHash,
      exactHash: exactHash,
      // Rich metadata
      author: author,
      excerpt: excerpt,
      siteName: siteName,
      domain: domain,
      favicon: favicon,
      publishedTime: publishedTime,
      modifiedTime: modifiedTime,
      lang: lang,
      wordCount: content.trim()
        ? content
            .trim()
            .split(/\s+/)
            .filter((w) => w.length > 0).length
        : 0,
      charCount: content.length,
      captureReason: reason,
    };

    sendToBackground(payload);
  }

  // Schedule extraction with debouncing
  function scheduleExtract(reason = "mutation") {
    if (extractTimer) {
      clearTimeout(extractTimer);
    }

    extractTimer = setTimeout(() => {
      extractAndIngest(reason);
      extractTimer = null;
    }, DEBOUNCE_MS);
  }

  // Setup MutationObserver for dynamic content
  function setupObserver() {
    if (!document.body) return;

    observer = new MutationObserver((mutations) => {
      // Only trigger if there are meaningful changes
      const hasMeaningfulChange = mutations.some(
        (m) =>
          m.addedNodes.length > 0 ||
          m.removedNodes.length > 0 ||
          (m.type === "characterData" && m.target.textContent.length > 50)
      );

      if (hasMeaningfulChange) {
        scheduleExtract("mutation");
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // Hook history API for SPA navigation detection
  // NOTE: This is intentionally removed as it's too invasive and breaks compatibility
  // with frameworks. We rely on MutationObserver instead which catches content changes.
  function hookHistoryAPI() {
    // Disabled - MutationObserver is sufficient
  }

  // Initialize
  function init() {
    // Initial extraction on page load
    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      extractAndIngest("initial");
    } else {
      window.addEventListener("load", () => extractAndIngest("initial"));
    }

    // Setup SPA detection
    hookHistoryAPI();

    // Setup MutationObserver
    if (document.body) {
      setupObserver();
    } else {
      // Wait for body to be available (with timeout)
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          setupObserver();
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });

      // Timeout after 5 seconds
      setTimeout(() => {
        bodyObserver.disconnect();
        contentLogger.warn({
          url: window.location.href,
          msg: "Body not found after 5 seconds, giving up",
        });
      }, 5000);
    }

    // Cleanup on page unload
    window.addEventListener("pagehide", () => {
      // Clear timer
      if (extractTimer) {
        clearTimeout(extractTimer);
        extractTimer = null;
      }

      // Disconnect observer
      if (observer) {
        observer.disconnect();
        observer = null;
      }

      // Clear cache
      configCache = null;
    });
  }

  // Start
  init();
})();
