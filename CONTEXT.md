# Karaoke chord charts

A static site of chord charts and lyrics for a church band. Performers read
charts with chords; the congregation reads lyrics only. Autoscroll mode drives
every screen from one clock during a service.

## Language

### Charts

**Chart**:
One song as written in a `.cho` file: lyrics, chords, sections, and optionally timing.
_Avoid_: tab (reserved for the older hand-written `.html` files), sheet

**Section**:
A named part of a chart such as Verse 1, Chorus or Bridge, written as `[Name]`.

**Repeat**:
A reference in a chart to play a section again (`> Chorus`) rather than writing it out twice.

**Direction**:
A note to performers that is not sung, written as a lyric line entirely in parentheses, such as `(Acapella)`. Shown on stage, never in the house.
_Avoid_: cue, instruction, comment (a `#` comment is never rendered anywhere)

### Timing

**Beat**:
The unit of position inside a song. Everything in a timeline is placed in beats so a tempo change never moves a lyric.
_Avoid_: seconds, milliseconds (as a position)

**Tempo**:
Beats per minute at a point in the song. A chart can change tempo any number of times.

**Timeline**:
A chart's events in play order, each placed at a start beat with a duration, with repeats expanded.

**Event**:
One lyric line or one chord-only line in a timeline, with a start beat and a duration in beats.

**Hold**:
A point in a timeline where the clock stops and waits for the leader to resume. Used for a fermata, free time, a prayer.
_Avoid_: pause (that is the leader stopping the clock anywhere), fermata (a reason for a hold, not the thing itself)

**Tempo scale**:
The one live multiplier the leader applies to every authored tempo from the current point on. Tap tempo sets it.
_Avoid_: override, live tempo

**Sync-here**:
The leader re-anchoring the clock to the start of a tapped event: "we are here, now."
_Avoid_: jump, seek

### Displays

**Leader**:
The one device that owns the clock and publishes its state. Held by a performer on stage.
_Avoid_: master, controller, host

**Follower**:
Any display that computes its position from the leader's published state.
_Avoid_: client, slave

**Room**:
The one shared word a band enters on each device. It is both the channel the leader publishes on and the secret that keeps others out.
_Avoid_: session, channel, token, password

**Relay**:
The hosted service that passes the leader's state to followers and remembers the last state for late joiners. It knows nothing about songs.
_Avoid_: server, backend, sync server

**Stage view**:
The chart with chords, in one column, scrolling so the current event rests on the now line. What performers read.
_Avoid_: confidence monitor, performer view, autoscroll (the mode; stage view is what it renders)

**House view**:
Lyrics only, one slide at a time, no chords, no section names, no directions. What the congregation reads.
_Avoid_: lyrics screen, projector view, congregation view

**Slide**:
A group of lyric lines shown together in the house view: the lines between two blank lines (or section boundaries) in the chart.

**Now line**:
The fixed horizontal position in the stage view where the current event sits. Above it is history, below it is lookahead.
_Avoid_: cursor, playhead

**Fit-to-screen**:
The existing full-screen mode that sizes a whole chart onto one static screen in up to three columns. Autoscroll is a separate view, not a replacement.
