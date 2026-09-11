#!/usr/bin/env bash
set -euo pipefail

# ffmpeg's `scene` score is 0.0-1.0, never above 1. Slide changes here land
# around 0.11-0.17; the animated background's own motion peaks near 0.09.
ffmpeg -i input.mp4 \
  -vf "crop=849:660:364:20,select='eq(n\,0)+gt(scene,0.1)'" \
  -fps_mode vfr chord_%03d.png
