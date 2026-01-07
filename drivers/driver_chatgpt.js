
/**
 * Driver for ChatGPT (chatgpt.com)
 * Implements the AI Roundtable Protocol.
 */

console.log('Zhufeng Roundtable: ChatGPT Driver Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        sendResponse({ status: 'OK', agent: 'ChatGPT' });
    }
    else if (request.action === 'DISTRIBUTE_PROMPT') {
        runDistribute(request.prompt, sendResponse);
        return true;
    }
    else if (request.action === 'HARVEST_LATEST') {
        const text = harvestLatestResponse();
        sendResponse({ success: true, text: text });
    }
});


// --- Core Actions ---

async function runDistribute(text, sendResponse) {
    try {
        console.log('GPT Driver: Distributing:', text);
        const input = findInputBox();
        if (!input) throw new Error('Input box not found');

        // 1. Focus
        input.focus();

        // 2. Insert Content
        // Clear first
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);

        // Insert (Simulates typing best)
        document.execCommand('insertText', false, text);

        // Dispatch Input Event (Vital for React)
        input.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise(r => setTimeout(r, 600));

        // Start checking for Send Button
        let btn = findSendButton();

        // 3. Fallback: Wake up the UI if button is disabled
        if (!btn || btn.disabled) {
            console.warn('GPT Driver: Button disabled, simulating space key...');
            // Type a space to trigger state change
            input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
            document.execCommand('insertText', false, ' ');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 200));
            // Remove space logic could go here but let's just send
        }

        btn = findSendButton();

        if (btn && !btn.disabled) {
            console.log('GPT Driver: Clicking send...');
            btn.click();
            sendResponse({ success: true });
        } else {
            console.warn('GPT Driver: Send button locked. Trying Enter key fallback.');
            // Enter key usually sends form
            const enterEvt = new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13,
                bubbles: true, cancelable: true, view: window
            });
            input.dispatchEvent(enterEvt);
            sendResponse({ success: true, warning: 'Sent via Enter key' });
        }

    } catch (e) {
        console.error('ChatGPT Distribute Error:', e);
        sendResponse({ success: false, error: e.message });
    }
}

function harvestLatestResponse() {
    try {
        // Strategy 1: Look for explicit assistant turns via data attribute
        const assistantTurns = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (assistantTurns.length > 0) {
            const lastTurn = assistantTurns[assistantTurns.length - 1];
            return cleanText(lastTurn.innerText);
        }

        // Strategy 2: Look for .markdown blocks (common in ChatGPT)
        const markdownBlocks = document.querySelectorAll('.markdown');
        if (markdownBlocks.length > 0) {
            // We need to be careful not to pick up the user's edit box if it has markdown
            // But usually user input is not class="markdown".
            const lastMarkdown = markdownBlocks[markdownBlocks.length - 1];
            return cleanText(lastMarkdown.innerText);
        }

        // Strategy 3: Fallback to all 'article' tags
        const allTurns = document.querySelectorAll('article');
        if (allTurns.length > 0) {
            for (let i = allTurns.length - 1; i >= 0; i--) {
                const turn = allTurns[i];
                // Try to disambiguate from user
                // User messages usually have [data-testid="user-message"]
                if (!turn.querySelector('[data-testid="user-message"]')) {
                    return cleanText(turn.innerText);
                }
            }
        }

        return "[No response found - selectors failed]";
    } catch (e) {
        console.error('Harvest Error:', e);
        return `[Harvest Error: ${e.message}]`;
    }
}

function cleanText(text) {
    if (!text) return "";
    // Remove "Thinking..." metadata if it appears as a prefix
    // Remove "ChatGPT said:"
    // Remove "4o" or model names sometimes appearing
    return text
        .replace(/^Thinking\.\.\.\n?/i, '') // Remove Thinking block header
        .replace(/^ChatGPT said:\n?/i, '')
        .replace(/^\d+s\n/i, '') // Remove timing (e.g. "45s")
        .trim();
}


// --- Selectors ---

function findInputBox() {
    return document.querySelector('#prompt-textarea') ||
        document.querySelector('[contenteditable="true"]');
}

function findSendButton() {
    return document.querySelector('button[data-testid="send-button"]');
}
