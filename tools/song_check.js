// node tools/song_check.js — the smallest checks that fail if scripts/song.js parsing or
// transposing, or scripts/timeline.js timing, breaks. No DOM needed: both export their
// pure functions under node.
const assert = require("assert");
const { parse, transposeChord, isChordLine, playlist } = require("../scripts/song.js");
const { timeline, beatAt, secondsAt, cellBars } = require("../scripts/timeline.js");

// chord-line detection
assert.ok(isChordLine("| E    | E    | A    | B    |"));
assert.ok(isChordLine("-->  | E    | A    | B    |"));
assert.ok(isChordLine("| G ...   |"));
assert.ok(isChordLine("Bm  A/C# D  D/F# A  G"));
assert.ok(!isChordLine("Amen"), "Amen is a lyric");
assert.ok(!isChordLine("Be still"), "Be is a lyric");
assert.ok(!isChordLine("x3"), "x3 alone is a lyric");

// line classification
const { meta, blocks } = parse([
    "{title: Song}", "{key: Bm}", "# comment", "[Bridge]", "", "[C#m7]My heart [B]out", "",
    "Amen", "> Chorus", "> Turnaround = Intro", "---", "| E | A |", "| B |", "", "| E |",
].join("\n"));
assert.deepStrictEqual(meta, { title: "Song", key: "Bm" });
assert.deepStrictEqual(blocks.map((b) => b.type),
    ["section", "blank", "line", "blank", "line", "repeat", "repeat", "break", "pre", "blank", "pre"]);
assert.strictEqual(blocks[0].name, "Bridge");
assert.deepStrictEqual(blocks[2].parts, [{ chord: "C#m7" }, { text: "My heart " }, { chord: "B" }, { text: "out" }]);
assert.deepStrictEqual(blocks[5], { type: "repeat", label: "Chorus", target: "Chorus" });
assert.deepStrictEqual(blocks[6], { type: "repeat", label: "Turnaround", target: "Intro" });
assert.deepStrictEqual(blocks[8].lines, ["| E | A |", "| B |"]);

// transposition
assert.strictEqual(transposeChord("C#m7/E", 3, true), "Em7/G");
assert.strictEqual(transposeChord("Gb", 2, false), "G#");
assert.strictEqual(transposeChord("Gb", 3, false), "A");
assert.strictEqual(transposeChord("A#", -1, true), "A");
assert.strictEqual(transposeChord("(A)", 2, false), "(B)");
assert.strictEqual(transposeChord("Dbsus4", -1, false), "Csus4");
assert.strictEqual(transposeChord("Gbmaj7/Bb", 5, true), "Bmaj7/Eb");
assert.strictEqual(transposeChord("x2", 5, true), "x2");

// playlist URL
assert.deepStrictEqual(playlist("?s=B&p=A,B,C"), { list: ["A", "B", "C"], at: 1 });
assert.deepStrictEqual(playlist("?s=B&p=A,../x,B,B"), { list: ["A", "B"], at: 1 }, "bad and duplicate names dropped");
assert.deepStrictEqual(playlist("?s=A"), { list: [], at: -1 });

// directives: header ones are meta, body ones are positioned; `{n}` suffix is a bar count
{
    const { meta, blocks } = parse([
        "{title: T}", "{tempo: 80}", "", "[V]", "{tempo: 60}", "Hello {1}", "| E | A | {0.5}", "{hold}", "{key: C}",
    ].join("\n"));
    assert.deepStrictEqual(meta, { title: "T", tempo: "80", key: "C" }, "body {tempo} does not overwrite the header");
    assert.deepStrictEqual(blocks.map((b) => b.type), ["blank", "section", "directive", "line", "pre", "directive"]);
    assert.deepStrictEqual(blocks[2], { type: "directive", name: "tempo", value: "60" });
    assert.deepStrictEqual(blocks[3], { type: "line", parts: [{ text: "Hello" }], bars: 1 });
    assert.deepStrictEqual(blocks[4], { type: "pre", lines: ["| E | A |"], bars: [0.5] });
    assert.deepStrictEqual(blocks[5], { type: "directive", name: "hold", value: "" });
    assert.strictEqual(parse("Amen {to}").blocks[0].parts[0].text, "Amen {to}", "only a number is a bar count");
}

