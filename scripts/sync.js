// Passes the leader's clock state between devices: a WebSocket to the relay (relay/)
// for other devices, a BroadcastChannel for other tabs on this machine. Publishing is
// fire-and-forget, so a device without the relay still works alone. Protocol and
// failure handling: docs/autoscroll-plan.md "Sync".
(() => {
    const RELAY = "wss://karaoke-relay.brendon-thiede.workers.dev";
    const PINGS = 5, PING_EVERY_MS = 60000, MAX_BACKOFF_S = 30;

    const store = (s, k, v) => { try { if (v === undefined) return s.getItem(k) || ""; s.setItem(k, v); } catch { return ""; } };
    const room = store(localStorage, "room");
    // A dev relay is `localStorage.relay = "ws://…"`; a page served from this machine uses wrangler dev's.
    const relay = store(localStorage, "relay") || (/^(localhost|127\.)/.test(location.hostname) ? "ws://localhost:8787" : RELAY);
    // Per tab, not per device: two tabs on one laptop are two displays.
    let id = store(sessionStorage, "device");
    if (!id) store(sessionStorage, "device", (id = Math.random().toString(16).slice(2, 8)));

    // Relay time minus local time, from the ping with the shortest round trip.
    let offset = 0, best = Infinity;
    const now = () => Date.now() / 1000 + offset;

    // `rev` is the publish time in relay time, so states from different devices order
    // correctly and the copy that arrives by the second path is ignored. A rev from the
    // future is refused: accepted, it would make every later real state look stale.
    const FUTURE_MS = 60000;
    let latest = null;
    const stateListeners = [], statusListeners = [];
    function receive(state) {
        if (!(state?.rev > (latest?.rev ?? 0) && state.rev < now() * 1000 + FUTURE_MS)) return;
        latest = state;
        for (const cb of stateListeners) cb(state);
    }

    const bc = "BroadcastChannel" in globalThis ? new BroadcastChannel("karaoke") : null;
    const post = (msg) => bc?.postMessage({ room, ...msg });
    if (bc) {
        bc.onmessage = ({ data }) => {
            if (data.room !== room) return;
            if (data.type === "state") receive(data.state);
            // A tab that just opened asks; only whoever published last answers.
            else if (data.type === "hello" && latest?.from === id) post({ type: "state", state: latest });
        };
        post({ type: "hello" });
    }

    let ws = null, connected = false, backoff = 1, warned = false;
    const setConnected = (on) => {
        if (connected === on) return;
        connected = on;
        for (const cb of statusListeners) cb(on);
    };
    const send = (msg) => { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); };
    const ping = () => send({ type: "ping", t: Date.now() / 1000 });

    function connect() {
        if (!relay || !room) return;
        ws = new WebSocket(`${relay}/?room=${encodeURIComponent(room)}`);
        let opened = false, timer;
        ws.onopen = () => {
            opened = true;
            backoff = 1;
            best = Infinity;
            for (let i = 0; i < PINGS; i++) setTimeout(ping, i * 200);
            timer = setInterval(ping, PING_EVERY_MS);
            if (latest?.from === id) send({ type: "state", state: latest });   // published while offline
        };
        ws.onmessage = ({ data }) => {
            const msg = JSON.parse(data);
            if (msg.type === "pong") {
                const back = Date.now() / 1000, rtt = back - msg.t;
                if (rtt <= best) {
                    best = rtt;
                    offset = msg.relay - (msg.t + back) / 2;
                }
                setConnected(true);
            } else if (msg.type === "state") receive(msg.state);
        };
        ws.onclose = () => {
            clearInterval(timer);
            setConnected(false);
            if (!opened && !warned) {
                console.log(`sync: no relay at ${relay}; this device works alone until it is back`);
                warned = true;
            }
            setTimeout(connect, backoff * 1000);
            backoff = Math.min(backoff * 2, MAX_BACKOFF_S);
        };
    }
    connect();

    globalThis.Sync = {
        id,
        room,
        now,
        get connected() { return connected; },
        get enabled() { return Boolean(relay && room); },
        publish(state) {
            latest = { ...state, from: id, rev: Math.round(now() * 1000) };
            post({ type: "state", state: latest });
            send({ type: "state", state: latest });
            return latest;
        },
        onState: (cb) => stateListeners.push(cb),
        onStatus: (cb) => statusListeners.push(cb),
    };
})();
