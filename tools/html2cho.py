"""site tab HTML -> tabs/*.cho (the format scripts/song.js renders; see AGENTS.md).

Walks #song with a real parser: the tabs nest .column divs and hide whole sections
inside HTML comments, which regex can't follow."""
import re, sys
from html.parser import HTMLParser

VOID = {'br', 'meta', 'link', 'img', 'input'}
CHORD = re.compile(r'^\(?[A-G][#b]?(?:m|maj|min|dim|aug|sus|add|\d|\+)*(?:/[A-G][#b]?)?\)?$')
PASS = re.compile(r'^(\|+|[xX]\d+|\.{3}|-+>)$')

class Node:
    def __init__(self, tag, attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
    def cls(self):
        return self.attrs.get('class', '').split()
    def text(self):
        return ''.join(c if isinstance(c, str) else c.text() for c in self.children)
    def find(self, pred):
        for c in self.children:
            if isinstance(c, Node) and c.tag != '!--':
                if pred(c):
                    yield c
                yield from c.find(pred)

class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root')
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs)
        self.stack[-1].children.append(n)
        if tag not in VOID:
            self.stack.append(n)
    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break
    def handle_data(self, data):
        self.stack[-1].children.append(data)
    def handle_comment(self, data):
        n = Node('!--')
        n.children = parse(data).children
        self.stack[-1].children.append(n)

def parse(text):
    t = Tree()
    t.feed(text)
    return t.root

def is_chord_line(line):
    toks = line.split()
    return any(CHORD.match(t) for t in toks) and all(CHORD.match(t) or PASS.match(t) for t in toks)

def convert(root):
    song = next(root.find(lambda n: n.attrs.get('id') == 'song'))
    names = {c.attrs['id']: next(c.find(lambda n: 'section' in n.cls())).text().strip()
             for c in song.find(lambda n: 'column' in n.cls() and n.attrs.get('id'))}
    out, buf = [], []

    def flush():
        line = re.sub(r'\s+', ' ', ''.join(buf)).strip()
        out.append(line)
        buf.clear()

    def header(line):
        if ''.join(buf).strip():
            flush()
        buf.clear()
        if out and out[-1] != '':
            out.append('')
        out.append(line)

    def comment(c):
        cols = [n for n in c.children if isinstance(n, Node) and 'column' in n.cls()]
        if not cols:            # a commented-out <br> is just gone: the line runs on
            return
        if ''.join(buf).strip():
            flush()
        buf.clear()
        out.append('')
        for col in cols:
            out.extend('# ' + l if l else '#' for l in convert_column(col))

    def column(col, first):
        heads = [c for c in col.children if isinstance(c, Node)
                 and (c.tag == 'details' or 'section' in c.cls())]
        if not heads and not first:
            header('---')
        prev = None
        for c in col.children:
            if isinstance(c, str):
                buf.append(c)
                continue
            if c.tag == 'span' and 'section' in c.cls():
                header(f'[{c.text().strip()}]')
            elif c.tag == 'details':
                label = c.text().strip()
                target = names[c.attrs['data-repeat']]
                header(f'> {label}' if label == target else f'> {label} = {target}')
            elif c.tag == 'span' and 'chord' in c.cls():
                buf.append(c.text())
            elif c.tag == 'br':
                flush()
            elif c.tag == 'pre':
                if ''.join(buf).strip():
                    flush()
                buf.clear()
                if prev == 'pre':
                    out.append('')      # a blank keeps two <pre>s as two blocks
                out.extend(c.text().split('\n'))
            elif c.tag == 'div':
                if ''.join(buf).strip():
                    flush()
                buf.clear()
                column(c, False)
            elif c.tag == '!--':
                comment(c)
            else:
                buf.append(c.text())
            prev = c.tag
        if ''.join(buf).strip():
            flush()
        buf.clear()

    def convert_column(col):
        nonlocal out
        saved, out = out, []
        column(col, True)
        result, out = out, saved
        return result

    for i, c in enumerate(n for n in song.children if isinstance(n, Node)):
        if c.tag == '!--':
            comment(c)
        else:
            column(c, i == 0)

    title = next(root.find(lambda n: n.tag == 'title')).text().strip()
    heading = next(root.find(lambda n: 'pure-menu-heading' in n.cls())).text().strip()
    meta = [f'{{title: {title}}}']
    if heading.startswith(title) and heading[len(title):].lstrip().startswith('-'):
        meta.append(f'{{artist: {heading[len(title):].lstrip(" -")}}}')
    for small in root.find(lambda n: n.tag == 'small'):
        meta.append(f'{{credits: {re.sub(r"\s+", " ", small.text()).strip()}}}')
    return '\n'.join(meta + [''] + out).rstrip() + '\n'

def chords_in_html(root):
    seq = []
    song = next(root.find(lambda n: n.attrs.get('id') == 'song'))
    for n in song.find(lambda n: n.tag in ('pre', 'span') and 'chord' in n.cls()):
        if n.tag == 'pre':
            seq += [t for t in n.text().split() if CHORD.match(t)]
        else:
            seq.append(n.text().strip('[]'))
    return seq

def chords_in_cho(text):
    seq = []
    for line in text.split('\n'):
        if re.match(r'^(\{|#|\[[^\[\]]+\]$|>|---$)', line):
            continue
        if is_chord_line(line):
            seq += [t for t in line.split() if CHORD.match(t)]
        else:
            seq += re.findall(r'\[([^\]]+)\]', line)
    return seq

if len(sys.argv) != 3:
    sys.exit('usage: html2cho.py <in.html> <out.cho>')
root = parse(open(sys.argv[1], encoding='utf-8').read())
cho = convert(root)
open(sys.argv[2], 'w', encoding='utf-8').write(cho)
want, got = chords_in_html(root), chords_in_cho(cho)
assert want == got, f'chord mismatch\n  html {len(want)}: {want[:12]}\n  cho  {len(got)}: {got[:12]}'
print(f'ok: {len(want)} chords, order preserved -> {sys.argv[2]}')
