if (typeof importScripts === "function") {
  importScripts("logger.js", "config.js");
}

const backgroundLogger = createLogger("background");
const EXTENSION_VERSION = "1";
const HEALTH_ALARM = "indexical-health-check";
const HEALTH_INTERVAL_MIN = 2;
const HEALTH_STORAGE_KEY = "indexicalDaemonHealthy";

let daemonHealthy = true;

function getSessionStorage() {
  if (typeof browser !== "undefined" && browser.storage && browser.storage.session) {
    return browser.storage.session;
  }
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
    return chrome.storage.session;
  }
  return null;
}

async function persistHealth(healthy) {
  const session = getSessionStorage();
  if (!session) return;
  try {
    await new Promise((resolve, reject) => {
      session.set({ [HEALTH_STORAGE_KEY]: healthy }, () => {
        const err = (typeof browser !== "undefined" ? browser : chrome).runtime.lastError;
        err ? reject(err) : resolve();
      });
    });
  } catch {
    // session storage unavailable
  }
}

async function loadHealth() {
  const session = getSessionStorage();
  if (!session) return;
  try {
    const result = await new Promise((resolve, reject) => {
      session.get([HEALTH_STORAGE_KEY], (result) => {
        const err = (typeof browser !== "undefined" ? browser : chrome).runtime.lastError;
        err ? reject(err) : resolve(result);
      });
    });
    if (result && typeof result[HEALTH_STORAGE_KEY] === "boolean") {
      daemonHealthy = result[HEALTH_STORAGE_KEY];
    }
  } catch {
    // session storage unavailable
  }
}

function getBadgeAPI() {
  if (typeof browser !== "undefined") {
    return browser.action || browser.browserAction || null;
  }
  if (typeof chrome !== "undefined") {
    return chrome.action || chrome.browserAction || null;
  }
  return null;
}

function getAlarmsAPI() {
  if (typeof browser !== "undefined" && browser.alarms) return browser.alarms;
  if (typeof chrome !== "undefined" && chrome.alarms) return chrome.alarms;
  return null;
}

function getRuntimeAPI() {
  if (typeof browser !== "undefined" && browser.runtime) return browser;
  if (typeof chrome !== "undefined" && chrome.runtime) return chrome;
  return null;
}

function setBadge(healthy) {
  daemonHealthy = healthy;
  persistHealth(healthy);
  const badge = getBadgeAPI();
  if (!badge) return;
  if (healthy) {
    badge.setBadgeText({ text: "" });
  } else {
    badge.setBadgeText({ text: "!" });
    badge.setBadgeBackgroundColor({ color: "#DC3545" });
  }
}

async function checkHealth() {
  try {
    const config = await getConfig();
    const res = await fetch(`${config.daemonUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    setBadge(res.ok);
  } catch {
    setBadge(false);
  }
}

function markReachable() {
  if (!daemonHealthy) setBadge(true);
}

function markUnreachable() {
  if (daemonHealthy) setBadge(false);
}

function handleMessage(message, sender, sendResponse) {
  if (!message || !message.type) return false;

  if (message.type === "GET_HEALTH") {
    sendResponse({ healthy: daemonHealthy });
    return false;
  }

  if (message.type === "HEALTH_UPDATE") {
    if (message.healthy) markReachable();
    else markUnreachable();
    return false;
  }

  if (message.type === "INGEST_PAGE") {
    handleIngest(message.payload).then(() => sendResponse({ ok: true }));
    return true;
  }

  return false;
}

async function handleIngest(payload) {
  const requestId = generateRequestId();
  const traceparent = generateTraceParent();

  try {
    if (!payload) {
      backgroundLogger.error({
        request_id: requestId,
        traceparent,
        msg: "Message missing payload"
      });
      return;
    }

    const config = await getConfig();

    const enrichedPayload = {
      ...payload,
      userId: config.userId,
      extensionVersion: EXTENSION_VERSION,
      requestId,
    };

    const response = await fetch(`${config.daemonUrl}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.userId,
        "traceparent": traceparent,
      },
      body: JSON.stringify(enrichedPayload),
    });

    if (!response.ok) {
      markUnreachable();
      backgroundLogger.error({
        request_id: requestId,
        traceparent,
        error: `HTTP ${response.status}`,
        msg: "Failed to ingest page"
      });
      return;
    }

    markReachable();

    const daemonVersion = response.headers.get("X-API-Version");
    if (daemonVersion && daemonVersion !== EXTENSION_VERSION) {
      backgroundLogger.warn({
        request_id: requestId,
        traceparent,
        extension_version: EXTENSION_VERSION,
        daemon_version: daemonVersion,
        msg: "API version mismatch"
      });
    }

    const contentType = response.headers.get("content-type");
    const data = contentType && contentType.includes("application/json")
      ? await response.json()
      : { ok: true };

    if (!data.ok) {
      backgroundLogger.error({
        request_id: requestId,
        traceparent,
        error: data.error,
        msg: "Failed to ingest page"
      });
    }
  } catch (error) {
    markUnreachable();
    backgroundLogger.error({
      request_id: requestId,
      traceparent,
      error: error.message,
      stack: error.stack,
      msg: "Failed to connect to daemon"
    });
  }
}

function setupAlarm() {
  const alarms = getAlarmsAPI();
  if (!alarms) return;
  alarms.create(HEALTH_ALARM, { periodInMinutes: HEALTH_INTERVAL_MIN });
  alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEALTH_ALARM) checkHealth();
  });
}

const api = getRuntimeAPI();
if (api) {
  api.runtime.onMessage.addListener(handleMessage);
  api.commands.onCommand.addListener((command) => {
    if (command === "open-search") {
      api.tabs.create({ url: api.runtime.getURL("results.html") });
    }
  });
}

setupAlarm();
loadHealth().then(() => checkHealth());
