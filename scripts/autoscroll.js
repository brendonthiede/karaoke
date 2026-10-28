// Stage view: the chart in one column, scrolled by a beat clock so the current line
// rests on the now line. Timing model, controls and roles: docs/autoscroll-plan.md.
// song.js renders the column (body.autoscroll); this file owns the clock and the view.
// `?role=lead` publishes the clock through sync.js, `?role=stage` follows it; with no
// role the view runs alone and never publishes.
(() => {
    const song = document.getElementById("song");
    if (!song || !globalThis.Timeline) return;
    const { beatAt } = globalThis.Timeline;

    const NOW = 1 / 3;          // now line, as a fraction of the viewport height
    const PEEK_MS = 3000;       // after a drag the clock takes the view back this much later
    const TEMPO_STEP = 1.02, SIZE_STEP = 1.1, MIN_PX = 12, MAX_PX = 120;

    const on = () => document.body.classList.contains("autoscroll");
    const el = (tag, id, text) => {
        const e = document.createElement(tag);
        if (id) e.id = id;
        if (text != null) e.textContent = text;
        return e;
    };

    /* ---------- clock ---------- */

    const sync = globalThis.Sync;
    let role = sync ? new URLSearchParams(location.search).get("role") : null;
    const leading = () => role === "lead", following = () => role === "stage";

    let tl = null;
    // Position is computed from the anchor every frame, never accumulated (plan: "broadcast state").
    // Anchor times are relay time, so a follower can compute from the leader's anchor.
    const START = { playing: false, time: 0, beat: 0, scale: 1 };
    let clock = START;
    const now = () => sync?.now() ?? performance.now() / 1000;
    const position = () => (clock.playing
        ? Math.min(beatAt(tl, clock.beat, (now() - clock.time) * clock.scale), tl.end)
        : clock.beat);
    const anchor = (changes) => {
        const beat = Math.max(0, Math.min(tl.end, changes.beat ?? position()));
        clock = { ...clock, ...changes, beat, time: now() };
        if (leading()) publish();
    };
    const bpmAt = (beat) => tl.tempo.findLast((st) => st.beat <= beat).bpm;
    const atHold = (pos) => clock.playing && tl.holds.includes(pos);

    const play = () => anchor({ playing: true });
    const pause = () => anchor({ playing: false });
    const toggle = () => (clock.playing && !atHold(position()) ? pause() : play());
    const restart = () => anchor({ beat: 0, playing: false });
    const scaleBy = (k) => anchor({ scale: clock.scale * k });

    // Sync-here: "we are here, now". Jump: there, and wait.
    function syncHere(i) {
        anchor({ beat: tl.events[i].start });
        lines[i]?.classList.remove("flash");
        void lines[i]?.offsetWidth;   // restart the animation on a second tap
        lines[i]?.classList.add("flash");
    }
    const jump = (i) => anchor({ beat: tl.events[i].start, playing: false });

    // The same point in the next or previous line, tempo untouched.
    function nudge(d) {
        const pos = position(), ev = tl.events;
        let i = ev.findLastIndex((e) => e.start <= pos && e.beats);
        const frac = i < 0 ? 0 : (pos - ev[i].start) / ev[i].beats;
        do i += d; while (ev[i] && !ev[i].beats);
        if (ev[i]) anchor({ beat: ev[i].start + frac * ev[i].beats });
    }

    // Four taps on the beat; each later tap refines it from the last four.
    let taps = [];
    function tap() {
        const t = now();
        if (t - (taps.at(-1) ?? -Infinity) > 2) taps = [];
        taps = [...taps, t].slice(-4);
        if (taps.length < 4) return;
        const bpm = 60 / ((taps[3] - taps[0]) / 3);
        anchor({ scale: bpm / bpmAt(position()) });
    }

    /* ---------- leading and following ---------- */

    const songName = () => new URLSearchParams(location.search).get("s");
    function publish() {
        const p = (new URLSearchParams(location.search).get("p") || "").split(",").filter(Boolean);
        const state = {
            song: songName(), playlist: p, state: clock.playing ? "playing" : "paused",
            anchor: { relayTime: clock.time, beat: clock.beat }, tempoScale: clock.scale,
        };
        sync.publish(state);
        try { sessionStorage.setItem("lead", JSON.stringify(state)); } catch { /* no reload recovery */ }
    }
    const fromState = (st) => ({ playing: st.state === "playing", time: st.anchor.relayTime, beat: st.anchor.beat, scale: st.tempoScale ?? 1 });

    let waiting = null, prefetched = "";
    // Anyone with the room word can publish, so a state is checked before it moves the clock.
    const valid = (st) => Number.isFinite(st.anchor?.relayTime) && Number.isFinite(st.anchor?.beat)
        && Number.isFinite(st.tempoScale ?? 1) && (st.tempoScale ?? 1) > 0 && Array.isArray(st.playlist ?? []);
    function follow(st) {
        if (!valid(st)) return;
        if (leading()) {
            if (st.from === sync.id) return;   // the relay handing back this tab's state from before a reload
            setRole("stage");                  // someone took the lead: last writer wins
        }
        if (!following()) return;
        if (st.playlist?.join() !== prefetched) {
            prefetched = st.playlist?.join() ?? "";
            for (const n of st.playlist ?? []) if (/^[\w-]+$/.test(n)) fetch(`${n}.cho`).catch(() => {});   // so a Wi-Fi drop mid-set still has the charts
        }
        if (st.song === songName() && tl) {
            clock = fromState(st);
            return;
        }
        waiting = st;
        if (st.song !== songName()) {
            document.dispatchEvent(new CustomEvent("songopen", { detail: { s: st.song, p: st.playlist ?? [] } }));
        }
    }
    sync?.onState(follow);

    function setRole(r) {
        role = r;
        const q = new URLSearchParams(location.search);
        q.set("role", r);
        history.replaceState(null, "", `?${q}`.replace(/%2C/g, ","));
        for (const b of leaderOnly) b.hidden = following();
        takeLead.hidden = !following();
    }
    function takeTheLead() {
        setRole("lead");
        anchor({});
    }

    /* ---------- layout ---------- */

    let lines = [], tops = [];
    const progress = el("div", "autoscroll-progress");

    function measure() {
        lines = [...song.querySelectorAll("[data-event]")];
        tops = lines.map((l) => l.getBoundingClientRect().top + scrollY);
        const last = lines.at(-1);
        if (last) tops.push(last.getBoundingClientRect().bottom + scrollY);
        shown = null;
    }

    // The longest line fills the width; +/- are steps from that, remembered per song.
    const sizeKey = () => `scroll:${new URLSearchParams(location.search).get("s")}`;
    let steps = 0;
    try { steps = Number(localStorage.getItem(sizeKey())) || 0; } catch { /* default size */ }
    function size() {
        song.style.fontSize = "20px";
        song.classList.add("measuring");
        measure();
        const range = document.createRange();
        const widest = Math.max(1, ...lines.map((l) => {
            range.selectNodeContents(l);
            return range.getBoundingClientRect().width;
        }));
        song.classList.remove("measuring");
        const px = (20 * song.clientWidth * 0.97) / widest * SIZE_STEP ** steps;
        song.style.fontSize = `${Math.min(MAX_PX, Math.max(MIN_PX, px))}px`;
        measure();
    }
    function zoom(d) {
        steps += d;
        try { localStorage.setItem(sizeKey(), steps); } catch { /* not remembered */ }
        size();
    }

    /* ---------- frame ---------- */

    const status = el("div", "autoscroll-status");
    const label = el("span");
    status.append(label);
    const dot = el("span", "autoscroll-dot");   // the beat pulse, at the start of the current line
    const count = el("div", "autoscroll-count");   // 1, 2, 3, 4 above the first line during the count-in
    const nowLine = el("div", "autoscroll-now");

    let peekUntil = 0, shown = null;
    function mark(i) {
        lines.forEach((l, k) => {
            l.classList.toggle("past", k < i);
            l.classList.toggle("now", k === i);
        });
        (lines[i] ?? song).append(progress);
        progress.hidden = i < 0;
        lines[Math.max(i, 0)]?.prepend(dot);   // during a count-in it pulses on the first line
    }

    function frame() {
        if (!on()) return;
        requestAnimationFrame(frame);
        if (!tl || tops.length !== tl.events.length + 1) return;
        let pos = position();
        if (clock.playing && pos >= tl.end) {
            anchor({ beat: tl.end, playing: false });
            pos = tl.end;
        }
        const ev = tl.events;
        const i = ev.findLastIndex((e) => e.start <= pos);
        if (i !== shown) mark((shown = i));
        const e = ev[i] ?? ev[0];
        const frac = i >= 0 && e.beats ? Math.min(1, (pos - e.start) / e.beats) : 0;
        const y = i < 0 ? tops[0] : tops[i] + frac * (tops[i + 1] - tops[i]);
        if (performance.now() > peekUntil) window.scrollTo(0, y - innerHeight * NOW);
        progress.style.transform = `scaleX(${frac})`;

        // ponytail: bars counted from each line's start, so a {0.5} pickup shifts the
        // downbeat for the rest of its line. Count from the section pass if that matters.
        const bpb = e.bars ? e.beats / e.bars : 4;
        const down = Math.floor(pos - e.start) % bpb === 0;
        const beatFrac = pos - Math.floor(pos);
        const pulse = clock.playing && !atHold(pos) ? (down ? 1.2 : 0.6) * (1 - beatFrac) ** 3 : 0;
        dot.style.transform = `scale(${1 + pulse})`;
        const n = i < 0 && (clock.playing || pos > 0) ? String((Math.floor(pos) % bpb) + 1) : "";
        if (count.textContent !== n) count.textContent = n;
        count.style.transform = `translateX(-50%) scale(${1 + pulse / 4})`;

        let text;
        if (i < 0) text = pos > 0 ? "Count-in" : document.title;
        else {
            const h = ev.findLastIndex((x, k) => k <= i && x.head);
            const next = ev.find((x, k) => k > i && x.head);
            const start = (ev[h] ?? ev[0]).start, end = next?.start ?? tl.end;
            const bars = Math.round((end - start) / bpb);
            text = `${e.section ?? "Intro"} · bar ${Math.min(bars, Math.floor((pos - start) / bpb) + 1)}/${bars}`;
            if (next && end - pos <= 2 * bpb) text += ` → ${next.section}`;
        }
        const tempo = Math.round(bpmAt(pos) * clock.scale);
        text += ` · ${tempo} bpm` + (clock.scale !== 1 ? ` (${clock.scale > 1 ? "+" : ""}${Math.round((clock.scale - 1) * 100)}%)` : "");
        if (atHold(pos)) text += " · Hold";
        else if (!clock.playing) text += " · Paused";
        if (role) text += leading() ? " · Leading" : " · Following";
        if (role && sync.enabled && !sync.connected) text += " · reconnecting";
        if (label.textContent !== text) label.textContent = text;
        const playing = clock.playing && !atHold(pos);
        if (playButton.textContent !== (playing ? "⏸" : "▶")) playButton.textContent = playing ? "⏸" : "▶";
    }

    /* ---------- entering and leaving ---------- */

    function show() {
        if (on()) return;
        document.body.classList.add("autoscroll");
        document.dispatchEvent(new Event("songredraw"));
        requestAnimationFrame(frame);
    }

    async function enter() {
        if (!tl) return;
        clock = START;
        show();
        if (leading()) anchor({});
        const root = document.documentElement;
        try {
            await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
        } catch { /* iPadOS: Add to Home Screen instead, see AGENTS.md */ }
    }

    function leave() {
        document.body.classList.remove("autoscroll");
        song.style.fontSize = "";
        document.dispatchEvent(new Event("songredraw"));
        window.scrollTo(0, 0);
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
        }
    }

    /* ---------- controls ---------- */

    const controls = el("div", "autoscroll-controls");
    const button = (text, title, onClick) => {
        const b = el("button", null, text);
        b.type = "button";
        b.title = title;
        b.setAttribute("aria-label", title);
        b.addEventListener("click", onClick);
        return b;
    };
    const playButton = button("▶", "Play / pause (space)", toggle);
    const songGo = (d) => document.dispatchEvent(new CustomEvent("songgo", { detail: d }));
    const playlist = (new URLSearchParams(location.search).get("p") || "").split(",").filter(Boolean).length > 1;
    const leaderOnly = [
        ...(playlist ? [button("‹", "Previous song", () => songGo(-1))] : []),
        playButton,
        button("Tap", "Tap tempo, four times on the beat (t)", tap),
        button("−%", "Slower 2% ([)", () => scaleBy(1 / TEMPO_STEP)),
        button("+%", "Faster 2% (])", () => scaleBy(TEMPO_STEP)),
    ];
    const next = playlist ? [button("›", "Next song", () => songGo(1))] : [];
    leaderOnly.push(...next);
    const takeLead = button("Lead", "Take the lead", takeTheLead);
    controls.append(
        ...leaderOnly.slice(0, leaderOnly.length - next.length),
        takeLead,
        button("A−", "Smaller", () => zoom(-1)),
        button("A+", "Bigger", () => zoom(1)),
        ...next,
        button("✕", "Exit autoscroll (Esc)", leave),
    );
    if (role) setRole(role);
    else takeLead.hidden = true;
    document.body.append(nowLine, status, count, controls);

    const menu = document.querySelector(".pure-menu-list");
    const item = el("li");
    item.className = "pure-menu-item";
    item.hidden = true;
    const link = el("a", "autoscroll-enter", "Autoscroll");
    link.href = "#";
    link.className = "pure-menu-link";
    link.addEventListener("click", (e) => { e.preventDefault(); enter(); });
    item.append(link);
    menu?.prepend(item);

    // Tap a line: sync-here. Tap a section name: jump there, paused. A drag is a peek.
    song.addEventListener("click", (e) => {
        if (!on() || following()) return;
        const line = e.target.closest("[data-event]"), head = e.target.closest("[data-head]");
        if (line) syncHere(+line.dataset.event);
        else if (head) jump(+head.dataset.head);
        else return;
        peekUntil = 0;
    });
    addEventListener("touchstart", () => { if (on()) peekUntil = Infinity; }, { passive: true });
    addEventListener("touchend", () => { if (on()) peekUntil = performance.now() + PEEK_MS; }, { passive: true });
    addEventListener("wheel", () => { if (on()) peekUntil = performance.now() + PEEK_MS; }, { passive: true });

    // A pedal sends arrows or Page Up/Down: right/down plays, left/up pauses.
    document.addEventListener("keydown", (e) => {
        if (!on() || /^(SELECT|INPUT)$/.test(e.target.tagName)) return;
        const keys = {
            " ": toggle, ArrowRight: play, PageDown: play, ArrowLeft: pause, PageUp: pause,
            ArrowDown: () => nudge(1), ArrowUp: () => nudge(-1), Home: restart, t: tap,
            "]": () => scaleBy(TEMPO_STEP), "[": () => scaleBy(1 / TEMPO_STEP),
            "+": () => zoom(1), "=": () => zoom(1), "-": () => zoom(-1), Escape: leave,
        };
        if (!keys[e.key] || (following() && !/^[-+=]$|^Escape$/.test(e.key))) return;
        e.preventDefault();
        keys[e.key]();
    });

    for (const event of ["fullscreenchange", "webkitfullscreenchange"]) {
        document.addEventListener(event, () => {
            if (!(document.fullscreenElement || document.webkitFullscreenElement) && on()) leave();
        });
    }

    // song.js renders before it announces the song, so a new chart is laid out by now.
    document.addEventListener("songchange", (e) => {
        tl = e.detail?.timeline ?? null;
        item.hidden = !tl;
        try { steps = Number(localStorage.getItem(sizeKey())) || 0; } catch { steps = 0; }
        if (role && tl) show();   // leading and following both live in the stage view
        if (!on()) return;
        if (!tl) return leave();
        clock = START;
        if (following() && waiting?.song === songName()) {
            clock = fromState(waiting);
            waiting = null;
        } else if (leading()) {
            // A reload re-publishes where the leader was rather than restarting the room.
            let saved = null;
            try { saved = JSON.parse(sessionStorage.getItem("lead")); } catch { /* start over */ }
            if (saved?.song === songName()) clock = fromState(saved);
            anchor({});
        }
        size();
    });
    document.addEventListener("songrender", () => { if (on()) size(); });

    let pending;
    addEventListener("resize", () => {
        if (!on()) return;
        clearTimeout(pending);
        pending = setTimeout(size, 150);
    });
})();
