export function logSystem(msg) {
    console.log(`[Roundtable] ${msg}`);

    // Some messages are critical enough to show in the chat stream UI
    // We access the DOM directly here to avoid circular dependencies with UI module for now,
    // or we can expect UI to bind a listener. For simplicity, direct DOM is fine for a logger.
    if (msg.includes('Error') || msg.includes('LAN') || msg.includes('Failed') || msg.includes('Online') || msg.includes('Signaling') || msg.includes('state')) {
        const container = document.getElementById('chat-stream');
        if (!container) return; // UI might not be ready

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
