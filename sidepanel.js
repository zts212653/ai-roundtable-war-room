// Side Panel Logic for AI Roundtable

// Config
const AGENT_CONFIG = {
    gemini: { name: 'Gemini (App)', color: '#4facfe' },
    claude: { name: 'Claude', color: '#d7a159' },
    gpt: { name: 'ChatGPT', color: '#10a37f' },
    aistudio: { name: 'AI Studio', color: '#ff5252' }
};

let activeTabs = {
    gemini: null,
    claude: null,
    gpt: null,
    aistudio: null
};

// P2P State
let peer = null;
let connections = []; // For Host: list of Guest connections
let hostConn = null;  // For Guest: connection to Host
let lanConnected = false;
let isHost = false;
let peerRoster = {}; // Map<peerId, {name, agents:[]}>

// State for persistence
let chatHistory = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Buttons
    document.getElementById('btn-scan').addEventListener('click', scanForTabs);
    document.getElementById('btn-distribute').addEventListener('click', broadcastPrompt);
    document.getElementById('btn-collect').addEventListener('click', harvestResponses);

    document.getElementById('btn-clear').addEventListener('click', clearSession);
    document.getElementById('btn-rollcall').addEventListener('click', sendRollCall);

    // LAN Listeners
    // LAN Listeners
    document.getElementById('btn-lan-toggle').addEventListener('click', () => {
        document.getElementById('lan-panel').classList.toggle('visible');
    });

    // New P2P UI Handlers
    document.getElementById('btn-mode-host').addEventListener('click', () => {
        document.getElementById('p2p-step-1').classList.add('hidden');
        document.getElementById('p2p-step-host').classList.remove('hidden');
        startLanSession(true);
    });

    document.getElementById('btn-mode-join').addEventListener('click', () => {
        document.getElementById('p2p-step-1').classList.add('hidden');
        document.getElementById('p2p-step-guest').classList.remove('hidden');
    });

    document.getElementById('btn-guest-connect').addEventListener('click', () => {
        const roomId = document.getElementById('guest-room-input').value.trim();
        if (!roomId) return alert('Room ID required');
        startLanSession(false, roomId);
    });

    // Copy ID handler
    document.getElementById('host-room-id').addEventListener('click', (e) => {
        const text = e.target.innerText;
        if (text && text !== 'Generating...') {
            navigator.clipboard.writeText(text);
            logSystem('Copied Room ID to clipboard');
        }
    });

    // 2. Load State
    await loadState();

    // 3. Initial Scan
    scanForTabs();
});

// --- Persistence & State ---

async function loadState() {
    const result = await chrome.storage.local.get(['chatHistory', 'username']);
    if (result.chatHistory) {
        chatHistory = result.chatHistory;
        renderHistory();
    }

    // Username logic
    let name = result.username;
    if (!name) {
        name = 'User-' + Math.floor(Math.random() * 1000);
    }
    document.getElementById('my-username').value = name;

    // Bind listener
    document.getElementById('my-username').addEventListener('change', (e) => {
        const newName = e.target.value.trim() || 'Anonymous';
        chrome.storage.local.set({ username: newName });
        if (lanConnected) broadcastPresence();
    });
}

async function saveState() {
    // Only saves history as per previous logic, username is saved on change
    await chrome.storage.local.set({ chatHistory: chatHistory });
}

