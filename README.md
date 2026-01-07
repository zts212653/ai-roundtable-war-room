# AI Roundtable (The "War Room") 🛡️

**AI Roundtable** is a Chrome Extension that transforms your browser into a command center for orchestrating debates between multiple AI models. 

It connects to your **already open** tabs of ChatGPT, Claude, Gemini, and Google AI Studio, allowing you to:
1.  **Broadcast** a single prompt to all of them at once.
2.  **Context Injection**: Automatically feed the chat history from other agents into the current prompt (e.g., tell Gemini what ChatGPT just said).
3.  **Harvest** responses back into a single, unified "War Room" panel.
4.  **Edit & Curate**: Fix formatting or remove hallucinations from the history before the next round.

> **Note**: This extension acts as a "puppet master" for your browser tabs. It does **not** requires API keys. It requires you to be logged into the respective AI services in your browser.

## ✨ Features

*   **Multi-Agent Orchestration**: Support for **ChatGPT**, **Claude**, **Gemini (App)**, and **Google AI Studio**.
*   **Roundtable Context**: "Include History" toggle automatically injects the entire conversation log into your next prompt, enabling AIs to "hear" and respond to each other.
*   **Smart Context**: Automatically excludes an agent's *own* previous messages from the prompt sent to them (preventing redundancy).
*   **Session Persistence**: Your War Room state is saved locally. Close the browser and come back later.
*   **Privacy First**: All data lives in your `chrome.storage.local`. No external servers.

## 🚀 Installation

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Toggle **Developer mode** (top right).
4.  Click **Load unpacked**.
5.  Select the `ai_roundtable_extension` folder.

## 📖 Usage Guide

1.  **Prepare the Room**: Open tabs for the AIs you want to use (e.g., `chatgpt.com`, `claude.ai`) and ensure you are logged in.
2.  **Open the Panel**: Click the AI Roundtable extension icon to open the Chrome Side Panel.
3.  **Scan**: Click **🔄 Scan Tabs**. The status dots should turn green for found agents.
    *   *Tip: If a dot stays red, try refreshing that AI's tab and scanning again.*
4.  **Broadcast**: Type your prompt in the box (or use "📢 Roll Call") and click **📡 Distribute**.
5.  **Watch them work**: You'll see the agents typing in their respective tabs.
6.  **Collect**: Once they are done, click **📥 Collect** to pull their answers into the War Room.

## 🛠️ Permissions

*   `sidePanel`: To display the War Room UI.
*   `activeTab` / `scripting`: To communicate with the AI tabs.
*   `storage`: To save your session history.

## 🤝 Contributing

This is a proof-of-concept tool. Pull requests to improve specific "Drivers" (the scripts that talk to each AI website) are welcome!

---
*Built for the [Zhufeng Universe] community.*
