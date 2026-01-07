
/**
 * Driver for Gemini (gemini.google.com)
 * Implements the AI Roundtable Protocol.
 */

console.log('Zhufeng Roundtable: Gemini Driver Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        sendResponse({ status: 'OK', agent: 'Gemini' });
    }
    else if (request.action === 'DISTRIBUTE_PROMPT') {
        runDistribute(request.prompt, sendResponse);
        return true; // Async response
    }
    else if (request.action === 'HARVEST_LATEST') {
        const text = harvestLatestResponse();
        sendResponse({ success: true, text: text });
    }
});


// --- Core Actions ---

async function runDistribute(text, sendResponse) {
    try {
        console.log('Gemini Driver: Distributing prompt...');
        const input = findInputBox();
        if (!input) throw new Error('Input box not found');

        // 1. Focus
        input.focus();

        // 2. Insert Text
        // Gemini uses a contenteditable div. 
        // Best approach: select all -> delete -> insertText execCommand
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        document.execCommand('insertText', false, text);

        // Fallback checks
        if (input.innerText.trim() !== text.trim()) {
            input.innerText = text; // Force if execCommand fails
        }

        // Dispatch events to trigger UI state updates (enable button)
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));

        await new Promise(r => setTimeout(r, 600)); // Wait for Send button

        // 3. Click Send
        const btn = findSendButton();
        if (!btn) throw new Error('Send button not found');

        // Click + Mouse Events (for background tab reliability)
        btn.click();
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        sendResponse({ success: true });

    } catch (e) {
        console.error('Gemini Distribute Error:', e);
        sendResponse({ success: false, error: e.message });
    }
}

function harvestLatestResponse() {
    // Strategy: Find all model turns, pick the last one.
    const responses = Array.from(document.querySelectorAll('.model-response-text')); // Classic Class

    if (responses.length > 0) {
        return responses[responses.length - 1].innerText;
    }

    // Fallback: look for data attributes or generic structure
    const dataTestIds = Array.from(document.querySelectorAll('[data-test-id="model-response-text"]'));
    if (dataTestIds.length > 0) {
        return dataTestIds[dataTestIds.length - 1].innerText;
    }

    // Fallback 3: Finding all message containers (user & model) and taking the last if it's not user
    // This is harder without a stable "user" class, but usually user messages have right-align or specific bg
    // For now, let's return a specific "waiting" message if not found
    return "[No response found or generating...]";
}


// --- Selectors ---

function findInputBox() {
    // Rich Text Editor
    return document.querySelector('div.ql-editor') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]') ||
        document.querySelector('div[contenteditable="true"]');
}

function findSendButton() {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const matTooltip = (b.getAttribute('mattooltip') || '').toLowerCase();

        // Check labels
        if (label === 'send message' || label === '发送' || label.includes('send')) return true;
        if (matTooltip === 'send message' || matTooltip === '发送') return true;

        // Check Icon (Send icon usually has a specific path or class)
        if (b.querySelector('svg')) {
            // Often the send button is the ONLY button active in the input/footer area
            // But we can't rely on that.
            // Let's check for "submit" type or simply being in the footer
            if (b.closest('.input-area') || b.closest('.chat-input-container')) {
                return !b.disabled;
            }
        }
        return false;
    });
}
