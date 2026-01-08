import { state, saveState, setPeer, setLanConnected, setIsHost, setHostConn } from './state.js';
import { logSystem } from './logger.js';
import { updateLanStatus, renderRoster, renderHistory } from './ui.js';
import { addMessage, deleteMessage, clearSession } from './chat.js';
import { distributeToAgents } from './agent-manager.js';

// Access global Peer
const Peer = window.Peer;

export function startLanSession(hostMode, guestRoomId = null) {
    console.log('startLanSession called', { hostMode, guestRoomId });
    setIsHost(hostMode);

    if (state.peer) {
        state.peer.off('disconnected');
        state.peer.destroy();
        setPeer(null);
    }

    // P2P Config
    const customHost = document.getElementById('p2p-host') ? document.getElementById('p2p-host').value.trim() : '';
    const customPort = document.getElementById('p2p-port') ? document.getElementById('p2p-port').value.trim() : '';
    const customPath = document.getElementById('p2p-path') ? document.getElementById('p2p-path').value.trim() : '';

    let peerConfig = {};

    if (customHost) {
        // User provided custom server
        peerConfig = {
            host: customHost,
            port: customPort ? parseInt(customPort) : (customHost === 'localhost' ? 9000 : 443),
            path: customPath || '/',
            secure: (customPort === '443' || customHost !== 'localhost'),
            debug: 1,
            pingInterval: 5000
        };
        logSystem(`Using Custom P2P Server: ${peerConfig.host}:${peerConfig.port}`);
    } else {
        // Default: Public + Robust STUN/TURN
        peerConfig = {
            debug: 2,
            pingInterval: 5000,
            config: {
                iceServers: [
                    // TURN (Relay)
                    {
                        urls: 'turn:openrelay.metered.ca:80',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    {
                        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                        username: 'openrelayproject',
                        credential: 'openrelayproject'
                    },
                    // STUN
                    { urls: 'stun:stun.qq.com:3478' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10,
                iceTransportPolicy: 'all'
            }
        };
    }

    const peer = new Peer(null, peerConfig);
    setPeer(peer);

    peer.on('open', (id) => {
        logSystem(`✅ [Signaling] Connected to Server. ID: ${id}`);
        console.log('My Peer ID is: ' + id);

        if (state.isHost) {
            const el = document.getElementById('host-room-id');
            if (el) el.innerText = id;
            updateLanStatus(`🟢 Room Created.`);
            logSystem(`Room Ready. Waiting for guests...`);
            setLanConnected(true);
            broadcastPresence();
        } else {
            if (!guestRoomId) return alert('No Room ID provided');
            connectToHost(guestRoomId);
        }
    });

    peer.on('connection', (conn) => {
        logSystem(`[Signaling] Incoming connection handshake...`);
        if (state.isHost) {
            setupConnection(conn);
        }
    });

    peer.on('error', (err) => {
        console.error(err);
        updateLanStatus(`⚠️ Error: ${err.type}`);

        if (err.type === 'peer-unavailable') {
            logSystem(`❌ [Signaling] Room ID not found on server.`);
            logSystem(`Diagnostic: Host may have disconnected, or you are on different signaling swarms.`);
        } else if (err.type === 'network') {
            logSystem(`❌ [Network] Lost connection to Signaling Server.`);
        } else if (err.type === 'browser-incompatible') {
            logSystem(`❌ [Fatal] Browser does not support WebRTC.`);
        } else {
            logSystem(`❌ [Error] ${err.type}: ${err.message}`);
        }
    });

    peer.on('disconnected', () => {
        updateLanStatus('🔴 Disconnected from signaling.');
        logSystem(`[Signaling] Connection Lost. Reconnecting...`);
        peer.reconnect();
    });
}

function connectToHost(hostId) {
    updateLanStatus(`Connecting to ${hostId}...`);
    logSystem(`[Signaling] Looking up Host ID: ${hostId}...`);

    if (!state.peer) return;

    const conn = state.peer.connect(hostId, {
        reliable: true,
        serialization: 'json'
    });

    conn.on('open', () => {
        setLanConnected(true);
        setHostConn(conn);
        updateLanStatus(`🟢 Connected to Room`);
        logSystem(`✅ [P2PTransport] Connection ESTABLISHED!`);
        setupConnection(conn);
        setTimeout(broadcastPresence, 1000);
    });

    setTimeout(() => {
        if (conn && conn.peerConnection) {
            logSystem(`[ICE] Starting Candidate Search (STUN)...`);

            conn.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    logSystem(`[ICE] Found Candidate: ${event.candidate.candidate.split(' ')[4]}`);
                } else {
                    logSystem(`[ICE] Candidate gathering complete.`);
                }
            };

            conn.peerConnection.oniceconnectionstatechange = () => {
                const s = conn.peerConnection.iceConnectionState;
                logSystem(`[P2P State] Changed to: ${s}`);

                if (s === 'connected' || s === 'completed') {
                    updateLanStatus(`🟢 Encryption Handshake OK`);
                }
                if (s === 'failed' || s === 'disconnected') {
                    updateLanStatus(`🔴 Connection Failed (${s})`);
                    logSystem(`[Failure] UDP blocked or NAT Symmetric. Try closing VPN.`);
                }
            };
        }
    }, 500);

    conn.on('error', (err) => {
        console.error('Conn Error', err);
        updateLanStatus(`🔴 Error: ${err}`);
        logSystem(`[Conn Error] ${err}`);
    });
}

function setupConnection(conn) {
    if (state.isHost) {
        state.connections.push(conn);
    }

    conn.on('data', (data) => {
        handleLanMessage(data, conn);
    });

    conn.on('close', () => {
        logSystem('Peer disconnected');
        if (state.isHost) {
            // remove from connections
            const idx = state.connections.indexOf(conn);
            if (idx > -1) state.connections.splice(idx, 1);
        } else {
            setLanConnected(false);
            setHostConn(null);
            updateLanStatus('🔴 Host Left');
        }
    });

    // Initial Sync (Host sends to new Guest)
    // Delay slightly to ensure connection is stable
    if (state.isHost) {
        setTimeout(() => {
            if (conn.open) {
                // 1. Sync History
                conn.send({ type: 'SYNC_HISTORY', history: state.chatHistory });

                // 2. Sync Self Presence
                // We broadcast to ALL, assuming robust mesh or star
                broadcastPresence();

                // 3. Sync Known Roster to New Guest
                Object.values(state.peerRoster).forEach(member => {
                    conn.send({ type: 'PRESENCE', payload: member });
                });
            }
        }, 1000);
    }
}

export function lanBroadcast(data) {
    if (state.isHost) {
        state.connections.forEach(conn => {
            if (conn.open) conn.send(data);
        });
    } else if (state.hostConn && state.hostConn.open) {
        state.hostConn.send(data);
    }
}

export function broadcastPresence() {
    if (!state.lanConnected || !state.peer) return;

    const username = document.getElementById('my-username').value.trim() || 'Anonymous';
    const agents = [];
    if (state.activeTabs.gemini) agents.push('Gemini');
    if (state.activeTabs.claude) agents.push('Claude');
    if (state.activeTabs.gpt) agents.push('ChatGPT');
    if (state.activeTabs.aistudio) agents.push('AI Studio');

    const payload = {
        id: state.peer.id,
        name: username,
        agents: agents,
        isHost: state.isHost
    };

    state.peerRoster[state.peer.id] = payload;
    renderRoster(state.peer.id);
    lanBroadcast({ type: 'PRESENCE', payload: payload });
}

function handleLanMessage(data, senderConn) {
    console.log('[P2P RX]', data);

    switch (data.type) {
        case 'SYNC_HISTORY':
            if (data.history && Array.isArray(data.history)) {
                state.chatHistory = data.history;
                renderHistory((idx) => deleteMessage(idx)); // passing the delete logic
                saveState();
                logSystem(`Synced ${state.chatHistory.length} messages.`);
            }
            break;

        case 'NEW_MESSAGE':
            if (data.payload) {
                // imported addMessage
                addMessage(data.payload.sender, data.payload.text, data.payload.type, true);

                // Mesh Trigger
                if (data.payload.type === 'user') {
                    logSystem(`Mesh Trigger: Running local agents for ${data.payload.sender}...`);
                    distributeToAgents(data.payload.text);
                }

                // Relay if Host
                if (state.isHost) {
                    state.connections.forEach(conn => {
                        if (conn !== senderConn && conn.open) {
                            conn.send(data);
                        }
                    });
                }
            }
            break;

        case 'DELETE_MESSAGE':
            if (typeof data.index === 'number') {
                deleteMessage(data.index, true);
                // Relay
                if (state.isHost) {
                    state.connections.forEach(conn => {
                        if (conn !== senderConn && conn.open) conn.send(data);
                    });
                }
            }
            break;

        case 'CLEAR_SESSION':
            clearSession(true);
            // Relay
            if (state.isHost) {
                state.connections.forEach(conn => {
                    if (conn !== senderConn && conn.open) conn.send(data);
                });
            }
            break;

        case 'PRESENCE':
            if (data.payload && data.payload.id) {
                state.peerRoster[data.payload.id] = data.payload;
                renderRoster(state.peer ? state.peer.id : null);
                // Relay
                if (state.isHost) {
                    state.connections.forEach(conn => {
                        if (conn !== senderConn && conn.open) conn.send(data);
                    });
                }
            }
            break;
    }
}
