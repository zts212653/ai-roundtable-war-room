import { state, saveState } from './state.js';

export function updateLanStatus(msg) {
    const el = document.getElementById('lan-status-msg');
    if (el) el.innerText = msg;
}

export function formatTextWithMentions(text) {
    if (!text) return '';
    // Escape HTML first
    let safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Highlight @Name (word boundary)
    return safe.replace(/(@[\w\u4e00-\u9fa5]+)/g, '<span class="mention-tag">$1</span>');
}

export function renderHistory(onDelete) {
    const container = document.getElementById('chat-stream');
    container.innerHTML = ''; // Clear current view

    if (state.chatHistory.length === 0) {
        container.innerHTML = `
        <div id="empty-state" class="message-block" style="text-align:center; color:#555; font-style:italic;">
            War Room initialized.<br>Waiting for orders.
        </div>`;
        return;
    }

    state.chatHistory.forEach((msg, index) => {
        const div = createMessageElement(msg, index, onDelete);
        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

function createMessageElement(msg, index, onDelete) {
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
    btnDel.onclick = () => onDelete(index);

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
        if (state.chatHistory[index] && state.chatHistory[index].text !== contentDiv.innerText) {
            state.chatHistory[index].text = contentDiv.innerText;
            saveState();
            // Re-render to highlight again
            contentDiv.innerHTML = formatTextWithMentions(contentDiv.innerText);
        }
    });

    div.appendChild(labelRow);
    div.appendChild(contentDiv);

    return div;
}

export function renderRoster(myPeerId) {
    const list = document.getElementById('roster-list');
    const container = document.getElementById('room-roster');

    if (!list || !container) return;

    if (!state.lanConnected && Object.keys(state.peerRoster).length === 0) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');
    list.innerHTML = '';

    Object.values(state.peerRoster).forEach(member => {
        // Create Member Card
        const memberDiv = document.createElement('div');
        memberDiv.className = 'roster-member' + (member.id === myPeerId ? ' is-me' : '');

        // Header Line
        const header = document.createElement('div');
        header.className = 'member-header';

        const roleIcon = member.isHost ? '👑' : '👤';
        header.innerHTML = `${roleIcon} ${member.name} ${member.id === myPeerId ? '<span style="opacity:0.6;font-weight:normal">(You)</span>' : ''}`;
        memberDiv.appendChild(header);

        // Agents Line
        if (member.agents && member.agents.length > 0) {
            const agentsDiv = document.createElement('div');
            agentsDiv.className = 'member-agents';

            member.agents.forEach(agentName => {
                // Determine style key
                let styleKey = 'gpt';
                if (agentName.toLowerCase().includes('gemini')) styleKey = 'gemini';
                else if (agentName.toLowerCase().includes('claude')) styleKey = 'claude';
                else if (agentName.toLowerCase().includes('studio')) styleKey = 'aistudio';

                const badge = document.createElement('span');
                badge.className = `agent-badge ${styleKey}`;
                badge.innerText = agentName;
                agentsDiv.appendChild(badge);
            });
            memberDiv.appendChild(agentsDiv);
        } else {
            // No agents active
            const emptyDiv = document.createElement('div');
            emptyDiv.style.fontSize = '10px';
            emptyDiv.style.color = '#666';
            emptyDiv.style.marginLeft = '4px';
            emptyDiv.innerText = '(No active agents)';
            memberDiv.appendChild(emptyDiv);
        }

        list.appendChild(memberDiv);
    });
}
