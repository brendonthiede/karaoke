// Page-turner view: the chart in one big column, moved a whole screen per press, for a
// pedal like the JSP-01 (it sends Page Up/Down or arrows, depending on its mode).
// Each press centers the next block (lines the .cho separates with a blank line).
// Past the last block, a press moves to the next song in the playlist.
// With `?role=lead` every turn is published through sync.js and `?role=stage` devices
// follow it. With a role, charts without {tempo} page; autoscroll.js has the rest.
(() => {
    const song = document.getElementById("song");
    if (!song) return;

    const STEP = 1.1, MIN_PX = 12, MAX_PX = 120;
    const PAD = 8;   // px left above a block too tall to center
    const sync = globalThis.Sync;
    const on = () => document.body.classList.contains("pages");
    const leading = () => sync?.role === "lead", following = () => sync?.role === "stage";
    const songName = () => new URLSearchParams(location.search).get("s");

    const controls = document.createElement("div");
    controls.id = "pages-controls";
    const button = (text, title, onClick) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = title;
        b.setAttribute("aria-label", title);
        b.addEventListener("click", onClick);
        return b;
    };

    /* ---------- lines ---------- */

    // Every rendered line box in viewport coordinates, from text nodes only: an element's
    // own box (a whole column) would span pages. `i` is the text node's index, the same
    // on every device whatever its width, so it is what a leader publishes.
    function lineRects() {
        const out = [], range = document.createRange();
        const walk = document.createTreeWalker(song, NodeFilter.SHOW_TEXT);
        let i = 0;
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            if (!n.data.trim()) continue;
            range.selectNodeContents(n);
            const section = !!n.parentElement.closest(".section");
            for (const r of range.getClientRects()) out.push({ top: r.top, bottom: r.bottom, right: r.right, section, i });
            i++;
        }
        return out;
    }

    /* ---------- size ---------- */

    // The longest line fills the width; +/- are steps from that, remembered per song.
    const key = () => {
        const s = songName();
        return `pages:${location.pathname}${s ? `?s=${s}` : location.search}`;
    };
    let steps = 0;
    const load = () => { try { steps = Number(localStorage.getItem(key())) || 0; } catch { steps = 0; } };
    load();

    function size() {
        // Collapsed repeats would hide a chorus behind its name; a pedal can't tap it open.
        for (const d of song.querySelectorAll("details")) d.open = true;
        song.style.fontSize = "20px";
        song.classList.add("pages-measuring");
        const left = song.getBoundingClientRect().left;
        const widest = Math.max(1, ...lineRects().map((r) => r.right - left));
        song.classList.remove("pages-measuring");
        const px = (20 * song.clientWidth * 0.97) / widest * STEP ** steps;
        song.style.fontSize = `${Math.min(MAX_PX, Math.max(MIN_PX, px))}px`;
    }
    function zoom(d) {
        steps += d;
        try { localStorage.setItem(key(), steps); } catch { /* not remembered */ }
        size();
        center();
    }

    /* ---------- leading and following ---------- */

    /* ---------- blocks ---------- */

    // A block is what the .cho file separates with a blank line: rendered lines that sit
    // closer than a blank line's gap. A section name joins the block under it. Found
    // from layout, so every renderer (and every screen width) gives the same blocks.
    function blocks() {
        const gap = 0.9 * parseFloat(getComputedStyle(song).fontSize);
        const out = [];
        for (const r of lineRects().sort((a, b) => a.top - b.top)) {
            const b = out.at(-1);
            if (b && (r.top - b.bottom < gap || b.heading)) {
                b.bottom = Math.max(b.bottom, r.bottom);
                b.first = Math.min(b.first, r.i);
                b.last = Math.max(b.last, r.i);
                b.heading &&= r.section;
            } else out.push({ top: r.top, bottom: r.bottom, first: r.i, last: r.i, heading: r.section });
        }
        return out;
    }

    // The current block is centered between the top of the screen and the controls;
    // one taller than that starts at the top instead.
    let cur = 0;
    const bottom = () => controls.getBoundingClientRect().top - 4;
    function center() {
        const all = blocks();
        cur = Math.max(0, Math.min(cur, all.length - 1));
        const b = all[cur];
        if (!b) return;
        const room = bottom();
        scrollBy(0, b.bottom - b.top > room - 2 * PAD ? b.top - PAD : (b.top + b.bottom - room) / 2);
    }

    /* ---------- leading and following ---------- */

    // A block is named by its first text node, the same index on every device.
    function publish() {
        if (!leading() || !on()) return;
        sync.publish({
            view: "pages", song: songName(), line: blocks()[cur]?.first ?? 0,
            playlist: (new URLSearchParams(location.search).get("p") || "").split(",").filter(Boolean),
        });
    }

    // The leader's block is centered here too. A follower's own pedal moves it on
    // locally until the leader's next turn.
    let wanted = null;
    function align() {
        if (wanted?.song !== songName()) return;
        const i = blocks().findIndex((b) => b.first <= wanted.line && wanted.line <= b.last);
        if (i >= 0) cur = i;
        center();
    }

    // Anyone with the room word can publish, so a state is checked before it moves the view.
    const valid = (st) => /^[\w-]+$/.test(st.song) && Number.isInteger(st.line) && st.line >= 0
        && Array.isArray(st.playlist ?? []);
    function follow(st) {
        if (st.from === sync.id) return;   // the relay handing back this tab's own state
        // Someone else's autoscroll: autoscroll.js shows it, still in full screen.
        if (st.view !== "pages") return void (on() && leave(false));
        if (!valid(st)) return;
        if (leading()) sync.setRole("stage");   // someone took the lead: last writer wins
        if (!following()) return;
        wanted = st;
        show();
        if (st.song !== songName()) {
            document.dispatchEvent(new CustomEvent("songopen", { detail: { s: st.song, p: st.playlist ?? [] } }));
        } else setTimeout(align);   // after autoscroll.js has left the stage view, if it was in it
    }
    sync?.onState(follow);

    const takeLead = button("Lead", "Take the lead", () => { sync.setRole("lead"); publish(); });
    const showRole = () => { takeLead.hidden = !following(); };
    document.addEventListener("rolechange", showRole);

    /* ---------- turning ---------- */

    const songGo = (d) => document.dispatchEvent(new CustomEvent("songgo", { detail: d }));
    // Past either end of the song, the playlist's next or previous one.
    function turn(d) {
        if (cur + d < 0 || cur + d >= blocks().length) return songGo(d);
        cur += d;
        center();
        publish();
    }
    const next = () => turn(1), prev = () => turn(-1);

    /* ---------- entering and leaving ---------- */

    function show() {
        if (on()) return;
        document.body.classList.add("pages");
        size();
    }
    async function enter() {
        show();
        cur = 0;
        center();
        publish();
        const root = document.documentElement;
        try {
            await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
        } catch { /* iPadOS: Add to Home Screen instead, see AGENTS.md */ }
    }
    // `fullscreen` false when the stage view takes over: it lives in full screen too.
    function leave(fullscreen = true) {
        document.body.classList.remove("pages");
        song.style.fontSize = "";
        document.dispatchEvent(new Event("songredraw"));   // collapse the repeats again
        scrollTo(0, 0);
        if (fullscreen && (document.fullscreenElement || document.webkitFullscreenElement)) {
            (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
        }
    }

    controls.append(
        button("▲", "Previous page (Page Up)", prev),
        button("▼", "Next page (Page Down)", next),
        takeLead,
        button("A−", "Smaller", () => zoom(-1)),
        button("A+", "Bigger", () => zoom(1)),
        button("✕", "Exit pages (Esc)", () => leave()),
    );
    showRole();
    document.body.append(controls);

    const menu = document.querySelector(".pure-menu-list");
    if (menu) {
        const item = document.createElement("li");
        item.className = "pure-menu-item";
        const link = document.createElement("a");
        link.href = "#";
        link.id = "pages-enter";
        link.className = "pure-menu-link";
        link.textContent = "Pages";
        link.addEventListener("click", (e) => { e.preventDefault(); enter(); });
        item.append(link);
        menu.prepend(item);
    }

    // iOS 18.4+ Safari drops key events from pedals that pair as keyboard + pointer
    // (the JSP-01) unless a text field has focus (WebKit bug 290779). This field holds
    // focus in Pages and Autoscroll; inputmode=none keeps the on-screen keyboard down.
    // iOS only focuses on a tap: entering the view is one, and any later tap refocuses.
    const pedal = document.createElement("input");
    pedal.id = "pedal";
    pedal.setAttribute("inputmode", "none");
    pedal.setAttribute("aria-hidden", "true");
    pedal.tabIndex = -1;
    pedal.autocomplete = "off";
    pedal.addEventListener("input", () => { pedal.value = ""; });
    document.body.append(pedal);
    document.addEventListener("click", () => {
        if (document.body.matches(".pages, .autoscroll")) pedal.focus({ preventScroll: true });
    });

    document.addEventListener("keydown", (e) => {
        if (!on() || (/^(SELECT|INPUT)$/.test(e.target.tagName) && e.target !== pedal)) return;
        const keys = {
            PageDown: next, ArrowDown: next, ArrowRight: next, " ": next,
            PageUp: prev, ArrowUp: prev, ArrowLeft: prev,
            "+": () => zoom(1), "=": () => zoom(1), "-": () => zoom(-1), Escape: () => leave(),
        };
        if (!keys[e.key]) return;
        e.preventDefault();
        keys[e.key]();
    });

    for (const event of ["fullscreenchange", "webkitfullscreenchange"]) {
        document.addEventListener(event, () => {
            if (!(document.fullscreenElement || document.webkitFullscreenElement) && on()) leave();
        });
    }

    // A new chart (playlist Next/Prev, or the leader's): its own size, from the top.
    // Deferred so autoscroll.js has first claimed or let go of the chart.
    document.addEventListener("songchange", (e) => setTimeout(() => {
        load();
        if (sync?.role && songName() && !e.detail?.timeline && !document.body.classList.contains("autoscroll")) show();
        if (!on()) return;
        size();
        cur = 0;
        if (following()) align();
        else {
            center();
            publish();
        }
    }));
    // A key change re-renders the chart.
    document.addEventListener("songrender", () => {
        if (!on()) return;
        size();
        center();
    });

    let pending;
    addEventListener("resize", () => {
        if (!on()) return;
        clearTimeout(pending);
        pending = setTimeout(() => { size(); center(); }, 150);
    });
})();
