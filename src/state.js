export const state = {
    activeTabs: {
        gemini: null,
        claude: null,
        gpt: null,
        aistudio: null
    },

    // P2P State
    peer: null,
    connections: [], // For Host: list of Guest connections
    hostConn: null,  // For Guest: connection to Host
    lanConnected: false,
    isHost: false,
    peerRoster: {}, // Map<peerId, {name, agents:[]}>

    // Persistence
    chatHistory: []
};

// Persistence Helpers
export async function loadState() {
    const result = await chrome.storage.local.get(['chatHistory', 'username']);
    if (result.chatHistory) {
        state.chatHistory = result.chatHistory;
    }
    return result; // return full result so caller can use username
}

export async function saveState() {
    await chrome.storage.local.set({ chatHistory: state.chatHistory });
}

export function setPeer(p) { state.peer = p; }
export function setLanConnected(val) { state.lanConnected = val; }
export function setIsHost(val) { state.isHost = val; }
export function setHostConn(conn) { state.hostConn = conn; }
