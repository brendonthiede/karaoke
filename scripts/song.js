// Renders a tabs/*.cho chart into the same DOM the hand-written tabs use, with a
// key picker that transposes it. Format reference: AGENTS.md "Song format".
(() => {
    // Strict on purpose: a loose grammar turns lyric words like "Amen" or "Be" into chords.
    const CHORD = /^(\(?)([A-G][#b]?)((?:m|maj|min|dim|aug|sus|add|\d|\+)*)(?:\/([A-G][#b]?))?(\)?)$/;
    const PASS = /^(\|+|[xX]\d+|\.{3}|-+>)$/;           // bar lines, x3, ..., --> ride along in chord lines
    const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    const INDEX = { C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, F: 5, "E#": 5,
        "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11 };
    const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm"]);

    const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const isChord = (tok) => CHORD.test(tok);
    const isChordLine = (line) => {
        const toks = line.trim().split(/\s+/);
        return toks.some(isChord) && toks.every((t) => isChord(t) || PASS.test(t));
    };

    function transposeChord(tok, steps, flats) {
        const m = CHORD.exec(tok);
        if (!m) return tok;
        const [, open, root, qual, bass, close] = m;
        const shift = (n) => (flats ? FLATS : SHARPS)[(INDEX[n] + steps + 12) % 12];
        return open + shift(root) + qual + (bass ? "/" + shift(bass) : "") + close;
    }

    const parts = (line) => line.split(/(\[[^\]]+\])/).filter(Boolean)
        .map((p) => (p.startsWith("[") ? { chord: p.slice(1, -1) } : { text: p }));

    function parse(text) {
        const meta = {}, blocks = [];
        let m;
        for (const raw of text.split("\n")) {
            const line = raw.trimEnd();
            const last = blocks[blocks.length - 1];
            if ((m = /^\{(\w+):\s*(.*)\}$/.exec(line))) meta[m[1]] = m[2].trim();
            else if (line.startsWith("#")) continue;
            else if ((m = /^\[([^[\]]+)\]$/.exec(line))) blocks.push({ type: "section", name: m[1] });
            else if ((m = /^>\s*(.+?)(?:\s*=\s*(.+))?$/.exec(line))) blocks.push({ type: "repeat", label: m[1], target: m[2] || m[1] });
            else if (line === "---") blocks.push({ type: "break" });
            else if (!line.trim()) blocks.push({ type: "blank" });
            else if (isChordLine(line)) {
                if (last?.type === "pre") last.lines.push(line);
                else blocks.push({ type: "pre", lines: [line] });
            } else blocks.push({ type: "line", parts: parts(line) });
        }
        return { meta, blocks };
    }

    // ?s=B&p=A,B,C → { list: ["A","B","C"], at: 1 }. Bad names dropped, missing p → [].
    function playlist(search) {
        const q = new URLSearchParams(search);
        const list = [...new Set((q.get("p") || "").split(",").filter((n) => /^[\w-]+$/.test(n)))];
        return { list, at: list.indexOf(q.get("s") || "") };
    }

    if (typeof module !== "undefined") module.exports = { parse, transposeChord, isChordLine, playlist };
    if (typeof document === "undefined") return;

    /* ---------- DOM ---------- */

    const song = document.getElementById("song");
    let name = "", list = [], at = -1;
    const el = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    };
    // HTML collapses runs of spaces; the tabs keep deliberate gaps with &nbsp;.
    const nbsp = (s) => s.replace(/ {2,}/g, (g) => " ".repeat(g.length));

    function render(model, steps, flats) {
        const tx = (c) => (steps ? transposeChord(c, steps, flats) : c);
        // Keep bar lines aligned: pad a shorter chord to the width it replaces.
        const txPre = (line) => (steps
            ? line.replace(/\S+/g, (t) => (isChord(t) ? tx(t).padEnd(t.length) : t))
            : line);

        const columns = [];
        let cur = null;
        const open = (header) => columns.push((cur = { header, items: [] }));
        for (const b of model.blocks) {
            if (b.type === "section" || b.type === "repeat") open(b);
            else if (b.type === "break") open(null);
            else {
                if (!cur) open(null);
                cur.items.push(b);
            }
        }

        const out = [];
        for (const { header, items } of columns) {
            const div = el("div", "column");
            if (header?.type === "section") {
                div.id = slug(header.name);
                div.append(el("span", "section", header.name));
                while (items[0]?.type === "blank") items.shift();
            } else if (header?.type === "repeat") {
                const details = el("details");
                details.dataset.repeat = slug(header.target);
                details.append(el("summary", "section", header.label));
                div.append(details);
            }
            while (items.at(-1)?.type === "blank") items.pop();
            let prev = null;
            items.forEach((it, i) => {
                if (it.type === "blank") {
                    // A blank between two chord blocks only splits them into two <pre>s.
                    if (!(prev === "pre" && items[i + 1]?.type === "pre")) div.append(el("br"));
                    if (prev === "line") div.append(el("br"));
                } else if (it.type === "pre") {
                    div.append(el("pre", "chord", it.lines.map(txPre).join("\n")));
                } else {
                    if (prev === "line") div.append(el("br"));
                    for (const p of it.parts) {
                        div.append(p.chord ? el("span", "chord", `[${tx(p.chord)}]`) : nbsp(p.text));
                    }
                }
                prev = it.type;
            });
            out.push(div);
        }
        song.replaceChildren(...out);
        fillRepeats();
    }

    // `<details data-repeat="id">` shows only its section name until tapped, and fills
    // itself from the section with that id — a repeated chorus is written out once.
    function fillRepeats() {
        for (const details of song.querySelectorAll("details[data-repeat]")) {
            const source = document.getElementById(details.dataset.repeat);
            if (!source) {
                console.error(`No section "${details.dataset.repeat}" to repeat`);
                continue;
            }
            for (const node of source.childNodes) {
                if (!node.classList?.contains("section")) details.append(node.cloneNode(true));
            }
        }
    }

    // Twelve keys in the song's mode, each spelled the way that key is written.
    function keyOptions(mode) {
        return SHARPS.map((s, i) => (FLAT_KEYS.has(FLATS[i] + mode) ? FLATS[i] : s) + mode);
    }

    function addKeyPicker(written, onChange) {
        const m = /^([A-G][#b]?)(m?)$/.exec(written);
        const menu = document.querySelector(".pure-menu-list");
        if (!m || !menu) return;
        const [, root, mode] = m;
        const select = el("select");
        select.id = "key";
        select.title = "Key";
        for (const k of keyOptions(mode)) select.append(new Option(k));
        select.selectedIndex = INDEX[root];
        const storage = `key:${name}`;
        try { if (localStorage.getItem(storage)) select.value = localStorage.getItem(storage); } catch { /* fine */ }
        const apply = () => onChange(select.selectedIndex - INDEX[root], FLAT_KEYS.has(select.value));
        select.addEventListener("change", () => {
            try { localStorage.setItem(storage, select.value); } catch { /* not remembered */ }
            apply();
        });
        const item = el("li", "pure-menu-item");
        item.append(select);
        menu.prepend(item);
        apply();
    }

    let loads = 0;
    function load() {
        const mine = ++loads;   // a slower fetch from an earlier Next must not land on top of this one
        name = new URLSearchParams(location.search).get("s") || "";
        ({ list, at } = playlist(location.search));
        updateNav();
        document.getElementById("key")?.closest("li").remove();
        const small = document.getElementById("credits");
        small.parentElement.hidden = true;
        if (!/^[\w-]+$/.test(name)) {
            song.textContent = "No song given: open this page as song.html?s=SongName";
            return;
        }
        fetch(`${name}.cho`, { cache: "no-cache" })
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((text) => {
                if (mine !== loads) return;
                const model = parse(text);
                const { title = name, artist, key, credits } = model.meta;
                document.title = title;
                document.querySelector(".pure-menu-heading").textContent = artist ? `${title} - ${artist}` : title;
                if (credits) {
                    small.textContent = credits;
                    small.parentElement.hidden = false;
                }
                render(model, 0, false);
                if (key) addKeyPicker(key, (steps, flats) => render(model, steps, flats));
            })
            .catch((err) => { if (mine === loads) song.textContent = `Could not load ${name}.cho (${err.message})`; })
            .finally(() => { if (mine === loads) document.dispatchEvent(new Event("songchange")); });
    }

    /* ---------- playlist ---------- */

    // song.html?s=B&p=A,B,C steps through A, B, C in place: the URL is the whole state,
    // so refresh, bookmark and back/forward keep the position.
    const nav = [];   // [element, delta] pairs to enable/disable at the ends
    let pos;
    function go(delta) {
        const to = at + delta;
        if (to < 0 || to >= list.length) return;
        history.pushState(null, "", `?s=${list[to]}&p=${list.join(",")}`);
        load();
    }
    function updateNav() {
        if (!pos) return;
        pos.textContent = `${at + 1} / ${list.length}`;
        for (const [node, delta] of nav) {
            const off = at + delta < 0 || at + delta >= list.length;
            if (node.tagName === "BUTTON") node.disabled = off;
            else node.classList.toggle("pure-menu-disabled", off);
        }
    }
    (function addNav() {
        const { list, at } = playlist(location.search);
        const menu = document.querySelector(".pure-menu-list");
        if (list.length < 2 || at < 0 || !menu) return;
        const item = (label, title, delta) => {
            const li = el("li", "pure-menu-item");
            const a = el("a", "pure-menu-link", label);
            a.href = "#";
            a.title = title;
            a.addEventListener("click", (e) => { e.preventDefault(); go(delta); });
            li.append(a);
            nav.push([li, delta]);
            return li;
        };
        const posItem = el("li", "pure-menu-item");
        pos = el("span", "pure-menu-link");
        posItem.append(pos);
        menu.append(item("‹ Prev", "Previous song", -1), posItem, item("Next ›", "Next song", 1));

        // The fullscreen control cluster hides the header, so it gets its own pair.
        const controls = document.getElementById("fitscreen-controls");
        if (controls) {
            const button = (label, title, delta) => {
                const b = el("button", null, label);
                b.type = "button";
                b.title = title;
                b.setAttribute("aria-label", title);
                b.addEventListener("click", () => go(delta));
                nav.push([b, delta]);
                return b;
            };
            controls.prepend(button("‹", "Previous song", -1), button("›", "Next song", 1));
        }

        document.addEventListener("keydown", (e) => {
            if (/^(SELECT|INPUT)$/.test(e.target.tagName)) return;   // the key picker keeps its arrows
            if (e.key === "ArrowLeft") go(-1);
            else if (e.key === "ArrowRight") go(1);
            else return;
            e.preventDefault();
        });
        window.addEventListener("popstate", load);
    })();

    load();
})();
