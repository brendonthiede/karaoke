// node tools/song_check.js — the smallest checks that fail if scripts/song.js parsing or
// transposing breaks. No DOM needed: song.js exports its pure functions under node.
const assert = require("assert");
const { parse, transposeChord, isChordLine } = require("../scripts/song.js");

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
console.log("ok");
