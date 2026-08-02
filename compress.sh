#!/usr/bin/env bash
# Transcode a raw video into a web-optimized mp4 and drop it straight into videos/.
# Usage: ./compress.sh /path/to/source.mov [output-name]
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 /path/to/source.mov [output-name]" >&2
  exit 1
fi

SRC="$1"
BASENAME="$(basename "${2:-$SRC}")"
NAME="${BASENAME%.*}"
DIR="$(cd "$(dirname "$0")" && pwd)/videos"
OUT="$DIR/$NAME.mp4"

ffmpeg -y -i "$SRC" \
  -vf "scale='min(1920,iw)':-2" \
  -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  "$OUT"

python3 -c "
import json, os
d = '$DIR'
files = sorted(f for f in os.listdir(d) if f.lower().endswith(('.mp4', '.webm', '.mov', '.m4v', '.ogg')))
json.dump(files, open(os.path.join(d, 'manifest.json'), 'w'))
"

echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
