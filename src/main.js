import { loadState, saveState, state } from './state.js';
import { scanForTabs, broadcastPrompt, harvestResponses, sendRollCall } from './agent-manager.js';
import { clearSession } from './chat.js';
import { startLanSession, broadcastPresence } from './p2p.js';
import { logSystem } from './logger.js';
import { renderHistory } from './ui.js';
import { deleteMessage } from './chat.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Buttons
    document.getElementById('btn-scan').addEventListener('click', scanForTabs);
    document.getElementById('btn-distribute').addEventListener('click', broadcastPrompt);
    document.getElementById('btn-collect').addEventListener('click', harvestResponses);

    document.getElementById('btn-clear').addEventListener('click', () => clearSession(false));
    document.getElementById('btn-rollcall').addEventListener('click', sendRollCall);

    // LAN Listeners
    document.getElementById('btn-lan-toggle').addEventListener('click', () => {
        document.getElementById('lan-panel').classList.toggle('hidden');
    });

    // P2P UI Handlers
    document.getElementById('btn-mode-host').addEventListener('click', () => {
        console.log('Host button clicked');
        try {
            document.getElementById('p2p-step-1').classList.add('hidden');
            document.getElementById('p2p-step-host').classList.remove('hidden');
            startLanSession(true);
        } catch (e) {
            console.error('Failed to start host session:', e);
            alert('Error starting session: ' + e.message);
        }
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
    // After loadState, render History to ensure UI is up to date
    renderHistory((idx) => deleteMessage(idx));

    // Username listener (bind here as it touches DOM directly)
    document.getElementById('my-username').addEventListener('change', (e) => {
        const newName = e.target.value.trim() || 'Anonymous';
        chrome.storage.local.set({ username: newName });
        if (state.lanConnected) broadcastPresence();
    });

    // 3. Initial Scan
    scanForTabs();
});
