import re, sys

SHARPS = ['A','A#','B','C','C#','D','D#','E','F','F#','G','G#']
IDX = {n:i for i,n in enumerate(SHARPS)}
IDX.update({'Bb':1,'Db':4,'Eb':6,'Gb':9,'Ab':11,'Cb':11,'Fb':4,'E#':7,'B#':3})

CHORD = re.compile(r'^([A-G][#b]?)([^/\s]*)(?:/([A-G][#b]?))?$')

def shift(note, steps):
    return SHARPS[(IDX[note] + steps) % 12]

def transpose_chord(tok, steps):
    m = CHORD.match(tok)
    if not m:
        return None
    root, qual, bass = m.groups()
    out = shift(root, steps) + qual
    if bass:
        out += '/' + shift(bass, steps)
    return out

def is_chord_line(line):
    toks = line.split()
    return bool(toks) and all(transpose_chord(t, 0) for t in toks)

def transpose_line(line, steps):
    # keep each chord at its original column; nudge right only to avoid collision
    out = ''
    for m in re.finditer(r'\S+', line):
        new = transpose_chord(m.group(), steps)
        col = max(m.start(), len(out) + 1 if out else 0)
        out += ' ' * (col - len(out)) + new
    return out

if len(sys.argv) != 4:
    sys.exit('usage: transpose.py <in.txt> <out.txt> <semitones>\n'
             '  e.g. transpose.py song-G.txt song-A.txt 2   (G -> A, up a whole step)')

steps = int(sys.argv[3])
lines = open(sys.argv[1], encoding='utf-8').read().split('\n')
res = []
for ln in lines:
    if re.fullmatch(r'\s*Page \d+/\d+\s*', ln):   # drop PDF page-break artifacts
        continue
    res.append(transpose_line(ln, steps) if is_chord_line(ln) else ln)
open(sys.argv[2], 'w', encoding='utf-8').write('\n'.join(res))

# self-check: chord count preserved, every chord moved by `steps`
src = [t for ln in lines if is_chord_line(ln) for t in ln.split()]
dst = [t for ln in res if is_chord_line(ln) for t in ln.split()]
assert len(src) == len(dst), f'lost chords: {len(src)} -> {len(dst)}'
for a, b in zip(src, dst):
    assert transpose_chord(a, steps) == b, f'{a} -> {b}'
print(f'ok: {len(src)} chords transposed +{steps} semitones')
