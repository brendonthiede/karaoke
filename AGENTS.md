# AGENTS.md

Static karaoke/chord-chart site. No build step, no dependencies — plain HTML/CSS
served straight from disk (`python3 -m http.server`, see README).

## Layout

| Path | What's in it |
|---|---|
| `index.html` | Main song table. One `<tr>` per song. |
| `christmas.html` | Second playlist, same table format. |
| `tabs/` | Chord charts: `.html` (rendered tab), `.txt`/`.tab` (chord-over-lyric source). |
| `media/` | Local karaoke video files. |
| `tools/` | Python converters (see below). Not served — dev-time only. |
| `scripts/` | Browser JS: `wakelock.js`, `enableToggleChords.js`, `repeats.js`, `fitscreen.js`. |
| `*.css` | Pure.css + Font Awesome, vendored. `style.css` is ours. |

## Adding a song

1. Put the chart in `tabs/`.
2. Add a row to the `<tbody>` in `index.html`:

```html
<tr>
    <td>Song Title</td>
    <td>Show or Artist</td>
    <td><a href="https://youtu.be/...">YouTube</a></td>
    <td><a href="./tabs/SongTitle.html">Local</a>
    </td>
</tr>
```

Filenames are PascalCase, no spaces. The 4th column links a `.html` tab, a
`.txt`, a `.pdf`, or a file in `media/` — whatever exists. Use `&mdash;` for a
cell with nothing to link rather than inventing a URL.

**Never fabricate a YouTube link.** Leave it as `&mdash;` and say so; the owner
fills it in. Several existing links are unverified.

## Tab HTML format

Copy an existing tab (`tabs/GoodnessOfGod.html`) or generate one with
`tools/tab2html.py`. Structure: the standard `<head>` with the four stylesheets
at `../`, a fixed header linking Home to `../index.html`, `<div id="song"
class="container">` holding `.column` divs, and `wakelock.js` at the end.

Chords go *inline, inside the words*, not on a line above:

```html
I will <span class="chord">[D]</span>sing of the <span class="chord">[E]</span>goodness
```

`.chord` is styled in `style.css` (dark blue, bold). Chord-only passages
(intros, instrumentals) use `<pre class="chord">`. Sections get
`<span class="section">Verse 1</span>`. `.container` is `column-count: 2` with
`break-inside: avoid-column` on each `.column`, so sections don't split across
columns.

## Full screen mode

`scripts/fitscreen.js` adds a "Full screen" link to a tab's header. It hides the
page chrome and searches font size against one, two and three columns for the
largest readable size where the whole song fits with no overflow, then remembers
your `+`/`-` nudges per song as a step offset from that fit (never an absolute
px size, so the same offset holds in portrait, landscape and on a laptop).

Wired into the four newest tabs only. Any other tab gets it with one line:

```html
<script src="../scripts/fitscreen.js"></script>
```

It needs `<div id="song">` and finds the header menu itself. The `<meta
name="apple-mobile-web-app-capable">` tags exist so Add to Home Screen on iOS
launches chrome-free — iPadOS Safari won't fullscreen a non-video element, so
that's the only way to actually lose the address bar there.

## tools/

Both scripts print usage when run with no args, and both self-check: they assert
every chord in the source survives into the output in the same order, and fail
the run if one goes missing.

```
python3 tools/transpose.py <in.txt> <out.txt> <semitones>
python3 tools/tab2html.py  <in.txt> <out.html> <title> <heading>
```

`transpose.py` rewrites chord names in place, keeping each at its original
column. It **always spells with sharps** — fine for A/D/E, wrong for flat keys
(you'll get `A#` where you want `Bb`). Add a flat-key preference if that ever
comes up.

`tab2html.py` inlines chords into the lyrics. What it handles, all learned from
real source files:

- **Column drift.** Charts hand-align their chord columns one to three
  characters right of where the word starts, so a literal column mapping lands
  mid-syllable (`me[D]rcy`). Each chord snaps to the nearest word start.
- **Two chords on one word.** The second goes mid-word at a syllable break
  (`[A]a[E/G#]ble`), via a rough vowel-group heuristic — not real hyphenation.
  This is the piece most likely to need a hand-fix.
- **Chords past the end of a lyric line** (pickups into the next line) are
  appended after `&nbsp;`.
- **`(A)`** — parenthesized optional chords; parens preserved in the output.
- **`Page 1/3`** PDF-export artifacts are stripped. They matter: one can land
  between a chord line and its lyric and break the pairing.
- **Wide gaps** separating two phrases on one line become `&nbsp;&nbsp;`, since
  HTML collapses runs of spaces.

It prints every chord it adjusted so a human can spot-check a handful of lines
instead of proofreading the whole song.

## Generated tabs get hand-edited — check before regenerating

`tabs/GoodnessOfGod.html` was generated, then edited by hand: different chord
voicings (`D/A`, `Esus`), a changed word, and repeated sections collapsed to
`(repeat)`. None of that is in `tabs/GoodnessOfGod.txt`.

Re-running `tab2html.py` on that song would silently wipe all of it. Before
regenerating any tab, diff the existing `.html` against a fresh conversion into
a scratch path and look at what differs. If the `.html` has diverged, it is the
source of truth — leave it alone, or fold the edits back into the `.txt` first.

## Lyrics: work only from supplied files

Do not write out lyrics from memory, and do not invent chord placements by ear —
that produced a chart that was wrong on both chord order and syllable
placement, and had to be redone by hand.

Ask for a chord-over-lyric source file. The whole pipeline depends on it: the
chord's column above the lyric is what determines placement. Without that, there
is nothing to convert.

A license (CCLI, iSing Worship, Proclaim) can't be shared with an agent, but its
*exports* can — drop the file in the repo and work from it. Note that Proclaim's
"export chord chart" can produce a lyrics-only sheet with no chords in it;
verify before building on it.

## Environment notes

`poppler-utils` is not installed (no `pdftotext`/`pdftoppm`). Extract PDF text
with Python instead:

```python
import fitz  # pymupdf, installed
print(''.join(p.get_text() for p in fitz.open('file.pdf')))
```
