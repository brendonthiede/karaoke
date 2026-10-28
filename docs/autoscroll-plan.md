# Autoscroll mode — plan

Status: design settled 2026-10-11 after a grilling session. Phases 1 and 2 done
2026-10-27: parser, `scripts/timeline.js`, `scripts/autoscroll.js`; Better Is One
Day is the one timed chart. Phase 3 built and tested locally against `wrangler
dev`; relay deployed 2026-10-28 to `wss://karaoke-relay.brendon-thiede.workers.dev`, untested on real devices. Directions (`(Acapella)`) take no time in the
timeline and are not repeated by `x3`. The key picker sits in the header, which
the stage view hides: pick the key before entering.
Vocabulary is in `CONTEXT.md`. The decisions log at the end is the record of
what was chosen and why; the body is the plan that follows from it.

## Goal

One **leader** device, held by a performer on stage, drives a song's position in
time. Every other screen follows it:

- **Stage view** (performers, their own iPads and phones): the chart with chords,
  in one column, scrolling continuously so the current line rests on a fixed
  **now line** with the next lines always visible below. Type is larger than
  fit-to-screen can give, because the whole song no longer has to fit at once.
- **House view** (congregation, the projector laptop): lyrics only, one slide at
  a time, no chords, no section names, no performer directions.

Tempo is authored per song and can change mid-song. The leader steers live:
tempo scale, pause, hold, and sync-here.

## Non-goals

- Audio playback or beat detection. The clock is a metronome the leader steers.
- Accounts, multiple bands, history. One room name shared by one band.
- A build step or runtime dependency in the pages. Plain JS in `scripts/`. The
  relay is the one piece of code that runs somewhere other than a browser.
- Replacing fit-to-screen. Autoscroll is a second view on the same page.
- Autoscroll for the older `.html` tabs. Convert to `.cho` first.

## Principles

1. **Broadcast state, not position.** The leader publishes "playing since relay
   time T at beat B with tempo scale S". Each display computes its own position
   every frame. A message every second or two is plenty; network jitter never
   makes the scroll stutter.
2. **The chart predicts; the leader is the truth.** Every correction is one tap
   or one pedal press, and all displays follow it immediately.
3. **Beats, not seconds.** A tempo change, authored or live, never moves a lyric.
4. **The leader never depends on the network.** Publishing is fire-and-forget. A
   follower that loses the relay keeps scrolling on its last state and resyncs
   when it is back. Followers prefetch the whole playlist when they join.
5. **`.cho` stays human-editable.** Timing uses the same `{name: value}` style.
   A chart without timing renders exactly as today.

## Hosting

The site is served from GitHub Pages at https://www.digestibledevops.com/karaoke/
and performers already open it there. `serve.py` is a dev server only. An HTTPS
page cannot talk to a plain-HTTP relay on the laptop (mixed content), so the
relay is hosted:

- **Cloudflare Worker with a Durable Object**, code in `relay/` in this repo,
  deployed with `wrangler` (dev-time tool, like the Python converters). Address
  is a `*.workers.dev` hostname held as a constant in `scripts/sync.js`, with a
  `localStorage` override for `wrangler dev`. The DNS zone is at Porkbun and not
  proxied, so a custom hostname is not available without moving the zone.
- GitHub Pages caches for ten minutes. A chart fixed on Sunday morning can take
  that long to reach the iPads.
- Fallback, documented but not built: an SSE relay in `serve.py` with the whole
  site served from the laptop over the LAN.

## Timing model

### Units

- **Beat** is the unit of position. `{time: 4/4}` gives beats per bar (default).
- A **timeline** is the chart's **events** in play order with repeats and `x3`
  groups expanded: each lyric line and each chord-only line gets a start beat and
  a duration. Section headers, blanks, directives and repeats take no time.
- A **tempo map** is a list of `(beat, bpm)` steps plus **holds**. Beat ↔ time
  conversion integrates the map; version one is piecewise constant.
- A live **tempo scale** multiplies every authored tempo from the anchor on.

### Directives

All optional. Autoscroll is offered only when the chart has `{tempo}`.

| Directive | Where | Meaning |
|---|---|---|
| `{tempo: 72}` | header, or own line in the body | bpm from the next event on |
| `{time: 4/4}` | header or body | beats per bar from the next event on |
| `{bars: 2}` | header or body | default bars per lyric line from here on (default 2) |
| `{hold}` | body, own line | the clock stops before the next event until the leader resumes |
| `{count: 1}` | header | count-in bars after play before the first event (default 1; `{count: 0}` for none) |
| `{lead: 1}` | header | house view flips to the next slide this many beats early (default 1) |
| `… {1}` | end of a lyric or chord line | this line lasts 1 bar; fractions allowed (`{0.5}` for a pickup) |
| `{tempo: 56 over 2}` | body | **later:** linear ramp over 2 bars |

