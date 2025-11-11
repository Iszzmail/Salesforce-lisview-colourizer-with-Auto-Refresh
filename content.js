let settings = {};
let headerIndices = {};
let allCaseNotes = {};

// --- Note Popover "Box" ---
// Create the note popover HTML only once and append it to the body.
function createNotePopover() {
    if (document.getElementById('case-note-popover')) return;

    const popoverHTML = `
        <div id="case-note-popover" class="note-popover" style="display: none; position: absolute; z-index: 9002;">
            <div id="case-note-popover-content" class="note-popover-content">
                <h3 id="case-note-popover-title">Case Notes for: 000000</h3>
                <textarea id="case-note-popover-textarea" placeholder="Add your notes here..."></textarea>
                <div class="note-popover-actions">
                    <button id="case-note-popover-save" class="note-popover-button note-popover-save">Save</button>
                    <button id="case-note-popover-close" class="note-popover-button note-popover-close">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', popoverHTML);

    // Add event listeners for the modal buttons
    document.getElementById('case-note-popover-close').addEventListener('click', hideNotePopover);
    document.getElementById('case-note-popover-save').addEventListener('click', saveCurrentNote);

    // Global click listener to close the popover if clicking outside
    // Use 'mousedown' in capture phase to reliably close popover
    document.addEventListener('mousedown', (e) => {
        const popover = document.getElementById('case-note-popover');
        if (!popover || popover.style.display === 'none') {
            return;
        }
        // Check if the click was inside the popover or on a note button
        const isNoteButton = e.target.closest('.note-icon-btn');
        const isInsidePopover = e.target.closest('#case-note-popover');
        
        if (!isNoteButton && !isInsidePopover) {
            hideNotePopover();
        }
    }, true);
}

function showNotePopover(caseNumber, buttonElement) {
    const popover = document.getElementById('case-note-popover');
    const modalTitle = document.getElementById('case-note-popover-title');
    const modalTextarea = document.getElementById('case-note-popover-textarea');

    // Hide if already open for this button
    if (popover.style.display === 'block' && popover.dataset.caseNumber === caseNumber) {
        hideNotePopover();
        return;
    }

    modalTitle.textContent = `Case Notes for: ${caseNumber}`;
    modalTextarea.value = allCaseNotes[caseNumber] || '';
    popover.dataset.caseNumber = caseNumber; // Store the case number
    
    // Position the popover
    const rect = buttonElement.getBoundingClientRect();
    const popoverWidth = 400; // Must match CSS
    const popoverHeight = 250; // Estimated height

    let top = window.scrollY + rect.bottom + 5;
    let left = window.scrollX + rect.left;

    // If it goes off-screen to the right, move it to the left of the icon
    if (left + popoverWidth > window.innerWidth) {
        left = window.scrollX + rect.right - popoverWidth;
    }
    
    // If it goes off-screen to the bottom, move it above the icon
    if (top + popoverHeight > window.innerHeight + window.scrollY) {
        top = window.scrollY + rect.top - popoverHeight - 5;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    
    popover.style.display = 'block';
    modalTextarea.focus();
}

function hideNotePopover() {
    const popover = document.getElementById('case-note-popover');
    if (popover) {
        popover.style.display = 'none';
    }
}

function saveCurrentNote() {
    const popover = document.getElementById('case-note-popover');
    const caseNumber = popover.dataset.caseNumber;
    const noteText = document.getElementById('case-note-popover-textarea').value;

    if (!caseNumber) return;

    allCaseNotes[caseNumber] = noteText.trim();

    // Update storage
    chrome.storage.sync.get(['caseNotes'], (data) => {
        let notes = data.caseNotes || {};
        if (noteText.trim() === '') {
            delete notes[caseNumber]; // Remove note if it's empty
        } else {
            notes[caseNumber] = noteText.trim();
        }
        // Save notes back to sync storage
        chrome.storage.sync.set({ ...settings, caseNotes: notes }, () => {
            console.log(`Note saved for ${caseNumber}`);
            hideNotePopover();
            // Update the icon state immediately and re-apply styling
            // (which will now skip coloring if a note exists)
            processViews();
        });
    });
}
// --- End of Note Popover ---


function parseSalesforceDate(dateString) {
    if (!dateString || typeof dateString !== 'string') { return null; }
    const todayMatch = dateString.match(/today at (\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (todayMatch) {
        let [, hours, minutes, period] = todayMatch;
        hours = parseInt(hours, 10);
        if (period.toLowerCase() === 'pm' && hours < 12) { hours += 12; }
        if (period.toLowerCase() === 'am' && hours === 12) { hours = 0; }
        const date = new Date();
        date.setHours(hours, parseInt(minutes, 10), 0, 0);
        return date;
    }
    const fullDateMatch = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
    if (fullDateMatch) {
        let [, month, day, year, hours, minutes, period] = fullDateMatch;
        hours = parseInt(hours, 10);
        if (period.toLowerCase() === 'pm' && hours < 12) { hours += 12; }
        if (period.toLowerCase() === 'am' && hours === 12) { hours = 0; }
        return new Date(year, month - 1, day, hours, minutes);
    }
    return null;
}

function getHeaderIndices(table) {
    const indices = {};
    const headers = table.querySelectorAll('thead th');
    headers.forEach((th, index) => {
        const text = (th.getAttribute('aria-label') || th.textContent).trim();
        
        // Find standard columns
        if (text.includes('Account Support Tier')) indices.supportTier = index;
        if (text.includes('Account Name')) indices.accountName = index;
        if (text.includes('First Response')) indices.firstResponse = index;
        if (text === 'Status') indices.status = index;
        if (text.includes('JIRA Status')) indices.jiraStatus = index;
        if (text.includes('Last Modified Date')) indices.lastModified = index;
        if (text.includes('Case Number')) indices.caseNumber = index;
        if (text.includes('Subject')) indices.subject = index; // Target for notes
    });
    return indices;
}


function applyStylingAndNotes(row) {
    if (!row) return;
    
    // --- Reset Styles ---
    row.style.backgroundColor = '';
    row.classList.remove('platinum-support-row');
    let appliedColor = null;

    const cells = row.querySelectorAll('td, th');
    if (cells.length === 0) return;

    // --- Gather Data for Rules ---
    const rules = {
        supportTier: (headerIndices.supportTier !== undefined && cells[headerIndices.supportTier]) ? cells[headerIndices.supportTier].textContent.trim() : null,
        accountName: (headerIndices.accountName !== undefined && cells[headerIndices.accountName]) ? cells[headerIndices.accountName].textContent.trim() : null,
        firstResponse: (headerIndices.firstResponse !== undefined && cells[headerIndices.firstResponse]) ? cells[headerIndices.firstResponse].textContent.trim() : null,
        status: (headerIndices.status !== undefined && cells[headerIndices.status]) ? cells[headerIndices.status].textContent.trim() : null,
        jiraStatus: (headerIndices.jiraStatus !== undefined && cells[headerIndices.jiraStatus]) ? cells[headerIndices.jiraStatus].textContent.trim() : null,
        lastModifiedText: (headerIndices.lastModified !== undefined && cells[headerIndices.lastModified]) ? cells[headerIndices.lastModified].textContent.trim() : null,
        caseNumber: (headerIndices.caseNumber !== undefined && cells[headerIndices.caseNumber]) ? cells[headerIndices.caseNumber].textContent.trim() : null,
    };
    
    const hasNote = !!(rules.caseNumber && allCaseNotes[rules.caseNumber]);

    // --- 1. Apply Coloring Rules (ONLY if no note exists) ---
    if (!hasNote) {
        const lastModifiedDate = parseSalesforceDate(rules.lastModifiedText);
        const isOld = lastModifiedDate && lastModifiedDate < new Date(Date.now() - 24 * 60 * 60 * 1000);
        const isJiraClosed = rules.jiraStatus && ['released', 'done', 'cancelled', 'canceled'].includes(rules.jiraStatus.toLowerCase());
        const isTechnicalIssue = rules.status && rules.status.toLowerCase() === 'technical issue/bug';

        if (settings.enableActionNeeded && isJiraClosed && isTechnicalIssue && isOld) {
            appliedColor = settings.colorActionNeeded;
        }
        if (!appliedColor && settings.enablePlatinumSupport && rules.supportTier && rules.supportTier.toUpperCase() === 'PLATINUM SUPPORT') {
            row.classList.add('platinum-support-row');
            appliedColor = settings.colorPlatinumSupport;
        }
        if (!appliedColor && settings.accountRules && rules.accountName) {
            for (const name in settings.accountRules) {
                if (rules.accountName.toLowerCase() === name.toLowerCase()) {
                    appliedColor = settings.accountRules[name];
                    break;
                }
            }
        }
        if (!appliedColor && settings.enableEmptyFirstResponse && (rules.firstResponse === null || rules.firstResponse === '')) {
            appliedColor = settings.colorEmptyFirstResponse;
        }
        if (!appliedColor && settings.enableJiraStatus && isJiraClosed) {
            appliedColor = settings.colorJiraStatus;
        }
        if (!appliedColor && settings.enableOldLastModified && isOld) {
            appliedColor = settings.colorOldLastModified;
        }
        if (appliedColor) {
            row.style.backgroundColor = appliedColor;
        }
    } else {
         row.style.backgroundColor = ''; // Explicitly clear color if note exists
    }


    // --- 2. Inject Notes Button ---
    if (headerIndices.subject !== undefined && rules.caseNumber) {
        const subjectCell = cells[headerIndices.subject];
        if (!subjectCell) return;

        // Find the container inside the cell
        const cellContainer = subjectCell.querySelector('span.slds-grid');
        if (!cellContainer) return;

        // Check if we've already added the button
        let noteBtn = cellContainer.querySelector('.note-icon-btn');
        
        if (!noteBtn) {
            // Create the new button
            noteBtn = document.createElement('button');
            noteBtn.className = 'note-icon-btn';
            noteBtn.dataset.caseNumber = rules.caseNumber;
            noteBtn.title = 'View/Add Note';
            
            // Add SVG icon inside the button
            noteBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z"></path><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd"></path></svg>`;
            
            noteBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Stop click from propagating to the row link
                e.preventDefault();  // Stop click from navigating
                showNotePopover(rules.caseNumber, e.currentTarget);
            });
            
            // Add the button to the cell container
            cellContainer.appendChild(noteBtn);
        }
        
        // Always update the active state
        if (noteBtn) {
            noteBtn.classList.toggle('note-icon-btn--active', hasNote);
        }
    }
}

