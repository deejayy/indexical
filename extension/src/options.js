// Options page script for Indexical extension settings

const optionsLogger = createLogger("options");

let statusTimeout = null;
let userIdUnlocked = false;

function showStatus(message, isError = false) {
  const statusDiv = document.getElementById("status");
  statusDiv.textContent = message;
  statusDiv.className = "status " + (isError ? "error" : "success");
  statusDiv.style.display = "block";

  // Clear previous timeout if exists
  if (statusTimeout) {
    clearTimeout(statusTimeout);
  }

  // Auto-hide after 3 seconds
  statusTimeout = setTimeout(() => {
    statusDiv.style.display = "none";
    statusTimeout = null;
  }, 3000);
}

function toggleUserIdEdit() {
  const userIdInput = document.getElementById("userId");
  const modifyBtn = document.getElementById("modifyUserIdBtn");
  
  if (userIdUnlocked) {
    // Lock it back
    userIdInput.readOnly = true;
    modifyBtn.textContent = "Modify";
    userIdUnlocked = false;
  } else {
    // Unlock for editing
    userIdInput.readOnly = false;
    userIdInput.select();
    modifyBtn.textContent = "Lock";
    userIdUnlocked = true;
  }
}

async function loadSettings() {
  try {
    const config = await getConfig();

    document.getElementById("daemonUrl").value = config.daemonUrl || "";
    document.getElementById("userId").value =
      config.userId || "Not generated yet";

    // Convert array to newline-separated string
    const blacklistText = (config.blacklistDomains || []).join("\n");
    document.getElementById("blacklistDomains").value = blacklistText;
  } catch (error) {
    optionsLogger.error({
      error: error.message,
      stack: error.stack,
      msg: "Error loading settings",
    });
    showStatus("Error loading settings: " + error.message, true);
  }
}

async function saveSettings() {
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;

  try {
    const daemonUrl = document.getElementById("daemonUrl").value.trim();
    const userId = document.getElementById("userId").value.trim();
    const blacklistText = document.getElementById("blacklistDomains").value;

    // Validate daemon URL
    if (!daemonUrl) {
      throw new Error("Daemon URL is required");
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(daemonUrl);
    } catch (e) {
      throw new Error("Invalid daemon URL format");
    }

    // Only allow HTTP and HTTPS protocols
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("Daemon URL must use HTTP or HTTPS protocol");
    }
    
    // Validate user ID (if modified)
    if (!userId || userId === "Not generated yet") {
      throw new Error("API Key cannot be empty");
    }

    // Parse blacklist domains
    const blacklistDomains = blacklistText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        if (!line || line.length === 0) return false;
        // Basic domain validation
        return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(line);
      });

    // Update configuration (including potentially modified userId)
    await updateConfig({
      daemonUrl: daemonUrl,
      userId: userId,
      blacklistDomains: blacklistDomains,
    });
    
    // Lock the user ID field after saving
    if (userIdUnlocked) {
      toggleUserIdEdit();
    }

    showStatus("Settings saved successfully!");
  } catch (error) {
    optionsLogger.error({
      error: error.message,
      stack: error.stack,
      msg: "Error saving settings",
    });
    showStatus("Error saving settings: " + error.message, true);
  } finally {
    saveBtn.disabled = false;
  }
}

async function resetSettings() {
  if (
    !confirm(
      "Are you sure you want to reset all settings to defaults? This will not reset your API Key."
    )
  ) {
    return;
  }

  const resetBtn = document.getElementById("resetBtn");
  resetBtn.disabled = true;

  try {
    const currentConfig = await getConfig();

    // Reset to defaults but keep user ID
    await updateConfig({
      daemonUrl: DEFAULT_CONFIG.daemonUrl,
      blacklistDomains: DEFAULT_CONFIG.blacklistDomains,
      userId: currentConfig.userId, // Keep existing user ID
    });

    // Reload the form
    await loadSettings();

    showStatus("Settings reset to defaults");
  } catch (error) {
    optionsLogger.error({
      error: error.message,
      stack: error.stack,
      msg: "Error resetting settings",
    });
    showStatus("Error resetting settings: " + error.message, true);
  } finally {
    resetBtn.disabled = false;
  }
}

// Initialize when page loads
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();

  document.getElementById("saveBtn").addEventListener("click", saveSettings);
  document.getElementById("resetBtn").addEventListener("click", resetSettings);
  document.getElementById("modifyUserIdBtn").addEventListener("click", toggleUserIdEdit);

  // Save on Ctrl+S / Cmd+S
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveSettings();
    }
  });
});
