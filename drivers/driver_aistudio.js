
// Driver for Google AI Studio (aistudio.google.com)

console.log('[Roundtable] AI Studio Driver Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'DISTRIBUTE_PROMPT') {
        runDistribute(request.prompt, sendResponse);
        return true;
    }
    else if (request.action === 'HARVEST_LATEST') {
        harvestLatestResponse(sendResponse);
        return true;
    }
});

async function runDistribute(promptText, sendResponse) {
    console.log('[Roundtable] AI Studio: Distributing prompt...');

    // 1. Find Input
    // AI Studio uses a textarea usually
    const inputBox = findInputBox();
    if (!inputBox) {
        console.error('AI Studio: Input box not found');
        sendResponse({ success: false, error: 'Input not found' });
        return;
    }

    inputBox.focus();

    // 2. Set Value
    // React/Angular often requires dispatching input events
    const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    if (nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(inputBox, promptText);
    } else {
        inputBox.value = promptText;
    }

    inputBox.dispatchEvent(new Event('input', { bubbles: true }));
    inputBox.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 500)); // Wait for valid state

    // 3. Click Run/Send
    const sendBtn = findSendButton();
    if (sendBtn) {
        // AI Studio "Run" button might need robust clicking
        sendBtn.click();
        sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        // Simulating Enter key is also a good fallback in AI Studio
        const enterEvent = new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, keyCode: 13, key: 'Enter', code: 'Enter'
        });
        inputBox.dispatchEvent(enterEvent);

        sendResponse({ success: true });
    } else {
        // Fallback: Just try Enter on the textarea
        console.warn('AI Studio: Send button not found, trying Enter key...');
        const enterEvent = new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, keyCode: 13, key: 'Enter', code: 'Enter', ctrlKey: true // Often Ctrl+Enter in AI Studio
        });
        inputBox.dispatchEvent(enterEvent);

        sendResponse({ success: true, warning: 'Used Enter key fallback' });
    }
}

function findInputBox() {
    // Look for the main textarea
    return document.querySelector('textarea[aria-label="Type your prompt here"]') ||
        document.querySelector('textarea.mat-mdc-input-element') ||
        document.querySelector('textarea');
}

function findSendButton() {
    // Look for "Run" button
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase();
        const text = b.innerText.toLowerCase();
        return label.includes('run') || text.includes('run') || label.includes('send');
    });
}

function harvestLatestResponse(sendResponse) {
    // Look for chat turns
    const turns = document.querySelectorAll('ms-chat-turn');
    if (turns.length > 0) {
        // We want the last one that is a MODEL turn
        // Iterate backwards
        for (let i = turns.length - 1; i >= 0; i--) {
            const turn = turns[i];
            // Check if it's model
            if (turn.querySelector('.render-model') || turn.innerHTML.includes('model-turn')) {
                const textEl = turn.querySelector('.model-text') || turn;
                sendResponse({ success: true, text: textEl.innerText });
                return;
            }
        }
        sendResponse({ success: false, error: 'No model response found' });
    } else {
        sendResponse({ success: false, error: 'No turns' });
    }
}