// cell rule
assert.strictEqual(cellBars("| E    | E    | A    | B    |"), 4);
assert.strictEqual(cellBars("-->  | C    | F    | G    |"), 3);
assert.strictEqual(cellBars("| G ...   |"), 1);
assert.strictEqual(cellBars("| E | A | x2"), 4);
assert.strictEqual(cellBars("| C#  G#  Eb | x2"), null, "three chords in a cell");
assert.strictEqual(cellBars("Bm  A/C# D"), null, "no bar lines");

// timeline
assert.strictEqual(timeline(parse("{title: T}\nHello")), null, "no {tempo}, no timeline");
assert.strictEqual(timeline(parse("{tempo: 60}\nHello")).events[0].start, 4, "one bar of count-in by default");
assert.strictEqual(timeline(parse("{tempo: 60}\n{count: 0}\nHello")).events[0].start, 0, "{count: 0}: none");
{
    const tl = timeline(parse([
        "{tempo: 60}", "{count: 1}",
        "| E | A |",
        "[Chorus]", "One", "Two {1}", "", "(Acapella)", "Three", "x3",
        "[Bridge]", "{tempo: 120}", "{time: 3/4}", "| C D | G |", "{hold}",
        "> Chorus", "> Gone",
    ].join("\n")));
    const ev = tl.events.map((e) => [e.text, e.section, e.start, e.beats]);
    assert.deepStrictEqual(ev, [
        ["| E | A |", null, 4, 8],          // after a one-bar count-in, cell rule: 2 bars
        ["One", "Chorus", 12, 8],           // default 2 bars
        ["Two", "Chorus", 20, 4],           // `{1}`
        ["(Acapella)", "Chorus", 24, 0],    // a direction takes no time
        ["Three", "Chorus", 24, 8],         // `x3` repeats the group since the blank
        ["Three", "Chorus", 32, 8],
        ["Three", "Chorus", 40, 8],
        ["| C D | G |", "Bridge", 48, 6],   // cell rule fails: lyric default, in 3/4
        ["One", "Chorus", 54, 6],           // repeat replays the section, still 3/4
        ["Two", "Chorus", 60, 3],
        ["(Acapella)", "Chorus", 63, 0],
        ["Three", "Chorus", 63, 6],
        ["Three", "Chorus", 69, 6],
        ["Three", "Chorus", 75, 6],
    ]);
    assert.strictEqual(tl.end, 81);
    assert.deepStrictEqual(tl.events.map((e) => (e.head ? "H" : e.gap ? "g" : ".")).join(""), ".H.g.ggHH.g.gg",
        "a head starts each section pass, a gap follows a blank or starts an x3 pass");
    assert.deepStrictEqual(tl.tempo, [{ beat: 0, bpm: 60 }, { beat: 48, bpm: 120 }]);
    assert.deepStrictEqual(tl.holds, [54]);
    assert.deepStrictEqual(tl.warnings, ['No section "Gone" to repeat', 'Bridge: "| C D | G |" needs a {n} bar count']);

    // beats <-> seconds across a tempo step, freezing at a hold
    assert.strictEqual(secondsAt(tl, 0, 48), 48);
    assert.strictEqual(secondsAt(tl, 40, 52), 8 + 2);
    assert.strictEqual(beatAt(tl, 0, 10), 10);
    assert.strictEqual(beatAt(tl, 40, 10), 52);
    assert.strictEqual(beatAt(tl, 40, 60), 54, "stops at the hold");
    assert.strictEqual(beatAt(tl, 54, 1), 56, "resumes from the hold");
    for (const b of [0, 13.5, 47, 50]) assert.strictEqual(beatAt(tl, 0, secondsAt(tl, 0, b)), b);
}
console.log("ok");
