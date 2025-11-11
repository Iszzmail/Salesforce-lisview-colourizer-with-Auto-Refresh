// This background script manages the tab-specific auto-refresh alarm.

// Fired when the extension is first installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  // Set default values in both sync (for settings) and local (for session data) storage
  chrome.storage.sync.set({
    refreshEnabled: false,
    refreshInterval: 5,
    targetTabId: null // Stores the ID of the tab to be refreshed
  });
  chrome.storage.local.set({
    lastRefreshTime: null
  });
});

// Function to disable refresh settings if the target tab is closed or invalid
function disableRefresh(reason) {
  chrome.alarms.clear("salesforceRefresher");
  chrome.storage.sync.set({
    refreshEnabled: false,
    targetTabId: null
  });
  console.log(`Salesforce Highlighter: Auto-refresh disabled. Reason: ${reason}`);
}

// Listener for the alarm.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "salesforceRefresher") {
    chrome.storage.sync.get(["targetTabId", "refreshEnabled"], (settings) => {
      if (settings.refreshEnabled && settings.targetTabId) {
        // Check if the tab still exists before trying to reload it.
        chrome.tabs.get(settings.targetTabId, (tab) => {
          // If chrome.runtime.lastError is set, it means the tab has been closed.
          if (chrome.runtime.lastError) {
            disableRefresh(`Target tab ID ${settings.targetTabId} not found.`);
          } else {
            // Tab exists, so we can reload it.
            chrome.tabs.reload(tab.id, () => {
              chrome.storage.local.set({ lastRefreshTime: new Date().toISOString() });
            });
          }
        });
      }
    });
  }
});

// Proactively disable refresh if the target tab is closed by the user.
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.storage.sync.get("targetTabId", (settings) => {
        if (settings.targetTabId === tabId) {
            disableRefresh("Target tab was closed.");
        }
    });
});