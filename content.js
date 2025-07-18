console.log(' content script loaded.');

function parseSalesforceDateTime(dtString) {
    if (!dtString) return null;
    try {
        const parts = dtString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s(\d{1,2}):(\d{2})\s(AM|PM)/i);
        if (!parts) {
            const date = new Date(dtString);
            return isNaN(date.getTime()) ? null : date;
        }

        const month = parseInt(parts[1], 10) - 1; 
        const day = parseInt(parts[2], 10);
        const year = parseInt(parts[3], 10);
        let hour = parseInt(parts[4], 10);
        const minute = parseInt(parts[5], 10);
        const ampm = parts[6].toUpperCase();

        if (ampm === 'PM' && hour < 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0; 
        
        return new Date(year, month, day, hour, minute);
    } catch (e) {
        console.error('Error parsing date:', dtString, e);
        return null;
    }
}

window.applySalesforceColoring = function() {
    console.log('Applying coloring rules...');
    
    chrome.storage.sync.get({ 
        accountColorRules: [],
        firstResponseRule: { enabled: true, color: '#ffecb3' },
        jiraStatusReleasedRule: { enabled: true, color: '#c8e6c9' },
        lastModifiedRule: { enabled: true, color: '#ffcdd2' }
    }, (data) => {
        const { accountColorRules, firstResponseRule, jiraStatusReleasedRule, lastModifiedRule } = data;
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        
        const tables = document.querySelectorAll('table[role="grid"]');
        
        if (tables.length === 0) {
            console.log("No list view tables found");
            return;
        }

        tables.forEach((table, tableIndex) => {
            const headers = table.querySelectorAll('thead th');
            const rows = table.querySelectorAll('tbody tr');
            if (rows.length === 0) return;

            let accountNameIndex = -1;
            let lastModifiedIndex = -1;
            let firstResponseIndex = -1;
            let jiraStatusIndex = -1;

            headers.forEach((header, index) => {
                const headerText = (header.getAttribute('aria-label') || header.textContent).trim().toLowerCase();
                if (headerText === 'account name') accountNameIndex = index;
                if (headerText === 'last modified date') lastModifiedIndex = index;
                if (headerText === 'first response') firstResponseIndex = index;
                if (headerText === 'jira status') jiraStatusIndex = index;
            });
            
            rows.forEach((row, rowIndex) => {
                row.style.backgroundColor = '';
                const cells = row.querySelectorAll('th, td');
                if(cells.length === 0) return;

                let finalColor = '';

               
                if (lastModifiedRule.enabled && lastModifiedIndex > -1 && cells.length > lastModifiedIndex) {
                    const cell = cells[lastModifiedIndex];
                    const dateElement = cell.querySelector('lightning-formatted-text, span[title]');
                    const dateText = dateElement ? dateElement.textContent.trim() : cell.textContent.trim();
                    
                    if (dateText) {
                        const lastModifiedDate = parseSalesforceDateTime(dateText);
                        if (lastModifiedDate && lastModifiedDate < twentyFourHoursAgo) {
                            finalColor = lastModifiedRule.color;
                        }
                    }
                }

                // 3. Medium Priority
                if (jiraStatusReleasedRule.enabled && jiraStatusIndex > -1 && cells.length > jiraStatusIndex) {
                    const cell = cells[jiraStatusIndex];
                    const jiraStatusText = (cell.querySelector('span[title]') || cell).textContent.trim();
                    
                    const normalizedStatus = jiraStatusText.toLowerCase();
                    if (normalizedStatus === 'released' || normalizedStatus === 'done' || normalizedStatus === 'cancelled') {
                        finalColor = jiraStatusReleasedRule.color;
                    }
                }

                // 2. High Priority
                if (firstResponseRule.enabled && firstResponseIndex > -1 && cells.length > firstResponseIndex) {
                    const cell = cells[firstResponseIndex];
                    const firstResponseText = (cell.querySelector('span[title]') || cell).textContent.trim();
                    
                    if (!firstResponseText) {
                        finalColor = firstResponseRule.color;
                    }
                }

                // 1. Highest Priority: 
                if (accountNameIndex > -1 && cells.length > accountNameIndex) {
                    const cell = cells[accountNameIndex];
                    const accountElement = cell.querySelector('a[title], span'); 
                    const rawAccountNameText = accountElement ? accountElement.textContent.trim() : cell.textContent.trim();

                    if (rawAccountNameText && accountColorRules.length > 0) {
                        const matchingRule = accountColorRules.find(rule => 
                            rule.accountName && rule.accountName.toLowerCase() === rawAccountNameText.toLowerCase()
                        );
                        if (matchingRule) {
                            finalColor = matchingRule.color;
                        }
                    }
                }

                row.style.backgroundColor = finalColor;
            });
        });
        console.log('Coloring rules appliedd.');
    });
};

let mainExecutionTimeout;
let retryAttempts = 0;
const MAX_RETRY_ATTEMPTS = 10; 

function scheduleMainExecution() {
    clearTimeout(mainExecutionTimeout);
    mainExecutionTimeout = setTimeout(() => {
        window.applySalesforceColoring();
    }, 750); 
}

const observer = new MutationObserver((mutationsList, obs) => {
    let relevantChangeDetected = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' || mutation.type === 'subtree') {
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && (node.matches('table[role="grid"] tbody tr') || node.matches('table[role="grid"]'))) {
                        relevantChangeDetected = true;
                        break;
                    }
                }
            }
        }
        if (relevantChangeDetected) break;
    }

    if (relevantChangeDetected) {
        scheduleMainExecution();
        retryAttempts = 0; 
    } else {
        if (retryAttempts < MAX_RETRY_ATTEMPTS) {
            retryAttempts++;
            scheduleMainExecution(); 
        }
    }
});

function startObserver() {
    console.log("Salesforce Colorizer: Attaching observer to document.body...");
    observer.observe(document.body, {
        childList: true, 
        subtree: true,   
        attributes: true, 
        attributeFilter: ['aria-label', 'title', 'class', 'style'] 
    });

    setTimeout(() => {
        console.log("Initial coloring attempt after page load.");
        window.applySalesforceColoring();
    }, 2000); 
}

window.addEventListener('load', startObserver);