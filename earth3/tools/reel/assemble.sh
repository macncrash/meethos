#!/usr/bin/env bash
# Assemble the captured frames into a shareable GIF + MP4.
#   ./assemble.sh <framesDir> <fps> <outBase>
set -euo pipefail
DIR="${1:-/tmp/reel}"
FPS="${2:-18}"
OUT="${3:-$DIR/highlight}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found"; exit 1; }
N=$(ls "$DIR"/frame_*.jpg 2>/dev/null | wc -l | tr -d ' ')
echo "frames: $N  fps: $FPS  -> $OUT.{gif,mp4}"
[ "$N" -gt 0 ] || { echo "no frames in $DIR"; exit 1; }

# High-quality GIF: per-clip palette (split -> palettegen -> paletteuse) in one pass
ffmpeg -y -loglevel error -framerate "$FPS" -start_number 0 -i "$DIR/frame_%04d.jpg" \
  -vf "fps=$FPS,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  "$OUT.gif"

# MP4 (smaller + crisper than the GIF, for platforms that accept video)
ffmpeg -y -loglevel error -framerate "$FPS" -start_number 0 -i "$DIR/frame_%04d.jpg" \
  -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$OUT.mp4"

ls -lh "$OUT.gif" "$OUT.mp4"
