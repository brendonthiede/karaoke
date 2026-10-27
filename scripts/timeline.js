// A parsed chart's events in play order, placed in beats, plus its tempo map and holds.
// Pure, no DOM. Timing model and directives: docs/autoscroll-plan.md "Timing model".
(() => {
    const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const perBar = (time) => +String(time).split("/")[0] || 4;

    // `| E | E | A | B |` is 4 bars, `| E | A | x2` is 4. Null when any cell holds more
    // than one chord or the line has no bar lines: then only a `{n}` can say how long it is.
    function cellBars(line) {
        const segs = line.split(/\|+/);
        if (segs.length < 3) return null;
        const cells = segs.slice(1, -1).map((s) => s.trim().split(/\s+/).filter((t) => t && t !== "..."));
        const tail = segs.at(-1).trim(), times = /^[xX](\d+)$/.exec(tail);
        if (!cells.every((c) => c.length === 1) || (tail && !times)) return null;
        return cells.length * (times ? +times[1] : 1);
    }

    // Null when the chart has no {tempo}: autoscroll is not offered for it.
    function timeline({ meta, blocks }) {
        if (!(+meta.tempo > 0)) return null;
        const warnings = [];

        const sections = {};
        let body = null;
        for (const b of blocks) {
            if (b.type === "section") sections[slug(b.name)] = body = [];
            else if (b.type === "repeat" || b.type === "break") body = null;
            else body?.push(b);
        }

        // Expand repeats and `x3` lines into play order; directives ride along unplaced.
        // `head` marks the first event of each section pass, `gap` one after a blank line.
        const items = [];
        let group = [], head = false, gap = false;
        const add = (e) => {
            e.head = head;
            e.gap = gap && !head;
            head = gap = false;
            items.push(e);
            if (e.kind !== "direction") group.push(e);
        };
        const step = (b, section) => {
            if (b.type === "blank") {
                group = [];
                gap = true;
            } else if (b.type === "directive") items.push(b);
            else if (b.type === "pre") b.lines.forEach((text, i) => add({ kind: "chords", text, bars: b.bars[i], section }));
            else if (b.type === "line") {
                const text = b.parts.map((p) => (p.chord ? "" : p.text)).join("").trim();
                const times = !b.parts.some((p) => p.chord) && /^[xX](\d+)$/.exec(text);
                if (times) {
                    const once = group.slice();
                    for (let n = 1; n < +times[1]; n++) items.push(...once.map((e, i) => ({ ...e, head: false, gap: !i })));
                    group = [];
                } else {
                    // A direction is shown on stage but takes no time.
                    const direction = /^\(.*\)$/.test(text) && !b.parts.some((p) => p.chord);
                    add({ kind: direction ? "direction" : "lyric", text, parts: b.parts, bars: direction ? 0 : b.bars, section });
                }
            }
        };
        let section = null;
        for (const b of blocks) {
            if (b.type === "section" || b.type === "break") {
                section = b.name ?? null;
                group = [];
                head = b.type === "section";
                gap = false;
            } else if (b.type === "repeat") {
                section = b.label;
                group = [];
                head = true;
                gap = false;
                if (sections[slug(b.target)]) sections[slug(b.target)].forEach((x) => step(x, section));
                else warnings.push(`No section "${b.target}" to repeat`);
                group = [];
            } else step(b, section);
        }

        let beatsPerBar = perBar(meta.time ?? 4), defaultBars = +meta.bars || 2;
        let beat = (meta.count == null ? 1 : +meta.count || 0) * beatsPerBar;   // count-in bars, default one
        const tempo = [{ beat: 0, bpm: +meta.tempo }], holds = [], events = [];
        for (const it of items) {
            if (it.type === "directive") {
                const v = +it.value;
                if (it.name === "hold") holds.push(beat);
                else if (it.name === "time") beatsPerBar = perBar(it.value);
                else if (it.name === "bars" && v > 0) defaultBars = v;
                else if (it.name === "tempo" && v > 0) {
                    if (tempo.at(-1).beat === beat) tempo.at(-1).bpm = v;
                    else tempo.push({ beat, bpm: v });
                } else warnings.push(`Bad {${it.name}: ${it.value}}`);
                continue;
            }
            let bars = it.bars ?? (it.kind === "chords" ? cellBars(it.text) : defaultBars);
            if (bars == null) {
                warnings.push(`${it.section ?? "Intro"}: "${it.text}" needs a {n} bar count`);
                bars = defaultBars;
            }
            events.push({ ...it, bars, start: beat, beats: bars * beatsPerBar });
            beat += bars * beatsPerBar;
        }
        return { events, tempo, holds, end: beat, warnings: [...new Set(warnings)] };
    }

    // Seconds the clock takes from one beat to another under the tempo map.
    function secondsAt(tl, from, to) {
        let s = 0;
        tl.tempo.forEach((st, i) => {
            const a = Math.max(from, st.beat), b = Math.min(to, tl.tempo[i + 1]?.beat ?? Infinity);
            if (b > a) s += ((b - a) * 60) / st.bpm;
        });
        return s;
    }

    // The beat reached `seconds` after `from`. Stops at the next hold after `from`, so
    // resuming from a hold (anchored at its beat) runs on.
    function beatAt(tl, from, seconds) {
        const hold = tl.holds.find((h) => h > from) ?? Infinity;
        let beat = from;
        let i = tl.tempo.findLastIndex((st) => st.beat <= from);
        while (seconds > 0) {
            const { bpm } = tl.tempo[i];
            const next = Math.min(tl.tempo[i + 1]?.beat ?? Infinity, hold);
            const need = ((next - beat) * 60) / bpm;
            if (seconds < need) return beat + (seconds * bpm) / 60;
            seconds -= need;
            beat = next;
            if (beat === hold) return hold;
            i++;
        }
        return beat;
    }

    const api = { timeline, beatAt, secondsAt, cellBars };
    if (typeof module !== "undefined") module.exports = api;
    else globalThis.Timeline = api;
})();
