// Autoscroll sync relay: one Durable Object per room passes each state a device sends
// to every other device in the room, and hands the last one to late joiners. It knows
// nothing about songs. Why it exists: docs/adr/0001-hosted-relay-on-cloudflare.md.
// Protocol: docs/autoscroll-plan.md "Sync".
import { DurableObject } from "cloudflare:workers";

const now = () => Date.now() / 1000;
const STALE_S = 12 * 3600;   // last week's state must not open on Sunday morning
const MAX_BYTES = 4096;

export default {
    fetch(request, env) {
        const room = new URL(request.url).searchParams.get("room");
        if (request.headers.get("Upgrade") !== "websocket" || !room) {
            return new Response("karaoke relay: open a WebSocket to /?room=<word>\n", { status: 426 });
        }
        return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    },
};

export class Room extends DurableObject {
    async fetch() {
        const [client, server] = Object.values(new WebSocketPair());
        // Hibernation API: the object can be evicted between messages, so the last
        // state lives in storage rather than a field.
        this.ctx.acceptWebSocket(server);
        const last = await this.ctx.storage.get("last");
        if (last && now() - last.at < STALE_S) server.send(JSON.stringify({ type: "state", relay: now(), state: last.state }));
        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws, data) {
        if (typeof data !== "string" || data.length > MAX_BYTES) return;
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", t: msg.t, relay: now() }));
        } else if (msg.type === "state" && msg.state && typeof msg.state === "object") {
            await this.ctx.storage.put("last", { at: now(), state: msg.state });
            const out = JSON.stringify({ type: "state", relay: now(), state: msg.state });
            for (const other of this.ctx.getWebSockets()) {
                if (other !== ws) try { other.send(out); } catch { /* closing; it reconnects */ }
            }
        }
    }

    webSocketClose(ws, code) {
        try { ws.close(code); } catch { /* already closed */ }
    }
}
