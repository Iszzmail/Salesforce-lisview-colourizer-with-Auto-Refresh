document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        // Main controls
        masterEnableToggle: document.getElementById('master-enable-toggle'),
        rulesContainer: document.getElementById('rules-container'),
        themeToggle: document.getElementById('theme-toggle'),
        applyRulesBtn: document.getElementById('apply-rules-button'),
        // Coloring rule controls
        enableActionNeeded: document.getElementById('enable-action-needed'), colorActionNeeded: document.getElementById('color-action-needed'),
        enablePlatinumSupport: document.getElementById('enable-platinum-support'), colorPlatinumSupport: document.getElementById('color-platinum-support'),
        enableEmptyFirstResponse: document.getElementById('enable-empty-first-response'), colorEmptyFirstResponse: document.getElementById('color-empty-first-response'),
        enableJiraStatus: document.getElementById('enable-jira-status'), colorJiraStatus: document.getElementById('color-jira-status'),
        enableOldLastModified: document.getElementById('enable-old-last-modified'), colorOldLastModified: document.getElementById('color-old-last-modified'),
        // Account rule controls
        accountNameInput: document.getElementById('account-name-input'), accountColorInput: document.getElementById('account-color-input'),
        addAccountRuleBtn: document.getElementById('add-account-rule'), accountRulesList: document.getElementById('account-rules-list'),
        // Auto-refresh controls
        refreshEnableToggle: document.getElementById('refresh-enable-toggle'), refreshControlsContainer: document.getElementById('refresh-controls-container'),
        decreaseIntervalBtn: document.getElementById('decrease-interval'), increaseIntervalBtn: document.getElementById('increase-interval'),
        refreshIntervalDisplay: document.getElementById('refresh-interval-display'), lastRefreshTime: document.getElementById('last-refresh-time'),
        // Notes control
        clearAllNotesBtn: document.getElementById('clear-all-notes')
    };

    const defaultSettings = {
        isGloballyEnabled: true, theme: 'dark',
        enableActionNeeded: true, colorActionNeeded: '#ff4d4d',
        enablePlatinumSupport: true, colorPlatinumSupport: '#D4AF37',
        enableEmptyFirstResponse: true, colorEmptyFirstResponse: '#FFC0CB',
        enableJiraStatus: true, colorJiraStatus: '#ADD8E6',
        enableOldLastModified: true, colorOldLastModified: '#FFFFE0',
        accountRules: {},
        caseNotes: {}, // Added for the new feature
        refreshEnabled: false, refreshInterval: 5, targetTabId: null
    };

    // This function handles saving all settings and updating the alarm state
    function saveAllSettings() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTabId = tabs[0] ? tabs[0].id : null;
            if (!currentTabId) return; // Exit if we can't identify the current tab

            const isEnablingRefresh = elements.refreshEnableToggle.checked;

            chrome.storage.sync.get(defaultSettings, (existingSettings) => {
                const settingsToSave = {
                    isGloballyEnabled: elements.masterEnableToggle.checked,
                    theme: document.body.classList.contains('dark-mode') ? 'dark' : 'light',
                    enableActionNeeded: elements.enableActionNeeded.checked, colorActionNeeded: elements.colorActionNeeded.value,
                    enablePlatinumSupport: elements.enablePlatinumSupport.checked, colorPlatinumSupport: elements.colorPlatinumSupport.value,
                    enableEmptyFirstResponse: elements.enableEmptyFirstResponse.checked, colorEmptyFirstResponse: elements.colorEmptyFirstResponse.value,
                    enableJiraStatus: elements.enableJiraStatus.checked, colorJiraStatus: elements.colorJiraStatus.value,
                    enableOldLastModified: elements.enableOldLastModified.checked, colorOldLastModified: elements.colorOldLastModified.value,
                    accountRules: getAccountRulesFromDOM(),
                    caseNotes: existingSettings.caseNotes, // Preserve existing notes
                    refreshEnabled: isEnablingRefresh,
                    refreshInterval: parseInt(elements.refreshIntervalDisplay.textContent, 10),
                    // If enabling refresh, target this tab. If disabling, clear the target.
                    targetTabId: isEnablingRefresh ? currentTabId : null
                };
    
                chrome.storage.sync.set(settingsToSave, updateRefreshAlarm);
            });
        });
    }

    function loadSettings() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTabId = tabs[0] ? tabs[0].id : null;
            
            chrome.storage.sync.get(defaultSettings, (settings) => {
                // Load all coloring and theme settings
                elements.masterEnableToggle.checked = settings.isGloballyEnabled;
                updateUIAccessibility(settings.isGloballyEnabled);
                applyTheme(settings.theme);
                elements.themeToggle.checked = (settings.theme === 'light');
                elements.enableActionNeeded.checked = settings.enableActionNeeded; elements.colorActionNeeded.value = settings.colorActionNeeded;
                elements.enablePlatinumSupport.checked = settings.enablePlatinumSupport; elements.colorPlatinumSupport.value = settings.colorPlatinumSupport;
                elements.enableEmptyFirstResponse.checked = settings.enableEmptyFirstResponse; elements.colorEmptyFirstResponse.value = settings.colorEmptyFirstResponse;
                elements.enableJiraStatus.checked = settings.enableJiraStatus; elements.colorJiraStatus.value = settings.colorJiraStatus;
                elements.enableOldLastModified.checked = settings.enableOldLastModified; elements.colorOldLastModified.value = settings.colorOldLastModified;
                renderAccountRules(settings.accountRules);

                // Configure the auto-refresh UI based on the current tab
                const isRefreshActiveOnThisTab = settings.refreshEnabled && settings.targetTabId === currentTabId;
                elements.refreshEnableToggle.checked = isRefreshActiveOnThisTab;
                elements.refreshIntervalDisplay.textContent = settings.refreshInterval;
                elements.refreshControlsContainer.classList.toggle('disabled', !isRefreshActiveOnThisTab);
                
                // If refresh is enabled but on a *different* tab, disable the toggle to prevent conflicts.
                elements.refreshEnableToggle.disabled = (settings.refreshEnabled && !isRefreshActiveOnThisTab);
            });

            chrome.storage.local.get({ lastRefreshTime: null }, (data) => {
                elements.lastRefreshTime.textContent = data.lastRefreshTime ? new Date(data.lastRefreshTime).toLocaleTimeString() : 'Never';
            });
        });
    }

    function updateRefreshAlarm() {
        chrome.storage.sync.get(['refreshEnabled', 'refreshInterval', 'targetTabId'], (settings) => {
            chrome.alarms.clear("salesforceRefresher", () => {
                if (settings.refreshEnabled && settings.targetTabId) {
                    chrome.alarms.create("salesforceRefresher", { periodInMinutes: settings.refreshInterval });
                }
            });
        });
    }

    function updateUIAccessibility(isEnabled) { elements.rulesContainer.classList.toggle('disabled', !isEnabled); }
    function applyTheme(theme) { document.body.classList.remove('dark-mode', 'light-mode'); document.body.classList.add(theme === 'dark' ? 'dark-mode' : 'light-mode'); }

    function renderAccountRules(rules) {
        elements.accountRulesList.innerHTML = '';
        for (const name in rules) {
            const ruleItem = document.createElement('div');
            ruleItem.className = 'account-rule-item';
            ruleItem.dataset.name = name;
            ruleItem.innerHTML = `<div class="account-info"><div class="color-box" style="background-color: ${rules[name]};"></div><span>${name}</span></div><button class="delete-button" title="Delete Rule">&times;</button>`;
            ruleItem.querySelector('.delete-button').addEventListener('click', () => {
                delete rules[name];
                renderAccountRules(rules);
                saveAllSettings();
            });
            elements.accountRulesList.appendChild(ruleItem);
        }
    }

    function getAccountRulesFromDOM() {
        const rules = {};
        elements.accountRulesList.querySelectorAll('.account-rule-item').forEach(item => {
            rules[item.dataset.name] = item.querySelector('.color-box').style.backgroundColor;
        });
        return rules;
    }

    // --- Event Listeners ---
    elements.masterEnableToggle.addEventListener('change', saveAllSettings);
    elements.themeToggle.addEventListener('change', () => { applyTheme(elements.themeToggle.checked ? 'light' : 'dark'); saveAllSettings(); });
    elements.refreshEnableToggle.addEventListener('change', () => { elements.refreshControlsContainer.classList.toggle('disabled', !elements.refreshEnableToggle.checked); saveAllSettings(); });
    elements.decreaseIntervalBtn.addEventListener('click', () => { let c = parseInt(elements.refreshIntervalDisplay.textContent, 10); if (c > 1) { elements.refreshIntervalDisplay.textContent = c - 1; saveAllSettings(); } });
    elements.increaseIntervalBtn.addEventListener('click', () => { elements.refreshIntervalDisplay.textContent = parseInt(elements.refreshIntervalDisplay.textContent, 10) + 1; saveAllSettings(); });
    elements.addAccountRuleBtn.addEventListener('click', () => { const name = elements.accountNameInput.value.trim(); if (name) { let r = getAccountRulesFromDOM(); r[name] = elements.accountColorInput.value; renderAccountRules(r); saveAllSettings(); elements.accountNameInput.value = ''; } });
    
    // Trigger the content script to re-run
    elements.applyRulesBtn.addEventListener('click', () => { 
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { 
            if (tabs[0]) { 
                chrome.scripting.executeScript({ 
                    target: { tabId: tabs[0].id }, 
                    func: () => window.postMessage({ type: 'APPLY_RULES_NOW' }, '*') 
                }); 
            } 
        }); 
    });
    
    // Listener for the new Clear Notes button
    elements.clearAllNotesBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to delete ALL saved case notes? This cannot be undone.")) {
            chrome.storage.sync.get(defaultSettings, (settings) => {
                settings.caseNotes = {}; // Clear just the notes
                chrome.storage.sync.set(settings, () => {
                    console.log("All case notes cleared.");
                    // Manually trigger an update on the page
                    elements.applyRulesBtn.click();
                });
            });
        }
    });

    document.querySelectorAll('input[type="checkbox"], input[type="color"]').forEach(el => { if (!['theme-toggle', 'master-enable-toggle', 'refresh-enable-toggle'].includes(el.id)) { el.addEventListener('change', saveAllSettings); } });

    loadSettings();
});