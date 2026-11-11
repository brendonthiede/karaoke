// Page-turner view: the chart in one big column, moved a whole screen per press, for a
// pedal like the JSP-01 (it sends Page Up/Down or arrows, depending on its mode).
// A page ends at the last line that fits whole; the line cut off at the bottom opens
// the next page. Past the last page, a press moves to the next song in the playlist.
// With `?role=lead` every turn is published through sync.js and `?role=stage` devices
// follow it. With a role, charts without {tempo} page; autoscroll.js has the rest.
(() => {
    const song = document.getElementById("song");
    if (!song) return;

    const STEP = 1.1, MIN_PX = 12, MAX_PX = 120;
    const PAD = 8;   // px left above a page's first line
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
        if (following()) align();
    }

    /* ---------- leading and following ---------- */

    function publish() {
        if (!leading() || !on()) return;
        const top = lineRects().find((r) => r.top >= -1);
        sync.publish({
            view: "pages", song: songName(), line: top?.i ?? 0,
            playlist: (new URLSearchParams(location.search).get("p") || "").split(",").filter(Boolean),
        });
    }

    // The leader's top line goes to the top here. A smaller screen shows less of the
    // page; its own pedal can turn locally until the leader's next turn.
    let wanted = null;
    function align() {
        if (wanted?.song !== songName()) return;
        if (!wanted.line) return scrollTo(0, 0);   // the leader's first page, margin and all
        const r = lineRects().find((x) => x.i === wanted.line);
        if (r) scrollBy(0, r.top - PAD);
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

    const bottom = () => controls.getBoundingClientRect().top - 4;
    const songGo = (d) => document.dispatchEvent(new CustomEvent("songgo", { detail: d }));

    function next() {
        const rects = lineRects(), cut = rects.filter((r) => r.bottom > bottom() + 1);
        let top = Math.min(...cut.map((r) => r.top));
        // A section name left as the last line goes over with the section it names.
        const last = rects.filter((r) => r.bottom <= bottom() + 1).sort((a, b) => a.bottom - b.bottom).at(-1);
        if (last?.section) top = Math.min(top, last.top);
        const before = scrollY;
        // A line taller than the screen would never move; turn a full screen instead.
        if (cut.length) scrollBy(0, top > PAD ? top - PAD : bottom());
        if (scrollY === before) songGo(1);
        else publish();
    }
    function prev() {
        if (scrollY <= 0) return songGo(-1);
        // The last line wholly above the screen becomes this page's last line.
        const above = lineRects().filter((r) => r.bottom <= PAD);
        const delta = above.length ? Math.max(...above.map((r) => r.bottom)) - bottom() : -bottom();
        // Near the top, go all the way: a sliver of page one would cost a press.
        if (scrollY + delta < innerHeight / 4) scrollTo(0, 0);
        else scrollBy(0, delta);
        publish();
    }

    /* ---------- entering and leaving ---------- */

    function show() {
        if (on()) return;
        document.body.classList.add("pages");
        size();
    }
    async function enter() {
        show();
        scrollTo(0, 0);
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

    document.addEventListener("keydown", (e) => {
        if (!on() || /^(SELECT|INPUT)$/.test(e.target.tagName)) return;
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
        scrollTo(0, 0);
        if (following()) align();
        else publish();
    }));
    // A key change re-renders the chart.
    document.addEventListener("songrender", () => {
        if (!on()) return;
        size();
        if (following()) align();
    });

    let pending;
    addEventListener("resize", () => {
        if (!on()) return;
        clearTimeout(pending);
        pending = setTimeout(() => { size(); if (following()) align(); }, 150);
    });
})();
