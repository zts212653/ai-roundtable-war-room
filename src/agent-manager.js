import { AGENT_CONFIG } from './config.js';
import { state } from './state.js';
import { logSystem } from './logger.js';
import { addMessage, deleteMessage } from './chat.js'; // used for adding user prompt and harvested responses
import { broadcastPresence } from './p2p.js';

export async function scanForTabs() {
    console.log('Scanning for tabs...');
    const tabs = await chrome.tabs.query({});

    // Reset
    state.activeTabs = { gemini: null, claude: null, gpt: null, aistudio: null };

    tabs.forEach(tab => {
        if (tab.url.includes('gemini.google.com')) state.activeTabs.gemini = tab.id;
        else if (tab.url.includes('claude.ai')) state.activeTabs.claude = tab.id;
        else if (tab.url.includes('chatgpt.com')) state.activeTabs.gpt = tab.id;
        else if (tab.url.includes('aistudio.google.com')) state.activeTabs.aistudio = tab.id;
    });

    // Collect distinct IDs
    const uniqueAgentTabIds = Object.values(state.activeTabs).filter(id => id !== null);

    // Render Active Agents List
    const container = document.getElementById('active-agents-list');
    container.innerHTML = '';

    if (uniqueAgentTabIds.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color:#555; text-align:center; padding:10px;">Please click Scan to find AI tabs.</div>';
    } else {
        Object.keys(state.activeTabs).forEach(key => {
            if (state.activeTabs[key]) {
                const config = AGENT_CONFIG[key];
                const row = document.createElement('div');
                row.className = 'agent-row';

                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.id = `chk-${key}`;
                chk.className = 'agent-checkbox';
                chk.checked = true;

                const label = document.createElement('label');
                label.htmlFor = `chk-${key}`;
                label.innerText = config.name;
                label.style.cursor = 'pointer';

                const dot = document.createElement('div');
                dot.className = 'status-dot active';
                dot.style.backgroundColor = config.color;

                row.appendChild(chk);
                row.appendChild(label);
                row.appendChild(dot);
                container.appendChild(row);
            }
        });
    }

    if (uniqueAgentTabIds.length > 0) {
        try {
            const groupId = await chrome.tabs.group({ tabIds: uniqueAgentTabIds });
            await chrome.tabGroups.update(groupId, {
                title: 'AI Roundtable',
                color: 'purple',
                collapsed: false
            });
            logSystem(`Grouped ${uniqueAgentTabIds.length} active agents.`);
        } catch (e) {
            console.warn('Grouping failed', e);
        }
    } else {
        logSystem(`No agents found. Open AI tabs first.`);
    }

    logSystem('Scan complete. Ready.');
    if (state.lanConnected) broadcastPresence();
}

function getContextBlockForAgent(targetAgentName) {
    const includeHistory = document.getElementById('chk-include-history') && document.getElementById('chk-include-history').checked;
    if (!includeHistory || state.chatHistory.length === 0) return '';

    const smartContext = document.getElementById('chk-smart-context') && document.getElementById('chk-smart-context').checked;

    let context = "\n\n--- PREVIOUS ROUNDTABLE CONTEXT ---\n";
    let count = 0;

    state.chatHistory.forEach(msg => {
        if (smartContext && msg.sender === targetAgentName) return;
        context += `[${msg.sender}]: ${msg.text}\n\n`;
        count++;
    });

    if (count === 0) return '';
    context += "--- END CONTEXT ---\n(Resuming discussion...)\n\n";
    return context;
}

export async function broadcastPrompt() {
    let rawPrompt = document.getElementById('prompt-input').value;
    if (!rawPrompt.trim()) return;

    // 1. Add User message to local history FIRST
    const username = document.getElementById('my-username').value.trim() || 'You';
    addMessage(username, rawPrompt, 'user');

    // 2. Trigger Local AI
    distributeToAgents(rawPrompt);

    // Clear Input
    document.getElementById('prompt-input').value = '';
}

export function distributeToAgents(rawPrompt) {
    const agents = Object.keys(AGENT_CONFIG).map(key => ({
        key: key,
        name: AGENT_CONFIG[key].name,
        chk: `chk-${key}`
    }));

    agents.forEach(agent => {
        const checkbox = document.getElementById(agent.chk);
        if (state.activeTabs[agent.key] && checkbox && checkbox.checked) {

            const context = getContextBlockForAgent(agent.name);
            const finalPrompt = context + rawPrompt;

            logSystem(`Broadcasting to ${agent.name} (Ctx Len: ${context.length})`);

            chrome.tabs.sendMessage(state.activeTabs[agent.key], {
                action: 'DISTRIBUTE_PROMPT',
                prompt: finalPrompt
            }, (res) => {
                if (chrome.runtime.lastError) {
                    let errMsg = chrome.runtime.lastError.message;
                    if (errMsg.includes('Receiving end does not exist')) {
                        errMsg += ' (Try refreshing the AI tab)';
                    }
                    logSystem(`${agent.name}: Error - ${errMsg}`);
                } else if (res && res.success) {
                    logSystem(`${agent.name}: Sent`);
                } else {
                    logSystem(`${agent.name}: Failed to send`);
                }
            });
        }
    });
}

export async function harvestResponses() {
    logSystem('Harvesting responses...');

    const agents = Object.keys(AGENT_CONFIG).map(key => ({
        key: key,
        name: AGENT_CONFIG[key].name,
        chk: `chk-${key}`,
        style: key
    }));

    agents.forEach(agent => {
        const checkbox = document.getElementById(agent.chk);
        if (state.activeTabs[agent.key] && checkbox && checkbox.checked) {
            chrome.tabs.sendMessage(state.activeTabs[agent.key], {
                action: 'HARVEST_LATEST'
            }, (res) => {
                if (chrome.runtime.lastError) {
                    let errMsg = chrome.runtime.lastError.message;
                    if (errMsg.includes('Receiving end does not exist')) {
                        errMsg += ' (Try refreshing the AI tab)';
                    }
                    logSystem(`${agent.name}: Error - ${errMsg}`);
                } else if (res && res.success) {
                    // Smart Duplicate Check
                    const lastMsgFromAgent = state.chatHistory.slice().reverse().find(m => m.sender === agent.name);
                    const isDup = lastMsgFromAgent && lastMsgFromAgent.text === res.text;

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

export function sendRollCall() {
    const prompt = "Please state your name and your core capabilities briefly for the roundtable record.";
    document.getElementById('prompt-input').value = prompt;
}