Duration of a line with no `{n}` suffix:

- **Lyric line:** the current `{bars: n}` default.
- **Chord-only line where every `|` cell holds exactly one chord:** one bar per
  cell, times a trailing `x2`. So `| E | E | A | B |` is 4 bars.
- **Any other chord-only line** (`| C G/C F |`, `| Bb F Eb | Bb F Eb |`, no bar
  lines at all) needs a `{n}`. Without one the timeline uses the lyric default
  and `console.warn`s the line, so the author knows exactly what to annotate.
- **A standalone `x3` line** multiplies the group of lines since the last blank
  or section header. The stage view writes the group out three times.

A body `{tempo}`, `{time}` or `{bars}` currently parses as header meta and would
overwrite the header value; the parser must record body directives as positioned
blocks instead.

### Example

```
{title: Better Is One Day}
{key: E}
{tempo: 76}

| E    | E    | A    | B    |

[Verse 1]
How [E]lovely is Your dwelling place
[A]O Lord al[B]mighty

[Bridge 1]
{tempo: 68}
[C#m7]My heart and flesh cry [B]out
…

[Outro]
{tempo: 60}
| E    | E    | E    | E    |
{hold}
```

### Capturing timing by ear (polish phase)

A **record** mode in the stage view: the leader plays through once and taps at
each line start; the page emits `{n}` suffixes and `{tempo}` directives as text
to paste into the file. Stored as beats, so the result is the same format.

## Roles, pages and entry points

| Role | Page | Shows | Publishes |
|---|---|---|---|
| leader | `tabs/song.html?s=…&p=…&role=lead` | stage view + transport | state |
| stage follower | `tabs/song.html?role=stage` | stage view | nothing (unless it takes the lead) |
| house | `lyrics.html` | one slide | nothing |

- **Room.** One word, the shared secret, typed once per device into a field on
  `index.html` and kept in `localStorage`. Hashed into the Durable Object id;
  a wrong word lands in an empty room. Followers need it too.
- **Index links.** "Play (n)" stays as it is and never publishes. A **Lead (n)**
  link appears once a room is set, greyed until every ticked song has `{tempo}`.
  **Follow** and **House** take no song selection: the song comes from the leader.
- Followers ignore their own `?s=` once a leader is heard. The projector sits on
  `lyrics.html` for the whole service.
- **Take the lead.** Any stage device has a button. Last writer wins; a leader
  that sees a newer revision from another device demotes itself.
- **Per device, never synced:** key (transposition) and font size.

## Stage view

Built on the existing render in `song.js`; same DOM, same key picker.

- **One column, everything expanded.** `> Chorus` repeats and `x3` groups are
  written out in full so the scroll only ever moves forward. Each rendered line
  carries its event index (`data-event`).
- **Now line** one third of the way down. Scroll position is set every frame
  from the beat position, interpolated within the current event. Lines above the
  now line fade to about half opacity; section headers stay full weight so the
  bridge is visible coming. A faint rule marks the now line itself.
- **Indicator:** current line highlighted with a progress bar filling across its
  duration (a `transform`, not a layout change); a beat dot pulsing on every
  beat, larger on the downbeat, with "Verse 2 · bar 3/8"; the next section name
  shown during the last two bars of the current one.
- **Type size:** the song's longest line fills the width. `+`/`-` nudge, stored
  per song per device under a `scroll:` key, separate from `fitscreen:`.
- **Peek:** drag scrolls freely; the view snaps back to the clock 3 s after the
  finger lifts. Followers can peek too.
- **Full screen** reuses the `fitscreen` chrome, wake lock, and control cluster.
- **Opening a song** lands paused at beat 0. Play starts it after a count-in,
  one bar unless `{count: n}` says otherwise, shown as large beat numbers.

### Leader controls

