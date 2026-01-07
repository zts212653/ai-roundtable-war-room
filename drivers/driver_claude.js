/**
 * Driver for Claude (claude.ai)
 * Adapted from User-Provided "Claude.ai Chrome Plugin Guide"
 */

console.log('Zhufeng Roundtable: Claude Driver Loaded');

const CLAUDE_SELECTORS = {
    inputBox: 'textarea[placeholder="Reply..."]',
    sendButton: 'button[aria-label="Send message"]',
    // Fallback send button strategy: Look for SVG icons in button
    sendButtonFallbackIcon: 'svg',
    messages: '[data-test-render-count], .font-claude-message, [data-is-streaming="false"]'
    // Note: Claude's DOM changes often. We will use a robust harvesting strategy below.
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        sendResponse({ status: 'OK', agent: 'Claude' });
    }
    else if (request.action === 'DISTRIBUTE_PROMPT') {
        runDistribute(request.prompt, sendResponse);
        return true; // async
    }
    else if (request.action === 'HARVEST_LATEST') {
        const text = harvestLatestResponse();
        sendResponse({ success: true, text: text });
    }
});

async function runDistribute(text, sendResponse) {
    try {
        console.log('Claude Driver: Distributing:', text);

        // 1. Find Input
        // Try precise selector first, then contenteditable fallback
        const input = document.querySelector(CLAUDE_SELECTORS.inputBox) ||
            document.querySelector('[contenteditable="true"]');

        if (!input) throw new Error('Input box not found');

        input.focus();

        // 2. Insert Text
        // Claude usually respects value property on the textarea, but dispatch input is key.
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Small delay for UI validation
        await new Promise(r => setTimeout(r, 500));

        // 3. Find Send Button
        let btn = document.querySelector(CLAUDE_SELECTORS.sendButton);

        if (!btn) {
            // Fallback: look for button with "Send" in aria-label or title within the input container
            const container = input.closest('fieldset') || input.closest('div.flex');
            if (container) {
                const buttons = container.querySelectorAll('button');
                // Usually the last button, or one with specific icon
                btn = buttons[buttons.length - 1];
            }
        }

        if (btn && !btn.disabled) {
            btn.click();
            sendResponse({ success: true });
        } else {
            // Try Enter key
            console.warn('Claude Driver: Send button not found/disabled. Trying Enter.');
            const enterEvt = new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                bubbles: true, cancelable: true
            });
            input.dispatchEvent(enterEvt);
            sendResponse({ success: true, warning: 'Sent via Enter fallback' });
        }

    } catch (e) {
        console.error('Claude Distribute Error:', e);
        sendResponse({ success: false, error: e.message });
    }
}

function harvestLatestResponse() {
    try {
        // Strategy: Find all message groups/items and get the last one that is from the Assistant.
        // Claude's DOM is tricky. 
        // We look for elements that look like message bubbles.
        // Usually: <div class="font-claude-message ...">

        const possibleMessages = document.querySelectorAll('.font-claude-message, [data-test-render-count]');

        if (possibleMessages.length === 0) {
            // Fallback: search for generic text blocks in the main area
            return fallbackHarvest();
        }

        // Iterate backwards
        for (let i = possibleMessages.length - 1; i >= 0; i--) {
            const msg = possibleMessages[i];

            // Filter out User messages
            // User messages usually have a different font class or container
            // Claude messages often have .font-claude-message

            // Check if it's the User
            const isUser = msg.closest('[data-testid="user-message"]');
            // OR check content heuristics
            if (isUser) continue;

            // If we found a candidate, return its text
            return cleanText(msg.innerText);
        }

        return "[No Claude response found]";

    } catch (e) {
        return `[Harvest Error: ${e.message}]`;
    }
}

function fallbackHarvest() {
    // Basic fallback: Grab the last meaningful text block
    const articles = document.querySelectorAll('div.grid-cols-1 > div');
    if (articles.length > 0) {
        const last = articles[articles.length - 1];
        return cleanText(last.innerText);
    }
    return "[No response found - selectors failed]";
}

function cleanText(text) {
    if (!text) return "";
    return text
        .replace(/^Thinking\.\.\./i, '')
        .replace(/Copy\nEdit/g, '') // Common UI artifacts
        .trim();
}
