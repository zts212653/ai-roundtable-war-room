// Side Panel Logic for AI Roundtable

let activeTabs = {
    gemini: null,
    claude: null,
    gpt: null,
    aistudio: null
};

// State for persistence
let chatHistory = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Buttons
    document.getElementById('btn-scan').addEventListener('click', scanForTabs);
    document.getElementById('btn-distribute').addEventListener('click', broadcastPrompt);
    document.getElementById('btn-collect').addEventListener('click', harvestResponses);

    document.getElementById('btn-clear').addEventListener('click', clearSession);
    document.getElementById('btn-rollcall').addEventListener('click', sendRollCall);

    // 2. Load State
    await loadState();

    // 3. Initial Scan
    scanForTabs();
});

// --- Persistence & State ---

async function loadState() {
    const result = await chrome.storage.local.get(['chatHistory']);
    if (result.chatHistory) {
        chatHistory = result.chatHistory;
        renderHistory();
    }
}

async function saveState() {
    await chrome.storage.local.set({ chatHistory: chatHistory });
}

function clearSession() {
    if (confirm('Clear entire session history?')) {
        chatHistory = [];
        saveState();
        renderHistory();
    }
}

function renderHistory() {
    const container = document.getElementById('chat-stream');
    container.innerHTML = ''; // Clear current view

    if (chatHistory.length === 0) {
        container.innerHTML = `
        <div id="empty-state" class="message-block" style="text-align:center; color:#555; font-style:italic;">
            War Room initialized.<br>Waiting for orders.
        </div>`;
        return;
    }

    chatHistory.forEach((msg, index) => {
        const div = createMessageElement(msg, index);
        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

// --- Message Handling ---

function createMessageElement(msg, index) {
    const div = document.createElement('div');
    div.className = 'message-block';

    const labelRow = document.createElement('div');
    labelRow.className = 'msg-sender';

    const nameSpan = document.createElement('span');
    nameSpan.className = `sender-${msg.type}`;
    nameSpan.innerText = msg.sender;

    // Controls (Delete)
    const controlsSpan = document.createElement('span');
    controlsSpan.className = 'msg-controls';

    const btnDel = document.createElement('button');
    btnDel.className = 'btn-mini';
    btnDel.innerText = '🗑️';
    btnDel.onclick = () => deleteMessage(index);

    controlsSpan.appendChild(btnDel);

    labelRow.appendChild(nameSpan);
    labelRow.appendChild(controlsSpan);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.contentEditable = true; // Allow editing

    // Highlight @Mentions
    contentDiv.innerHTML = formatTextWithMentions(msg.text);

    // Save on edit
    contentDiv.addEventListener('blur', () => {
        // Strip HTML (innerText) for saving to keep clean state
        if (chatHistory[index].text !== contentDiv.innerText) {
            chatHistory[index].text = contentDiv.innerText;
            saveState();
            // Re-render to highlight again
            contentDiv.innerHTML = formatTextWithMentions(contentDiv.innerText);
        }
    });

    div.appendChild(labelRow);
    div.appendChild(contentDiv);

    return div;
}

function addMessage(sender, text, type) {
    // Clean up text
    text = text.trim();
    if (!text) return;

    // Filter out common pollution
    text = text.replace(/^(Thinking\.\.\.|ChatGPT\s*said:|Here is the response|Answer:)/i, '').trim();

    const msg = { sender, text, type, timestamp: Date.now() };
    chatHistory.push(msg);
    saveState();

    // Optimistic append
    const container = document.getElementById('chat-stream');
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.remove();

    const div = createMessageElement(msg, chatHistory.length - 1);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function deleteMessage(index) {
    if (confirm('Delete this message?')) {
        chatHistory.splice(index, 1);
        saveState();
        renderHistory();
    }
}


// --- Tab Linking ---

async function scanForTabs() {
    console.log('Scanning for tabs...');
    const tabs = await chrome.tabs.query({});

    // Reset
    activeTabs = { gemini: null, claude: null, gpt: null, aistudio: null };
    updateStatusUI('gemini', false);
    updateStatusUI('claude', false);
    updateStatusUI('gpt', false);
    updateStatusUI('aistudio', false);

    // We scan all tabs, but we only bind to the LAST one found for each type.
    // This is simple "latest one wins" logic.
    tabs.forEach(tab => {
        if (tab.url.includes('gemini.google.com')) {
            activeTabs.gemini = tab.id;
        }
        else if (tab.url.includes('claude.ai')) {
            activeTabs.claude = tab.id;
        }
        else if (tab.url.includes('chatgpt.com')) {
            activeTabs.gpt = tab.id;
        }
        else if (tab.url.includes('aistudio.google.com')) {
            activeTabs.aistudio = tab.id;
        }
    });

    // Collect distinct IDs of the agents we actually bound to
    const uniqueAgentTabIds = Object.values(activeTabs).filter(id => id !== null);

    // Update UI based on what we found
    updateStatusUI('gemini', !!activeTabs.gemini);
    updateStatusUI('claude', !!activeTabs.claude);
    updateStatusUI('gpt', !!activeTabs.gpt);
    updateStatusUI('aistudio', !!activeTabs.aistudio);

    if (uniqueAgentTabIds.length > 0) {
        // Smart Grouping: Only group the active agents.
        try {
            const groupId = await chrome.tabs.group({ tabIds: uniqueAgentTabIds });
            await chrome.tabGroups.update(groupId, {
                title: 'AI Roundtable',
                color: 'purple',
                collapsed: false
            });
            logSystem(`Grouped ${uniqueAgentTabIds.length} active agents.`);
        } catch (e) {
            console.warn('Grouping failed (maybe different windows?)', e);
        }
    } else {
        logSystem(`No agents found. Open AI tabs first.`);
    }

    logSystem('Scan complete. Ready.');
}

function updateStatusUI(agent, isActive) {
    const dot = document.getElementById(`status-${agent}`);
    if (dot) {
        dot.className = isActive ? 'status-dot active' : 'status-dot missing';
    }
}


// --- Core Actions ---

function getContextBlockForAgent(targetAgentName) {
    const includeHistory = document.getElementById('chk-include-history').checked;
    if (!includeHistory || chatHistory.length === 0) return '';

    const smartContext = document.getElementById('chk-smart-context').checked;

    // Build context string
    let context = "\n\n--- PREVIOUS ROUNDTABLE CONTEXT ---\n";
    let count = 0;

    chatHistory.forEach(msg => {
        // Smart Context: Skip if the message sender matches the target agent
        // Check case insensitive? sender is usually "Gemini", "Claude" etc.
        // Assuming user hasn't edited the sender name.
        if (smartContext && msg.sender === targetAgentName) {
            return;
        }

        context += `[${msg.sender}]: ${msg.text}\n\n`;
        count++;
    });

    if (count === 0) return '';

    context += "--- END CONTEXT ---\n(Resuming discussion...)\n\n";
    return context;
}

async function broadcastPrompt() {
    let rawPrompt = document.getElementById('prompt-input').value;
    if (!rawPrompt.trim()) return;

    // 1. Add User message to local history FIRST
    addMessage('You', rawPrompt, 'user');

    const agents = [
        { key: 'gemini', name: 'Gemini', chk: 'chk-gemini' },
        { key: 'claude', name: 'Claude', chk: 'chk-claude' },
        { key: 'gpt', name: 'ChatGPT', chk: 'chk-gpt' },
        { key: 'aistudio', name: 'AI Studio', chk: 'chk-aistudio' }
    ];

    agents.forEach(agent => {
        if (activeTabs[agent.key] && document.getElementById(agent.chk).checked) {

            // 2. Prepare Context (Unique per agent)
            const context = getContextBlockForAgent(agent.name);
            const finalPrompt = context + rawPrompt;

            logSystem(`Broadcasting to ${agent.name} (Ctx Len: ${context.length})`);

            chrome.tabs.sendMessage(activeTabs[agent.key], {
                action: 'DISTRIBUTE_PROMPT',
                prompt: finalPrompt
            }, (res) => {
                if (chrome.runtime.lastError) {
                    logSystem(`${agent.name}: Error - ${chrome.runtime.lastError.message}`);
                } else if (res && res.success) {
                    logSystem(`${agent.name}: Sent`);
                } else {
                    logSystem(`${agent.name}: Failed to send`);
                }
            });
        }
    });

    // Clear Input
    document.getElementById('prompt-input').value = '';
}

async function harvestResponses() {
    logSystem('Harvesting responses...');

    const agents = [
        { key: 'gemini', name: 'Gemini', chk: 'chk-gemini', style: 'gemini' },
        { key: 'claude', name: 'Claude', chk: 'chk-claude', style: 'claude' },
        { key: 'gpt', name: 'ChatGPT', chk: 'chk-gpt', style: 'gpt' },
        { key: 'aistudio', name: 'AI Studio', chk: 'chk-aistudio', style: 'aistudio' }
    ];

    agents.forEach(agent => {
        if (activeTabs[agent.key] && document.getElementById(agent.chk).checked) {
            chrome.tabs.sendMessage(activeTabs[agent.key], {
                action: 'HARVEST_LATEST'
            }, (res) => {
                if (chrome.runtime.lastError) {
                    // Feedback on connection loss
                    logSystem(`${agent.name}: Connection Error (Reload AI Tab?)`);
                } else if (res && res.success) {
                    const isDup = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].text === res.text;
                    if (!isDup) {
                        addMessage(agent.name, res.text, agent.style);
                    } else {
                        logSystem(`${agent.name}: No new response (Duplicate)`);
                    }
                } else {
                    logSystem(`${agent.name}: No response found`);
                }
            });
        }
    });
}

function sendRollCall() {
    const prompt = "Please state your name and your core capabilities briefly for the roundtable record.";
    document.getElementById('prompt-input').value = prompt;
}

function formatTextWithMentions(text) {
    if (!text) return '';
    // Escape HTML first
    let safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Highlight @Name (word boundary)
    return safe.replace(/(@[\w\u4e00-\u9fa5]+)/g, '<span class="mention-tag">$1</span>');
}

// UI Helpers
function logSystem(msg) {
    console.log(`[Roundtable] ${msg}`);
}