function clearSession(fromNetwork = false) {
    if (!fromNetwork && !confirm('Clear entire session history?')) return;

    chatHistory = [];
    saveState();
    renderHistory();

    if (!fromNetwork && lanConnected) {
        lanBroadcast({ type: 'CLEAR_SESSION' });
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

function addMessage(sender, text, type, fromNetwork = false) {
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

    // Network Sync
    console.log(`[DEBUG] addMessage called. fromNetwork=${fromNetwork}, lanConnected=${lanConnected}`);
    if (!fromNetwork && lanConnected) {
        console.log('[DEBUG] Broadcasting NEW_MESSAGE to LAN...');
        lanBroadcast({ type: 'NEW_MESSAGE', payload: msg });
    }
}

function deleteMessage(index, fromNetwork = false) {
    if (!fromNetwork && !confirm('Delete this message?')) return;

    if (chatHistory[index]) {
        chatHistory.splice(index, 1);
        saveState();
        renderHistory();

        if (!fromNetwork && lanConnected) {
            lanBroadcast({ type: 'DELETE_MESSAGE', index: index });
        }
    }
}


// --- LAN Logic ---

// --- P2P Logic (PeerJS) ---

// --- P2P Logic (PeerJS) ---

function startLanSession(hostMode, guestRoomId = null) {
    isHost = hostMode;

    if (peer) {
        peer.off('disconnected'); // Remove listener to prevent UI flash
        peer.destroy();
        peer = null;
    }

    // Initialize Peer with Google STUN servers for better NAT traversal
    const peerConfig = {
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        },
        debug: 1
    };
    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        console.log('My Peer ID is: ' + id);

        if (isHost) {
            document.getElementById('host-room-id').innerText = id;
            updateLanStatus(`🟢 Room Created.`);
            logSystem(`Room Created. Waiting for guests...`);
            lanConnected = true;
            broadcastPresence();
        } else {
            // Guest Mode
            if (!guestRoomId) {
                // Should not happen if UI logic is correct
                return alert('No Room ID provided');
            }
            connectToHost(guestRoomId);
        }
    });



    peer.on('connection', (conn) => {
        // Handle incoming connection (Host side)
        if (isHost) {
            setupConnection(conn);
            logSystem(`New peer joined!`);
            // Sync history to new joiner
            setTimeout(() => {
                if (conn.open) {
                    // 1. Sync History
                    conn.send({ type: 'SYNC_HISTORY', history: chatHistory });

                    // 2. Sync Self Presence
                    broadcastPresence(); // This broadcasts to ALL, which includes the new conn if setupConnection worked right away.

                    // 3. Sync Known Roster to New Guest
                    Object.values(peerRoster).forEach(member => {
                        conn.send({ type: 'PRESENCE', payload: member });
                    });
                }
            }, 1000);
        }
    });

    peer.on('error', (err) => {
        console.error(err);
        updateLanStatus(`⚠️ Error: ${err.type}`);
        logSystem(`P2P Error: ${err.type}`);
    });

    peer.on('disconnected', () => {
        updateLanStatus('🔴 Disconnected from signaling.');
    });
}

function connectToHost(hostId) {
    updateLanStatus(`Connecting to ${hostId}...`);
    const conn = peer.connect(hostId);

    conn.on('open', () => {
        lanConnected = true;
        hostConn = conn;
        updateLanStatus(`🟢 Connected to Room`);
        logSystem(`Joined Room: ${hostId}`);
        setupConnection(conn);
        setTimeout(broadcastPresence, 1000); // Wait a sec for setup
    });

    conn.on('error', (err) => console.error('Conn Error', err));
}

function setupConnection(conn) {
    if (isHost) {
        connections.push(conn);
    }

    conn.on('data', (data) => {
        handleLanMessage(data, conn);
    });

    conn.on('close', () => {
        logSystem('Peer disconnected');
        if (isHost) {
            connections = connections.filter(c => c !== conn);
        } else {
            lanConnected = false;
            hostConn = null;
            updateLanStatus('🔴 Host Left');
        }
    });
}



function updateLanStatus(msg) {
    document.getElementById('lan-status-msg').innerText = msg;
}

function lanBroadcast(data) {
    // If Host: Broadcast to ALL guests
    if (isHost) {
        connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }
    // If Guest: Send to Host
    else if (hostConn && hostConn.open) {
        hostConn.send(data);
    }
}