| Control | Touch | Key / pedal | Effect |
|---|---|---|---|
| Play, resume | button | space, →, Page Down | start the clock, or leave a hold |
| Pause | button | space, ←, Page Up | stop the clock |
| Sync-here | tap a line | | re-anchor to the start of that line, now; flashes |
| Jump | tap a section header | | re-anchor to its first event and pause |
| Tap tempo | button × 4 | `t` × 4 | tempo scale = tapped ÷ authored at this point |
| Faster, slower | buttons | `]`, `[` | tempo scale ±2 % |
| Nudge | | `↑`, `↓` | move the anchor one line without changing tempo |
| Restart | | Home | beat 0, paused |
| Next, previous song | existing buttons | | publishes the song change |

While autoscroll is active the arrow keys stop meaning Prev/Next song; song
changes are on-screen only. A Bluetooth page-turner pedal (arriving ~November
2026) sends arrows or Page Up/Down and so drives play and pause.

## House view (`lyrics.html`)

- Dark background, white centred text. A **slide** is the lyric lines between
  two blank lines or section boundaries, exactly as the charts are written. To
  split a long group, add a blank line in the chart; the gap it leaves in the
  static chart is accepted. The view shrinks type to fit as a fallback and never
  splits on its own.
- **Hidden:** chords, chord-only lines, `x3` lines, section headers, and
  **directions** (a lyric line entirely in parentheses, e.g. `(Acapella)`).
- **Timing:** the slide containing the current event, flipped `{lead}` beats
  early. Chord-only stretch of two or more bars: blank. Shorter turnarounds keep
  the slide. Paused at beat 0: title slide. After the last event: black until
  the leader opens the next song.
- No controls, no key picker, no indicator. Add-to-Home-Screen friendly.

## Sync

### State

```json
{
  "rev": 17,
  "from": "a1b2",
  "song": "BetterIsOneDay",
  "playlist": ["AllHailThePower", "BetterIsOneDay", "Gratitude"],
  "state": "paused",
  "anchor": { "relayTime": 1760000000.123, "beat": 64 },
  "tempoScale": 1.0
}
```

`state` is `paused`, `playing` or `holding`. `from` is a per-device id so a
demoted leader can tell its own echoes from a takeover. Charts, tempo map and
events come from the `.cho`, which every device fetches itself.

Position on a device at local time `now`, with `offset` its estimate of
relay time minus local time:

```
beat = anchor.beat + beatsElapsed(tempoMap, anchor.beat, (now + offset − anchor.relayTime) × tempoScale)
```

frozen at the next hold while `state` is `holding`, and at `anchor.beat` while
`paused`.

### Relay

`relay/worker.js`: one Durable Object per room (id = hash of the room name), one
WebSocket per device. A message from a leader is stored as last state and
broadcast; a device that connects receives the last state at once. Every
message is stamped with the relay's clock; devices ping a few times at connect
and once a minute to estimate `offset`. No validation beyond the room, no
history. The last state is kept in the object's storage, not a field, because the
hibernation API evicts the object between messages; it is not handed out after
12 hours, so last week's song never opens on Sunday.

`rev` is the publish time in relay milliseconds. A device applies a state only if
its `rev` is newer than the last one it saw, which orders states from different
leaders and drops the second copy of one that arrives by both paths.

Devices on the same machine (dev, or a laptop driving both a stage window and
the projector) also hear each other over `BroadcastChannel("karaoke")`, which
costs nothing and removes the relay round trip there.

### Failure handling

- Follower loses the socket: keeps computing from the last state, shows a small
  "reconnecting" mark on the stage view only, reconnects with backoff.
- Leader reloads: re-publishes its last state from `sessionStorage` with a new
  revision.
- No relay reachable: the leader works alone; one console line says so.

## Code layout

| File | Role |
|---|---|
| `scripts/timeline.js` | Pure, no DOM: `timeline(model)` → events, tempo map, holds, slides, warnings; `beatAt(map, anchorBeat, seconds)`; `secondsAt(map, fromBeat, toBeat)`. Node-exported like `song.js`. |
| `scripts/song.js` | Body-positioned directives and `{n}` suffixes in `parse`; an expanded single-column render that tags lines with `data-event`. |
| `scripts/autoscroll.js` | Stage view: menu link, scroll loop, indicator, controls, type size, peek. Attaches like `fitscreen.js`. |
| `scripts/sync.js` | Device id, room, relay socket + BroadcastChannel, clock offset, `publish(state)` / `onState(cb)`, take-the-lead. |
| `lyrics.html`, `scripts/lyrics.js` | House view. Reuses `parse` and `timeline`; own renderer. |
| `relay/worker.js`, `relay/wrangler.toml` | The Worker and Durable Object. |
| `index.html` | Room field; Lead, Follow, House links. |
| `style.css` | `body.autoscroll` rules, indicator, now line. |
| `tools/song_check.js` | Timeline cases: durations sum, repeats and `x3` expand, body tempo steps, holds freeze, cell rule and its warning, slide grouping, direction detection, `{n}` not mistaken for a lyric. |
| `AGENTS.md` | Directives table, roles, how to run two windows locally against `wrangler dev`. |