// (The other helper functions: processSplitViewItem, processActiveRecordView, cleanupStyles remain the same)
function processSplitViewItem(item) {
    if (!item) return;
    item.classList.remove('platinum-support-row');
    const accountNameEl = Array.from(item.querySelectorAll('a[data-recordid] .uiOutputText')).find(el => {
        const text = el.textContent.trim();
        return isNaN(text) && !text.includes('/');
    });
    const rules = {
        accountName: accountNameEl ? accountNameEl.textContent.trim() : null,
        lastModifiedText: item.querySelector('span.uiOutputDateTime')?.textContent.trim() || null,
    };
    if (!settings) return;
    
    let appliedColor = null;
    const lastModifiedDate = parseSalesforceDate(rules.lastModifiedText);
    const isOld = lastModifiedDate && lastModifiedDate < new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    if (settings.enablePlatinumSupport && rules.supportTier && rules.supportTier.toUpperCase() === 'PLATINUM SUPPORT') {
        item.classList.add('platinum-support-row');
        appliedColor = settings.colorPlatinumSupport;
    }
    if (!appliedColor && settings.accountRules && rules.accountName) {
        for (const name in settings.accountRules) {
            if (rules.accountName.toLowerCase() === name.toLowerCase()) {
                appliedColor = settings.accountRules[name];
                break;
            }
        }
    }
    if (!appliedColor && settings.enableOldLastModified && isOld) {
        appliedColor = settings.colorOldLastModified;
    }
    if (appliedColor) {
        item.style.backgroundColor = appliedColor;
    }
}
function processActiveRecordView() {
    const entityLabel = document.querySelector('div.entityNameTitle records-entity-label');
    if (entityLabel) {
        if (!entityLabel.hasAttribute('data-original-text')) {
            entityLabel.setAttribute('data-original-text', entityLabel.textContent);
        } else {
            entityLabel.textContent = entityLabel.getAttribute('data-original-text');
        }
    }
    const urlMatch = window.location.pathname.match(/\/Case\/([a-zA-Z0-9]{18})/);
    if (!urlMatch) return;
    const activeRecordId = urlMatch[1];
    const activeListItemLink = document.querySelector(`li.slds-split-view__list-item a[data-recordid="${activeRecordId}"]`);
    if (!activeListItemLink) return;
    const parentLi = activeListItemLink.closest('li.slds-split-view__list-item');
    if (!parentLi) return;
    let jiraStatusValue = null;
    const labels = document.querySelectorAll('span.test-id__field-label');
    const jiraLabel = Array.from(labels).find(el => el.textContent.trim() === 'JIRA Status');
    if (jiraLabel) {
        const valueWrapper = jiraLabel.closest('.slds-form-element')?.querySelector('.test-id__field-value');
        if (valueWrapper) { jiraStatusValue = valueWrapper.textContent.trim(); }
    }
    if (settings.enableJiraStatus && jiraStatusValue && ['released', 'done', 'cancelled', 'canceled'].includes(jiraStatusValue.toLowerCase())) {
        if (entityLabel) { entityLabel.textContent = `Jira is ${jiraStatusValue}`; }
        if (!parentLi.style.backgroundColor) {
             // Simplified call for split view
            parentLi.style.backgroundColor = settings.colorJiraStatus;
        }
    }
}
function cleanupStyles() {
    document.querySelectorAll('[style*="background-color"]').forEach(el => {
        if (el.style.backgroundColor) { el.style.backgroundColor = ''; }
    });
    document.querySelectorAll('.platinum-support-row').forEach(el => {
        el.classList.remove('platinum-support-row');
    });
    const entityLabel = document.querySelector('div.entityNameTitle records-entity-label');
    if (entityLabel && entityLabel.hasAttribute('data-original-text')) {
        entityLabel.textContent = entityLabel.getAttribute('data-original-text');
    }
}

