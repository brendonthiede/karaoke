// Fullscreen chord-chart mode: hides the page chrome and sizes the song so the
// whole chart lands on one screen. A manual zoom is remembered per song as a
// step offset from that fit, never an absolute size, so the same offset means
// the same thing in portrait, in landscape and on a laptop.
(() => {
    const song = document.getElementById("song");
    if (!song) return;

    const MIN = 9, MAX = 72, STEP = 1.1;
    const KEY = `fitscreen:${location.pathname}`;

    // Candidate sizes, on the same 10% rungs the +/- buttons walk.
    const SIZES = [];
    for (let s = MIN; s <= MAX; s *= STEP) SIZES.push(s);

    // Safari can throw on storage access with content blocking or a full quota,
    // and a dead zoom button is a worse outcome than a forgotten one.
    const remember = (value) => {
        try {
            if (value === null) localStorage.removeItem(KEY);
            else localStorage.setItem(KEY, value);
        } catch { /* not remembered, but the session still works */ }
    };
    const remembered = () => {
        try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; }
    };

    let offset = remembered();
    let base = MIN;
    let columns = 2;

    /* ---------- controls ---------- */

    const controls = document.createElement("div");
    controls.id = "fitscreen-controls";

    const button = (label, description, onClick) => {
        const el = document.createElement("button");
        el.type = "button";
        el.textContent = label;
        el.title = description;
        el.setAttribute("aria-label", description);
        el.addEventListener("click", onClick);
        return el;
    };

    /* ---------- measuring ---------- */

    const isOn = () => document.body.classList.contains("fitscreen");

    // Vertical room for the song: down to the control cluster, which is a fixed
    // overlay and would otherwise sit on top of the last lines of column two.
    function available() {
        const bottom = isOn()
            ? controls.getBoundingClientRect().top - 8
            : window.innerHeight;
        return bottom - song.getBoundingClientRect().top;
    }

    function fits(size, cols) {
        song.style.fontSize = `${size}px`;
        song.style.columnCount = cols;
        return song.scrollHeight <= available()
            && song.scrollWidth <= song.clientWidth + 1;
    }

    const isBlock = (node) =>
        node.nodeType === 1 && getComputedStyle(node).display !== "inline";

    // A wrap is a lyric line the column was too narrow to hold. Counted from the
    // distinct tops of a segment's client rects: boxes sharing a line share a top
    // to within a pixel, and a wrapped line starts a whole line-height lower.
    function wraps() {
        const range = document.createRange();
        let total = 0;
        for (const column of song.querySelectorAll(".column")) {
            let segment = [];
            const flush = () => {
                if (!segment.length) return;
                range.setStartBefore(segment[0]);
                range.setEndAfter(segment[segment.length - 1]);
                const tops = [...range.getClientRects()]
                    .map((rect) => rect.top)
                    .sort((a, b) => a - b);
                for (let i = 1; i < tops.length; i++) {
                    if (tops[i] - tops[i - 1] > 1) total++;
                }
                segment = [];
            };
            for (const node of column.childNodes) {
                if (node.nodeName === "BR" || isBlock(node)) flush();
                else segment.push(node);
            }
            flush();
        }
        return total;
    }

    // Largest rung that still fits at this column count, or -1 if none does.
    function largestFitting(cols) {
        let lo = 0, hi = SIZES.length - 1, best = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (fits(SIZES[mid], cols)) { best = mid; lo = mid + 1; }
            else hi = mid - 1;
        }
        return best;
    }

    /* ---------- fitting ---------- */

    function apply() {
        song.style.fontSize = `${base * STEP ** offset}px`;
        song.style.columnCount = columns;
    }

    function fit() {
        window.scrollTo(0, 0);
        let winner = null;
        for (const cols of [1, 2, 3]) {
            const size = SIZES[Math.max(largestFitting(cols), 0)];
            fits(size, cols);   // leave this candidate laid out so wraps() sees it
            // ponytail: a chopped line is priced at ~2% of font size, which is
            // what decides 2 vs 3 columns in landscape. Lower the 0.02 to favour
            // bigger type over unbroken lines.
            const score = size / (1 + 0.02 * wraps());
            if (!winner || score > winner.score) winner = { size, cols, score };
        }
        base = winner.size;
        columns = winner.cols;
        clampOffset(0);
        apply();
        console.log(
            `fitscreen: fits at ${base.toFixed(1)}px in ${columns} column(s)`
            + (base <= MIN ? " — hit the floor, will scroll" : "")
            + (offset ? `, plus your saved ${offset > 0 ? "+" : ""}${offset} step(s)` : "")
        );
    }

    // Keep the saved offset inside the size limits, so pressing + at the ceiling
    // doesn't bank steps that have to be pressed back off later.
    function clampOffset(delta) {
        const rungs = (px) => Math.log(px / base) / Math.log(STEP);
        offset = Math.min(
            Math.floor(rungs(MAX)),
            Math.max(Math.ceil(rungs(MIN)), offset + delta),
        );
    }

    function zoom(delta) {
        clampOffset(delta);
        apply();
        remember(offset);
    }

    function reset() {
        offset = 0;
        remember(null);
        fit();
    }

    /* ---------- entering and leaving ---------- */

    async function enter() {
        document.body.classList.add("fitscreen");
        const root = document.documentElement;
        try {
            await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
        } catch {
            // iPadOS Safari won't fullscreen a non-video element, so the hidden
            // header is the whole win there. Add to Home Screen for the rest.
        }
        requestAnimationFrame(fit);
    }

    function leave() {
        document.body.classList.remove("fitscreen");
        song.style.fontSize = "";
        song.style.columnCount = "";
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
        }
    }

    controls.append(
        button("−", "Smaller", () => zoom(-1)),
        button("+", "Bigger", () => zoom(1)),
        button("⤡", "Fit to screen", reset),
        button("✕", "Exit full screen", leave),
    );
    document.body.append(controls);

    const menu = document.querySelector(".pure-menu-list");
    if (menu) {
        const item = document.createElement("li");
        item.className = "pure-menu-item";
        const link = document.createElement("a");
        link.href = "#";
        link.id = "fitscreen-enter";
        link.className = "pure-menu-link";
        link.textContent = "Full screen";
        link.addEventListener("click", (event) => { event.preventDefault(); enter(); });
        item.append(link);
        menu.prepend(item);
    }

    for (const event of ["fullscreenchange", "webkitfullscreenchange"]) {
        document.addEventListener(event, () => {
            const real = document.fullscreenElement || document.webkitFullscreenElement;
            if (!real && isOn()) leave();
        });
    }

    let pending;
    window.addEventListener("resize", () => {
        if (!isOn()) return;
        clearTimeout(pending);
        pending = setTimeout(fit, 150);
    });

    document.addEventListener("keydown", (event) => {
        if (!isOn()) {
            if (event.key === "f") enter();
            return;
        }
        if (event.key === "+" || event.key === "=") zoom(1);
        else if (event.key === "-") zoom(-1);
        else if (event.key === "0") reset();
        else if (event.key === "Escape") leave();
        else return;
        event.preventDefault();
    });
})();