function handleLanMessage(data, senderConn) {
    console.log('[P2P RX]', data);

    switch (data.type) {
        case 'SYNC_HISTORY':
            // Overwrite local history (usually for Guest)
            if (data.history && Array.isArray(data.history)) {
                chatHistory = data.history;
                renderHistory();
                saveState();
                logSystem(`Synced ${chatHistory.length} messages.`);
            }
            break;

        case 'NEW_MESSAGE':
            // 1. Apply locally
            if (data.payload) {
                addMessage(data.payload.sender, data.payload.text, data.payload.type, true);

                // 1.5 Active Mesh: If this is a USER prompt from the network, trigger MY local agents too.
                if (data.payload.type === 'user') {
                    logSystem(`Mesh Trigger: Running local agents for ${data.payload.sender}...`);
                    distributeToAgents(data.payload.text);
                }

                // 2. If I am HOST, I must forward this to everyone else (Relay)
                if (isHost) {
                    connections.forEach(conn => {
                        if (conn !== senderConn && conn.open) {
                            conn.send(data);
                        }
                    });
                }
            }
            break;

        case 'DELETE_MESSAGE':
            if (typeof data.index === 'number') {
                deleteMessage(data.index, true);
                // Relay if Host
                if (isHost) {
                    connections.forEach(conn => {
                        if (conn !== senderConn && conn.open) {
                            conn.send(data);
                        }
                    });
                }
            }
            break;

        case 'CLEAR_SESSION':
            clearSession(true);
            // Relay if Host
            if (isHost) {
                connections.forEach(conn => {
                    if (conn !== senderConn && conn.open) {
                        conn.send(data);
                    }
                });
            }
            break;

        case 'PRESENCE':
            if (data.payload && data.payload.id) {
                peerRoster[data.payload.id] = data.payload;
                renderRoster();
                if (isHost) {
                    connections.forEach(conn => {
                        if (conn !== senderConn && conn.open) conn.send(data);
                    });
                }
            }
            break;
    }
}


// --- Tab Linking ---

