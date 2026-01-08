import { state, saveState } from './state.js';
import { renderHistory } from './ui.js';
import { lanBroadcast } from './p2p.js';
import { logSystem } from './logger.js';

export function addMessage(sender, text, type, fromNetwork = false) {
    // Clean up text
    text = text.trim();
    if (!text) return;

    // Filter out common pollution
    text = text.replace(/^(Thinking\.\.\.|ChatGPT\s*said:|Here is the response|Answer:)/i, '').trim();

    const msg = { sender, text, type, timestamp: Date.now() };
    state.chatHistory.push(msg);
    saveState();

    // Re-render whole history? Or optimistic append?
    // UI module handles full render or append. 
    // To keep it simple refactoring, we call renderHistory. 
    // Optimization: renderHistory could take just the new msg, but current implementation clears innerHTML.
    // For now, re-render is safe.
    renderHistory((idx) => deleteMessage(idx));

    // Network Sync
    // console.log(`[DEBUG] addMessage called. fromNetwork=${fromNetwork}, lanConnected=${state.lanConnected}`);
    if (!fromNetwork && state.lanConnected) {
        // console.log('[DEBUG] Broadcasting NEW_MESSAGE to LAN...');
        lanBroadcast({ type: 'NEW_MESSAGE', payload: msg });
    }
}

export function deleteMessage(index, fromNetwork = false) {
    if (!fromNetwork && !confirm('Delete this message?')) return;

    if (state.chatHistory[index]) {
        state.chatHistory.splice(index, 1);
        saveState();
        renderHistory((idx) => deleteMessage(idx));

        if (!fromNetwork && state.lanConnected) {
            lanBroadcast({ type: 'DELETE_MESSAGE', index: index });
        }
    }
}

export function clearSession(fromNetwork = false) {
    if (!fromNetwork && !confirm('Clear entire session history?')) return;

    state.chatHistory = [];
    saveState();
    renderHistory((idx) => deleteMessage(idx));

    if (!fromNetwork && state.lanConnected) {
        lanBroadcast({ type: 'CLEAR_SESSION' });
    }
}
