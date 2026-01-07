
// Driver for Claude (claude.ai)

console.log('[Roundtable] Claude Driver Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'DISTRIBUTE_PROMPT') {
        runDistribute(request.prompt, sendResponse);
        return true; // Keep channel open for async
    }
    else if (request.action === 'HARVEST_LATEST') {
        harvestLatestResponse(sendResponse);
        return true;
    }
});

async function runDistribute(promptText, sendResponse) {
    console.log('[Roundtable] Claude: Distributing prompt...');

    // 1. Find Input
    const inputBox = findInputBox();
    if (!inputBox) {
        console.error('Claude: Input box not found');
        sendResponse({ success: false, error: 'Input not found' });
        return;
    }

    // 2. Clear & Fill
    inputBox.focus();
    // Claude often uses ProseMirror, standard execCommand works best
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null); // Clear existing if any

    // Use insertText to simulate typing
    document.execCommand('insertText', false, promptText);

    // Dispatch events just in case
    inputBox.dispatchEvent(new Event('input', { bubbles: true }));

    await new Promise(r => setTimeout(r, 500)); // Wait for UI update

    // 3. Click Send
    const sendBtn = findSendButton();
    if (sendBtn) {
        sendBtn.click();

        // Force a UI update manually if click fails
        setTimeout(() => {
            // Second attempt with MouseEvents
            const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
            const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
            sendBtn.dispatchEvent(mousedown);
            sendBtn.dispatchEvent(mouseup);
        }, 200);

        sendResponse({ success: true });
    } else {
        console.error('Claude: Send button not found');
        sendResponse({ success: false, error: 'Send button missing' });
    }
}

function findInputBox() {
    // Claude typically uses a contenteditable div with ProseMirror class
    return document.querySelector('div[contenteditable="true"].ProseMirror') ||
        document.querySelector('div[contenteditable="true"]');
}

function findSendButton() {
    // Look for button with aria-label or SVG icon
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => {
        const label = b.getAttribute('aria-label') || '';
        return label.toLowerCase().includes('send message') ||
            // Often checked by SVG path or class if label missing
            (b.innerHTML.includes('svg') && !b.disabled);
    });
}

function harvestLatestResponse(sendResponse) {
    // Claude chat messages are structured in specific containers. 
    // Usually .font-claude-message or similar.
    // We look for the last assistant message.

    // As of late 2024/early 2025, Claude structure varies.
    // Strategy: Find all message containers, filter for "Assistant" or "Claude", take last.

    // This is a generic heuristic scan
    const potentialContainers = document.querySelectorAll('.font-claude-message, .grid-cols-1 .text-base');

    if (potentialContainers.length > 0) {
        const lastMsg = potentialContainers[potentialContainers.length - 1];
        const text = lastMsg.innerText;
        sendResponse({ success: true, text: text });
    } else {
        // Fallback: search for last generic message text block
        sendResponse({ success: false, error: 'No response found' });
    }
}
