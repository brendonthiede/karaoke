# AGENTS.md

Static karaoke/chord-chart site. No build step, no dependencies — plain HTML/CSS
served straight from disk (`python3 -m http.server`, see README).

## Layout

| Path | What's in it |
|---|---|
| `index.html` | Main song table. One `<tr>` per song. |
| `christmas.html` | Second playlist, same table format. |
| `tabs/` | Chord charts: `.cho` (song format, rendered by `song.html`), `.html` (older hand-written tabs), `.txt`/`.tab` (chord-over-lyric source). |
| `media/` | Local karaoke video files. |
| `tools/` | Python converters (see below). Not served — dev-time only. |
| `scripts/` | Browser JS: `song.js` (`.cho` renderer, repeats, key picker), `fitscreen.js`, `wakelock.js`, `enableToggleChords.js`. |
| `*.css` | Pure.css + Font Awesome, vendored. `style.css` is ours. |

## Adding a song

1. Write `tabs/SongTitle.cho` (format below). Filenames are PascalCase, no spaces.
2. Add a row to the `<tbody>` in `index.html`:

```html
<tr>
    <td>Song Title</td>
    <td>Show or Artist</td>
    <td><a href="https://youtu.be/...">YouTube</a></td>
    <td><a href="./tabs/song.html?s=SongTitle">Local</a>
    </td>
</tr>
```

The 4th column links `song.html?s=Name` for a `.cho`, or a `.html`, `.txt`, `.pdf`,
or a file in `media/` — whatever exists. Use `&mdash;` for a cell with nothing
to link rather than inventing a URL.

**Never fabricate a YouTube link.** Leave it as `&mdash;` and say so; the owner
fills it in. Several existing links are unverified.

## Song format (`tabs/*.cho`)

`tabs/song.html?s=Name` fetches `tabs/Name.cho` and `scripts/song.js` renders it
into the same DOM the older hand-written tabs use (`.column` divs, `.section`
spans, inline `.chord` spans, `pre.chord`, `details[data-repeat]`). The seven
newest songs are in this format; `tabs/BetterIsOneDay.cho` shows everything.

```
{title: Better Is One Day}
{artist: Matt Redman}
{key: E}
{credits: Redman · 1995 Thankyou Music · CCLI #1097451}

| E    | E    | A    | B    |

[Verse 1]
How [E]lovely is Your dwelling place
[A]O Lord al[B]mighty

[Chorus]
[E/G#]Better is [A]one day in Your courts
-->  | E    | A    | B    |

> Chorus
> Turnaround = Intro
---
# comment
```

Line rules, checked in this order:

| Line | Meaning |
|---|---|
| `{name: value}` | `title`, `artist` (heading is `Title - Artist`), `key` (enables the key picker), `credits` (small footer line) |
| `# …` | comment, not rendered |
| `[Name]` alone on a line | section header; starts a column with `id` = slug (`Chorus 3` → `chorus3`) |
| `> Name` / `> Label = Name` | collapsed repeat of section `Name`, labelled `Label`; its own column |
| `---` | column break with no header |
| only chords plus `\|`, `x3`, `...`, `-->` | chord-only line → `pre.chord`; consecutive lines share one `<pre>`, a blank between two splits them |
| blank | an empty line; dropped right after a section header and at the end of a column |
| anything else | lyric line, `[chords]` inline; runs of 2+ spaces are kept with `&nbsp;` |

Chords are `[A-G][#b]?` + any of `m maj min dim aug sus add + digits` + optional
`/bass`, optionally in parens. The grammar is strict so `Amen`, `Be`, `Go` on a
line of their own stay lyrics.

**Key picker.** With `{key: G}` the header gets a `<select>` of the 12 keys in that
mode. Picking one transposes every chord, chord line and repeat; flat keys (F, Bb,
Eb, Ab, Db, Gb and their relative minors) spell flats, others sharps. At the
written key chords render exactly as typed. The choice is remembered per song in
`localStorage` like the full-screen zoom. Write the file in the key you actually
play; the picker is for the day someone else sings it.

Do not pass `?key=` in links; there is no such parameter. Add one to `song.js`
if a pinned-key link is ever needed.

## Full screen mode

`scripts/fitscreen.js` adds a "Full screen" link to a tab's header. It hides the
page chrome and searches font size against one, two and three columns for the
largest readable size where the whole song fits with no overflow, then remembers
your `+`/`-` nudges per song as a step offset from that fit (never an absolute
px size, so the same offset holds in portrait, landscape and on a laptop).

`tabs/song.html` and the newest static tabs have it. Any other tab gets it with one line:

```html
<script src="../scripts/fitscreen.js"></script>
```

It needs `<div id="song">` and finds the header menu itself. The `<meta
name="apple-mobile-web-app-capable">` tags exist so Add to Home Screen on iOS
launches chrome-free — iPadOS Safari won't fullscreen a non-video element, so
that's the only way to actually lose the address bar there.

## tools/

All three print usage when run with no args and self-check: they assert every
chord in the source survives into the output in the same order, and fail the run
if one goes missing.

```
python3 tools/html2cho.py  <in.html> <out.cho>
python3 tools/tab2html.py  <in.txt> <out.html> <title> <heading>
python3 tools/transpose.py <in.txt> <out.txt> <semitones>
node    tools/song_check.js
```

`html2cho.py` converts a hand-written tab to the `.cho` format: a `.column` with
no header becomes `---`, an HTML comment becomes `#` lines, `&nbsp;` becomes a
space. It does not know the key — add `{key: …}` by hand. For a chord-over-lyric
`.txt` source, run `tab2html.py` then `html2cho.py` on its output.

`song_check.js` is the self-check for `scripts/song.js` (parsing and transposing);
run it after touching that file.

`transpose.py` rewrites chord names in a `.txt` in place, keeping each at its
original column. It **always spells with sharps** — fine for A/D/E, wrong for flat
keys (you'll get `A#` where you want `Bb`). The in-browser picker in `song.js`
gets this right; prefer it.

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

This applies to the 20 older static `.html` tabs (everything not yet a `.cho`).
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
