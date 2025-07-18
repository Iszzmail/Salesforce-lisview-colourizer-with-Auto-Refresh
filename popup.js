document.addEventListener('DOMContentLoaded', () => {
    const addRuleBtn = document.getElementById('addRule');
    const applyColorsBtn = document.getElementById('applyColors');
    const accountNameInput = document.getElementById('accountName');
    const accountColorInput = document.getElementById('accountColor');
    const rulesList = document.getElementById('rulesList');

    const enableFirstResponseHighlightCheckbox = document.getElementById('enableFirstResponseHighlight');
    const firstResponseColorInput = document.getElementById('firstResponseColor');

    const enableJiraStatusReleasedHighlightCheckbox = document.getElementById('enableJiraStatusReleasedHighlight');
    const jiraStatusReleasedColorInput = document.getElementById('jiraStatusReleasedColor');

    const enableLastModifiedHighlightCheckbox = document.getElementById('enableLastModifiedHighlight');
    const lastModifiedColorInput = document.getElementById('lastModifiedColor');

    function loadSettings() {
        chrome.storage.sync.get({ 
            accountColorRules: [],
            firstResponseRule: { enabled: true, color: '#ffecb3' },
            jiraStatusReleasedRule: { enabled: true, color: '#c8e6c9' },
            lastModifiedRule: { enabled: true, color: '#ffcdd2' }
        }, (data) => {
            rulesList.innerHTML = '';
            data.accountColorRules.forEach((rule, index) => {
                const listItem = document.createElement('li');
                listItem.className = 'rule-item';
                listItem.innerHTML = `
                    <div class="rule-info">
                        <div class="rule-color-box" style="background-color: ${rule.color};"></div>
                        <span class="rule-name">${rule.accountName}</span>
                    </div>
                    <button class="delete-rule" data-index="${index}">&times;</button>
                `;
                rulesList.appendChild(listItem);
            });

            enableFirstResponseHighlightCheckbox.checked = data.firstResponseRule.enabled;
            firstResponseColorInput.value = data.firstResponseRule.color;

            enableJiraStatusReleasedHighlightCheckbox.checked = data.jiraStatusReleasedRule.enabled;
            jiraStatusReleasedColorInput.value = data.jiraStatusReleasedRule.color;

            enableLastModifiedHighlightCheckbox.checked = data.lastModifiedRule.enabled;
            lastModifiedColorInput.value = data.lastModifiedRule.color;
        });
    }

    function saveRuleSetting(ruleName, enabledCheckbox, colorInput) {
        chrome.storage.sync.get({ [ruleName]: { enabled: true, color: '#FFFFFF' } }, (data) => {
            const currentRule = data[ruleName];
            currentRule.enabled = enabledCheckbox.checked;
            currentRule.color = colorInput.value;
            chrome.storage.sync.set({ [ruleName]: currentRule });
        });
    }

    enableFirstResponseHighlightCheckbox.addEventListener('change', () => saveRuleSetting('firstResponseRule', enableFirstResponseHighlightCheckbox, firstResponseColorInput));
    firstResponseColorInput.addEventListener('change', () => saveRuleSetting('firstResponseRule', enableFirstResponseHighlightCheckbox, firstResponseColorInput));

    enableJiraStatusReleasedHighlightCheckbox.addEventListener('change', () => saveRuleSetting('jiraStatusReleasedRule', enableJiraStatusReleasedHighlightCheckbox, jiraStatusReleasedColorInput));
    jiraStatusReleasedColorInput.addEventListener('change', () => saveRuleSetting('jiraStatusReleasedRule', enableJiraStatusReleasedHighlightCheckbox, jiraStatusReleasedColorInput));

    enableLastModifiedHighlightCheckbox.addEventListener('change', () => saveRuleSetting('lastModifiedRule', enableLastModifiedHighlightCheckbox, lastModifiedColorInput));
    lastModifiedColorInput.addEventListener('change', () => saveRuleSetting('lastModifiedRule', enableLastModifiedHighlightCheckbox, lastModifiedColorInput));


    addRuleBtn.addEventListener('click', () => {
        const accountName = accountNameInput.value.trim();
        const color = accountColorInput.value;

        if (accountName) {
            chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
                const newRules = data.accountColorRules;
                const existingRuleIndex = newRules.findIndex(r => r.accountName.toLowerCase() === accountName.toLowerCase());
                
                if (existingRuleIndex > -1) {
                    newRules[existingRuleIndex].color = color;
                } else {
                    newRules.push({ accountName, color });
                }
                
                chrome.storage.sync.set({ accountColorRules: newRules }, () => {
                    accountNameInput.value = '';
                    loadSettings();
                });
            });
        }
    });

    rulesList.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-rule')) {
            const indexToDelete = parseInt(e.target.dataset.index, 10);
            chrome.storage.sync.get({ accountColorRules: [] }, (data) => {
                const newRules = data.accountColorRules.filter((_, index) => index !== indexToDelete);
                chrome.storage.sync.set({ accountColorRules: newRules }, loadSettings);
            });
        }
    });

    applyColorsBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0 && tabs[0].id) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    function: applyAllRules
                });
            } else {
                console.error("No active tab.");
            }
        });
    });

    loadSettings();
});

function applyAllRules() {
    if (window.applySalesforceColoring) {
        window.applySalesforceColoring();
    } else {
        console.error('applySalesforceColoring on the page.');
    }
}