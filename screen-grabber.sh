#!/usr/bin/env bash
set -euo pipefail

# Grabs one PNG per slide from each karaoke video in tmp/, for building chord
# charts. tmp/Name.mp4 -> tmp/Name/chord_001.png, chord_002.png, ...
#
# Usage: ./screen-grabber.sh   (works from any directory)
#
# The crop (849x660 at 364,20) matches the slide area of these videos; change
# it for a source with a different layout. A video whose tmp/Name/ folder
# already exists is skipped; delete the folder to re-grab it.

cd "$(dirname "$0")/tmp"
shopt -s nullglob

# The drawboxes black out the Hide button (top left) and the next-line preview
# (bottom right): they change about as much as a chords-only intro slide, which
# scores ~0.007 against 0.11+ for lyric slides. With them gone noise is <0.002.
for video in *.mp4; do
  name="${video%.mp4}"
  [[ -d "$name" ]] && { echo "skip $video ($name/ exists)"; continue; }
  mkdir "$name"
  ffmpeg -nostdin -i "$video" \
    -vf "crop=849:660:364:20,drawbox=0:0:80:30:black:fill,drawbox=560:615:289:45:black:fill,select='eq(n\,0)+gt(scene,0.004)'" \
    -fps_mode vfr "$name/chord_%03d.png"
done
