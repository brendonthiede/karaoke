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

# ffmpeg's `scene` score is 0.0-1.0, never above 1. Slide changes here land
# around 0.11-0.17; the animated background's own motion peaks near 0.09.
for video in *.mp4; do
  name="${video%.mp4}"
  [[ -d "$name" ]] && { echo "skip $video ($name/ exists)"; continue; }
  mkdir "$name"
  ffmpeg -nostdin -i "$video" \
    -vf "crop=849:660:364:20,select='eq(n\,0)+gt(scene,0.09)'" \
    -fps_mode vfr "$name/chord_%03d.png"
done