let running = false;
let debounceTimer;

function processViews() {
    if (!chrome.runtime?.id) { return; } // Check if extension is still valid
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        if (running) return;
        running = true;

        if (!settings || !settings.isGloballyEnabled) {
            cleanupStyles();
            running = false;
            return;
        }

        try {
            const mainTable = document.querySelector('table[role="grid"]');
            if (mainTable) {
                // Get indices first
                headerIndices = getHeaderIndices(mainTable);
                
                // Only proceed if we have the critical columns for notes
                if (headerIndices.caseNumber !== undefined && headerIndices.subject !== undefined) {
                    const rows = mainTable.querySelectorAll('tbody tr');
                    rows.forEach(applyStylingAndNotes);
                }
            }
            
            const splitViewListItems = document.querySelectorAll('li.slds-split-view__list-item');
            if (splitViewListItems.length > 0) {
                splitViewListItems.forEach(processSplitViewItem);
                processActiveRecordView();
            }
        } catch (e) { console.error("Highlighter Error:", e); }
        running = false;
    }, 250); // Debounce to prevent rapid firing
}

function init() {
    createNotePopover(); // Create the popover once on load

    // Load all settings, including notes, into the global variables
    chrome.storage.sync.get(null, (loadedSettings) => {
        settings = loadedSettings;
        allCaseNotes = loadedSettings.caseNotes || {};
        
        const initialCheck = setInterval(() => {
            if (document.querySelector('table[role="grid"]') || document.querySelector('li.slds-split-view__list-item')) {
                clearInterval(initialCheck);
                processViews();
            }
        }, 500);
        // Stop checking after 10 seconds to avoid infinite loops on pages without the target elements
        setTimeout(() => clearInterval(initialCheck), 10000);
    });

    const observer = new MutationObserver(processViews);
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync') {
        // Reload all settings when they change
        chrome.storage.sync.get(null, (loadedSettings) => {
            settings = loadedSettings;
            allCaseNotes = loadedSettings.caseNotes || {};
            processViews();
        });
    }
});

// Listen for the 'Apply' button message from the popup
window.addEventListener('message', (event) => {
    if (event.source === window && event.data.type === 'APPLY_RULES_NOW') {
        processViews();
    }
});

init();