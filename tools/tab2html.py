"""chord-over-lyric text -> site tab HTML, chords inlined at the syllable they start on.

Charts hand-align their chord columns a character or three right of the word,
so a literal column mapping lands mid-syllable. Each chord snaps to the nearest
word start; two chords on one word put the second on a syllable break."""
import re, sys, html

CHORD = re.compile(r'^\(?[A-G][#b]?[^/\s()]*(?:/[A-G][#b]?)?\)?$')
PAGE = re.compile(r'^\s*Page \d+/\d+\s*$')      # PDF export artifact
SECTION = re.compile(r'^\s*\[(.+)\]\s*$')
PASS = re.compile(r'\|+|[xX]\d+')             # bar lines and repeat markers: `| E | E | x2`

def is_chord_line(l):
    t = l.split()
    return bool(t) and all(PASS.fullmatch(x) or CHORD.match(x) for x in t)

def is_blank(l):
    return not l.strip()

def span(c):
    return f'<span class="chord">[{html.escape(c)}]</span>'

GAP = re.compile(r' {2,}')

REVIEW = []

VOWELS = 'aeiouyAEIOUY'

def syllable_breaks(word, base):
    """Rough in-word syllable starts: a consonant that follows a vowel and still
    has a vowel after it. Good enough to keep a chord off the middle of a syllable."""
    out = []
    for i in range(1, len(word)):
        if (word[i] not in VOWELS and word[i].isalpha()
                and word[i-1] in VOWELS
                and any(c in VOWELS for c in word[i+1:])):
            out.append(base + i)
    return out


def merge(chord_line, lyric, lineno=0):
    """Insert each chord into the lyric, snapped to the syllable it starts on.

    Charts eyeball the chord columns, so a raw column lands mid-syllable
    ("me[D]rcy"). Snap to the nearest word start; on collision keep the later
    chord at its own column so genuine mid-word changes survive.
    """
    starts = [m.start() for m in re.finditer(r'\S+', lyric)]
    hits = [(m.start(), m.group()) for m in re.finditer(r'\S+', chord_line)]
    placed, prev = [], -1
    past = []
    for col, ch in hits:
        if col >= len(lyric):
            past.append(ch)
            continue
        snap = min(starts, key=lambda s: (abs(s - col), s)) if starts else col
        if snap <= prev:                       # word already used: go mid-word, on a syllable
            m = re.search(r'\S+', lyric[prev:])
            word = m.group() if m else ''
            cands = [b for b in syllable_breaks(word, prev + (m.start() if m else 0)) if b > prev]
            snap = min(cands, key=lambda b: abs(b - col)) if cands else max(col, prev + 1)
            REVIEW.append((lineno, ch, f'mid-word syllable @{snap}', lyric.strip()))
        elif snap != col:
            REVIEW.append((lineno, ch, f'snapped {col}->{snap}', lyric.strip()))
        placed.append((snap, ch))
        prev = snap
    out = html.escape(lyric)
    offs, j = [], 0
    for c in lyric:
        offs.append(j)
        j += len(html.escape(c))
    offs.append(j)
    for col, ch in sorted(placed, reverse=True):
        p = offs[min(col, len(lyric))]
        out = out[:p] + span(ch) + out[p:]
    for ch in past:
        out += ' &nbsp; ' + span(ch)
    return GAP.sub('&nbsp;&nbsp;', out.strip())

def convert(lines):
    out, i = [], 0
    while i < len(lines):
        l = lines[i]
        if m := SECTION.match(l):
            out.append(('section', m.group(1)))
            i += 1
        elif is_chord_line(l):
            nxt = lines[i+1] if i+1 < len(lines) else ''
            if nxt and not is_blank(nxt) and not is_chord_line(nxt) and not SECTION.match(nxt):
                out.append(('line', merge(l, nxt, i)))
                i += 2
            else:
                block = []
                while i < len(lines) and is_chord_line(lines[i]):
                    block.append(lines[i].rstrip())
                    i += 1
                out.append(('pre', '\n'.join(block)))
        elif is_blank(l):
            out.append(('break', ''))
            i += 1
        else:
            out.append(('line', html.escape(l).strip()))
            i += 1
    return out

def render(items, title, heading):
    body, cur = [], []
    def flush():
        if cur:
            body.append('                <div class="column">\n' + '\n'.join(cur) + '\n                </div>')
            cur.clear()
    prev = None
    for kind, val in items:
        if kind == 'section':
            flush()
            cur.append(f'                    <span class="section">{html.escape(val)}</span>')
        elif kind == 'pre':
            cur.append(f'                    <pre class="chord">{val}</pre>')
        elif kind == 'line':
            if prev == 'line':
                cur.append('                    <br>')
            cur.append(f'                    {val}')
        # a blank line between two lyrics still needs its <br>: columns are split by
        # section headers, not by blanks, so don't let one swallow the break
        if kind != 'break':
            prev = kind
    flush()
    return TEMPLATE.format(title=html.escape(title), heading=html.escape(heading),
                           body='\n'.join(body))

TEMPLATE = '''<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="../pure.css">
    <link rel="stylesheet" href="../grids-responsive.css">
    <link rel="stylesheet" href="../font-awesome.css">
    <link rel="stylesheet" href="../style.css">
    <style>
        .container {{
            column-count: 2;
        }}

        .column {{
            break-inside: avoid-column;
            margin-bottom: 1em;
        }}

        .section {{
            font-weight: bold;
            font-style: italic;
            display: block;
        }}
    </style>
</head>

<body>
    <div class="header">
        <div class="home-menu pure-menu pure-menu-horizontal pure-menu-fixed">
            <a class="pure-menu-heading" href="">{heading}</a>
            <ul class="pure-menu-list">
                <li class="pure-menu-item pure-menu-selected"><a href="../index.html" class="pure-menu-link">Home</a>
                </li>
            </ul>
        </div>
    </div>
    <div class="content-wrapper">
        <div class="content">
            <div id="song" class="container">
{body}
            </div>
        </div>
    </div>
    <script src="../scripts/wakelock.js"></script>
</body>

</html>
'''

if len(sys.argv) != 5:
    sys.exit('usage: tab2html.py <in.txt> <out.html> <title> <heading>\n'
             '  e.g. tab2html.py tabs/Song.txt tabs/Song.html "Song" "Song - Artist"')

src, dst, title, heading = sys.argv[1:5]
lines = [l for l in open(src, encoding='utf-8').read().split('\n')
         if not PAGE.match(l)]
items = convert(lines)
open(dst, 'w', encoding='utf-8').write(render(items, title, heading))

# self-check: every chord in the source survives into the output, in the same order
want = [t for l in lines if is_chord_line(l) for t in l.split()]
out_txt = open(dst, encoding='utf-8').read()
# order matters: rebuild output chord order by scanning the document once
seq = []
for m in re.finditer(r'<pre class="chord">(.*?)</pre>|<span class="chord">\[(.+?)\]</span>', out_txt, re.S):
    if m.group(1) is not None:
        seq += m.group(1).split()
    else:
        seq.append(m.group(2))
assert seq == want, f'chord mismatch\n  want {len(want)}: {want[:12]}\n  got  {len(seq)}: {seq[:12]}'
print(f'ok: {len(want)} chords placed, order preserved')
print(f'--- {len(REVIEW)} chords adjusted, review these ---')
for ln, ch, why, lyric in REVIEW:
    print(f'  L{ln:<4} {ch:<6} {why:<24} {lyric[:52]}')