## Phases

Each phase is usable on its own.

1. **Timeline in the format.** Directives, parser changes, `timeline.js`, tests,
   and `{tempo}` added to two or three charts. No UI.
2. **Stage view on one device.** Autoscroll link, scroll loop, indicator, all
   leader controls, pedal keys, type sizing, peek and snap-back. Useful solo.
3. **Relay and roles.** Worker, `sync.js`, room field, Lead and Follow links,
   take-the-lead, prefetch, reconnect. **First service milestone:** the band's
   iPads scrolling in sync.
4. **House view.** `lyrics.html`, slides, directions, title and blank slides,
   House link. Second service milestone.
5. **Polish.** Record mode, tempo ramps, house type fitting, `AGENTS.md` and
   README, LAN fallback relay in `serve.py` if ever needed.

## Risks

- **The band drifts from the clock.** Expected; sync-here, nudge and tap tempo
  are one tap each and the indicator shows drift early.
- **Internet in the room.** The relay needs it. Followers survive a drop on
  their last state and prefetched charts; a long outage means the band plays
  from un-synced but still scrolling charts.
- **iPadOS full screen.** Only Add to Home Screen hides the address bar. Known.
- **Scroll smoothness.** Set `scrollTop` and a `transform` per frame; change
  classes only on event boundaries.
- **Parser creep.** Every new form stays inside braces, which no lyric uses;
  negative cases go in `song_check.js`.
- **Public site.** The room word is the only gate. It is the Wi-Fi-password
  level of security this needs, no more.

## Decisions log

From the grilling session of 2026-10-10/11. Settled; reopen only with a new entry.

1. **Clock-driven**, not a tap-per-line clicker.
2. **Leader is a performer on stage with a guitar.** One tap or pedal press per control.
3. **Hardware:** projector laptop plus performers' own iPads and phones.
4. **Timing authored in bars and bpm;** record mode later emits the same directives.
5. **Default line length two bars.**
6. **Slide = blank-line-bounded group;** no section names in the house view.
7. **Direction = lyric line entirely in parentheses;** stage only.
8. **Autoscroll is a separate view beside fit-to-screen,** for larger type.
9. Vocabulary per `CONTEXT.md`.
10. **Site is on GitHub Pages;** `serve.py` is dev only; mixed content rules out a LAN relay behind the public page.
11. **Tap = sync-here, drag = peek, snap back after 3 s.**
12. **Followers:** own key and size, can peek, can take the lead; last writer wins.
13. **Stage view expands everything inline.**
14. **Songs open paused at beat 0;** `{count}` optional; title slide while paused at start.
15. **Long slides split by the author with a blank line;** shrink-to-fit fallback; never auto-split.
16. **House blanks on chord-only stretches of 2+ bars;** black after the end; `{lead: 1}` default.
17. **Now line one third down; longest line fills the width; above fades to half.**
18. **Version one tempo map: steps and holds;** ramps later.
19. **Relay is a Cloudflare Worker + Durable Object in `relay/`;** LAN relay is a fallback; vendor services rejected.
20. **Leader never depends on the relay;** followers prefetch the playlist.
21. **Room name is the shared secret,** stored per device.
22. **House view is `lyrics.html`;** index gains room field, Follow, House.
23. **First milestone: synced stage view;** house view second.
24. **One live tempo knob, a scale.** Tap tempo sets it.
25. **Pedal keys:** right/Page Down play, left/Page Up pause; song changes on-screen only.
26. **Relay is dumb:** last state + broadcast + clock stamp; room hashed to the object id.
27. **Relay address is a constant in `sync.js`** with a `localStorage` dev override; `*.workers.dev`.
28. **Autoscroll offered only when the chart has `{tempo}`.**
29. **Chord-only line = one bar per cell only when every cell has one chord;** otherwise `{n}` required, console warns.
30. **A blank line is also a slide break;** the gap in the static chart is accepted.
31. **Play stays; Lead (n) is a separate link,** greyed until room set and all songs timed.
32. **One-bar count-in by default** (2026-10-27, replaces the default in 14), numbers shown on screen; `{count: 0}` turns it off.