async function scanForTabs() {
    console.log('Scanning for tabs...');
    const tabs = await chrome.tabs.query({});

    // Reset
    activeTabs = { gemini: null, claude: null, gpt: null, aistudio: null };

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

    // Render Active Agents List
    const container = document.getElementById('active-agents-list');
    container.innerHTML = '';

    if (uniqueAgentTabIds.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color:#555; text-align:center; padding:10px;">Please click Scan to find AI tabs.</div>';
    } else {
        Object.keys(activeTabs).forEach(key => {
            if (activeTabs[key]) {
                const config = AGENT_CONFIG[key];

                const row = document.createElement('div');
                row.className = 'agent-row';

                // Checkbox
                const chk = document.createElement('input');
                chk.type = 'checkbox';
                chk.id = `chk-${key}`;
                chk.className = 'agent-checkbox';
                chk.checked = true; // Default checked

                // Label
                const label = document.createElement('label');
                label.htmlFor = `chk-${key}`;
                label.innerText = config.name;
                label.style.cursor = 'pointer';

                // Status Dot
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
    if (lanConnected) broadcastPresence();
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
    const username = document.getElementById('my-username').value.trim() || 'You';
    addMessage(username, rawPrompt, 'user');

    // 2. Trigger Local AI
    distributeToAgents(rawPrompt);

    // Clear Input
    document.getElementById('prompt-input').value = '';
}

function distributeToAgents(rawPrompt) {
    const agents = Object.keys(AGENT_CONFIG).map(key => ({
        key: key,
        name: AGENT_CONFIG[key].name,
        chk: `chk-${key}`
    }));

    agents.forEach(agent => {
        const checkbox = document.getElementById(agent.chk);
        // Logic update: If checkbox exists, respect it. If it doesn't exist (e.g. not scanned), we can't send anyway.
        if (activeTabs[agent.key] && checkbox && checkbox.checked) {

            // Prepare Context
            const context = getContextBlockForAgent(agent.name);
            const finalPrompt = context + rawPrompt;

            logSystem(`Broadcasting to ${agent.name} (Ctx Len: ${context.length})`);

            chrome.tabs.sendMessage(activeTabs[agent.key], {
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

async function harvestResponses() {
    logSystem('Harvesting responses...');

    const agents = Object.keys(AGENT_CONFIG).map(key => ({
        key: key,
        name: AGENT_CONFIG[key].name,
        chk: `chk-${key}`,
        style: key
    }));

    agents.forEach(agent => {
        const checkbox = document.getElementById(agent.chk);
        if (activeTabs[agent.key] && checkbox && checkbox.checked) {
            chrome.tabs.sendMessage(activeTabs[agent.key], {
                action: 'HARVEST_LATEST'
            }, (res) => {
                if (chrome.runtime.lastError) {
                    let errMsg = chrome.runtime.lastError.message;
                    if (errMsg.includes('Receiving end does not exist')) {
                        errMsg += ' (Try refreshing the AI tab)';
                    }
                    logSystem(`${agent.name}: Error - ${errMsg}`);
                } else if (res && res.success) {
                    // Smart Duplicate Check:
                    // Check if the LAST message from THIS agent is identical.
                    const lastMsgFromAgent = chatHistory.slice().reverse().find(m => m.sender === agent.name);

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

    // Also show critical errors or LAN status in the chat directly for debugging
    if (msg.includes('Error') || msg.includes('LAN') || msg.includes('Failed') || msg.includes('Online')) {
        const container = document.getElementById('chat-stream');
        const div = document.createElement('div');
        div.className = 'message-block';
        div.style.padding = '5px';
        div.style.fontSize = '11px';
        div.style.color = msg.includes('Error') || msg.includes('Failed') ? '#ff5252' : '#888';
        div.style.textAlign = 'center';
        div.innerText = `[SYSTEM]: ${msg}`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
}

// --- Presence / Roster ---

function broadcastPresence() {
    if (!lanConnected || !peer) return;

    const username = document.getElementById('my-username').value.trim() || 'Anonymous';
    // Collect active agents
    const agents = [];
    if (activeTabs.gemini) agents.push('Gemini');
    if (activeTabs.claude) agents.push('Claude');
    if (activeTabs.gpt) agents.push('ChatGPT');
    if (activeTabs.aistudio) agents.push('AI Studio');

    const payload = {
        id: peer.id,
        name: username,
        agents: agents,
        isHost: isHost
    };

    // Update own roster entry
    peerRoster[peer.id] = payload;
    renderRoster();

    // Broadcast
    lanBroadcast({ type: 'PRESENCE', payload: payload });
}

function renderRoster() {
    const list = document.getElementById('roster-list');
    const container = document.getElementById('room-roster');

    // Only show if we have connections or are connecting
    if (!lanConnected && Object.keys(peerRoster).length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    list.innerHTML = '';

    Object.values(peerRoster).forEach(member => {
        // 1. Human Row
        const humanRow = document.createElement('div');
        humanRow.style.display = 'flex';
        humanRow.style.alignItems = 'center';

        const nameSpan = document.createElement('span');
        nameSpan.style.fontWeight = 'bold';
        nameSpan.innerText = '👤 ' + member.name + (member.isHost ? ' (Host)' : '');
        if (member.id === peer.id) nameSpan.innerText += ' (You)';

        humanRow.appendChild(nameSpan);
        list.appendChild(humanRow);

        // 2. AI Rows (Indented)
        if (member.agents && member.agents.length > 0) {
            member.agents.forEach(agentName => {
                const aiRow = document.createElement('div');
                aiRow.style.display = 'flex';
                aiRow.style.alignItems = 'center';
                aiRow.style.marginLeft = '15px'; // Indent
                aiRow.style.fontSize = '11px';
                aiRow.style.color = '#aaa';

                aiRow.innerText = `🤖 ${agentName} (${member.name})`;
                list.appendChild(aiRow);
            });
        }
    });
}
