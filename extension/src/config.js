// Shared configuration module for the Indexical extension
// Handles settings storage and retrieval using browser.storage API

const configLogger = createLogger("config");

const DEFAULT_CONFIG = {
  daemonUrl: "http://127.0.0.1:11435",
  userId: null, // Will be generated on first use
  apiVersion: "1",
  blacklistDomains: [
    "facebook.com",
    "fb.com",
    "tiktok.com",
    "translate.google.com",
    "youtube.com",
    "gmail.com",
    "outlook.com",
    "mail.google.com",
    "paypal.com",
    "stripe.com",
  ],
};

// Get browser API (Firefox or Chrome)
function getBrowserAPI() {
  if (typeof browser !== "undefined" && browser.storage) {
    return browser;
  } else if (typeof chrome !== "undefined" && chrome.storage) {
    return chrome;
  }
  return null;
}

// Base62 encoding for compact IDs
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function encodeBase62(num) {
  if (num === 0) return '0';
  
  let result = '';
  while (num > 0) {
    result = BASE62_CHARS[num % 62] + result;
    num = Math.floor(num / 62);
  }
  return result;
}

function decodeBase62(str) {
  let result = 0;
  for (let i = 0; i < str.length; i++) {
    result = result * 62 + BASE62_CHARS.indexOf(str[i]);
  }
  return result;
}

// Promise lock to prevent concurrent getConfig calls
let configPromise = null;

// Generate a unique user ID using base62 encoding
// Format: base62(timestamp) + base62(random32bit)
function generateUserId() {
  const timestamp = Date.now();
  
  // Generate random 32-bit number
  let random;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    random = array[0];
  } else {
    // Fallback to Math.random
    random = Math.floor(Math.random() * 0xFFFFFFFF);
  }
  
  // Encode both parts as base62
  const timestampEncoded = encodeBase62(timestamp);
  const randomEncoded = encodeBase62(random);
  
  return `${timestampEncoded}${randomEncoded}`;
}

// Get configuration from storage
async function getConfig() {
  // Return existing promise if one is in flight
  if (configPromise) {
    return configPromise;
  }

  configPromise = (async () => {
    const browserAPI = getBrowserAPI();

    if (!browserAPI) {
      configLogger.warn({ msg: "Storage API not available, using defaults" });
      return { ...DEFAULT_CONFIG };
    }

    try {
      const result = await new Promise((resolve, reject) => {
        browserAPI.storage.local.get(["indexicalConfig"], (result) => {
          if (browserAPI.runtime.lastError) {
            reject(browserAPI.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });

      if (result.indexicalConfig) {
        // Merge with defaults to ensure all fields exist (deep clone arrays)
        return {
          ...DEFAULT_CONFIG,
          ...result.indexicalConfig,
          blacklistDomains: result.indexicalConfig.blacklistDomains || [
            ...DEFAULT_CONFIG.blacklistDomains,
          ],
        };
      } else {
        // First time - generate user ID and save
        const newConfig = {
          ...DEFAULT_CONFIG,
          blacklistDomains: [...DEFAULT_CONFIG.blacklistDomains],
          userId: generateUserId(),
        };
        await saveConfig(newConfig);
        return newConfig;
      }
    } catch (error) {
      configLogger.error({
        error: error.message,
        stack: error.stack,
        msg: "Error loading config",
      });
      return { ...DEFAULT_CONFIG };
    } finally {
      // Clear promise after resolution
      configPromise = null;
    }
  })();

  return configPromise;
}

// Save configuration to storage
async function saveConfig(config) {
  const browserAPI = getBrowserAPI();

  if (!browserAPI) {
    configLogger.warn({ msg: "Storage API not available, cannot save config" });
    return false;
  }

  try {
    await new Promise((resolve, reject) => {
      browserAPI.storage.local.set({ indexicalConfig: config }, () => {
        if (browserAPI.runtime.lastError) {
          reject(browserAPI.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
    return true;
  } catch (error) {
    configLogger.error({
      error: error.message,
      stack: error.stack,
      msg: "Error saving config",
    });
    return false;
  }
}

// Update specific config values
async function updateConfig(updates) {
  const currentConfig = await getConfig();
  const newConfig = { ...currentConfig, ...updates };
  await saveConfig(newConfig);
  return newConfig;
}

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getConfig, saveConfig, updateConfig, DEFAULT_CONFIG };
}
