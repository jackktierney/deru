# Deru

Autoplaying, shuffled, fullscreen-ish video gallery. Drop a video in, push, and it goes live.

## Adding videos with the Site Editor app

The easiest way to add videos and set their word + definition caption is the offline editor in `editor/`. It reads and writes your files directly; nothing is uploaded anywhere.

**Requires a Chromium-based browser** (Helium, Chrome, Edge, Brave — not Safari or Firefox, which don't support the folder-saving feature it relies on).

1. Start a local server from this folder (needed so the browser will grant folder access — just opening the file directly with `file://` won't work):
   ```
   python3 -m http.server 8643
   ```
2. In Helium/Chrome, go to `http://localhost:8643/editor/editor.html`.
3. Click **Open gallery folder…** and pick this folder (the one with `index.html` and `videos/` in it).
4. Drop a video onto the dropzone (or click it to choose a file) — it's written straight into `videos-raw/`. Type its word and definition in the card that appears, then click **Save**.
5. `git add`, `git commit`, `git push`. The GitHub Action compresses anything new in `videos-raw/`, moves it into `videos/`, and regenerates `videos/manifest.json` — the site then picks it up automatically.

Removing a video's card in the editor deletes the underlying file (raw or already-compressed) and updates `videos/manifest.json` right away.

## Local preview
```
python3 server.py
```
then visit `http://localhost:3000`.

## How it fits together
- `videos-raw/` — drop zone for freshly-added, uncompressed clips. Never committed videos live here for long; the Action deletes each one after compressing it.
- `videos/` — the compressed `.mp4` files the site actually plays, plus `manifest.json` (auto-generated file list) and `words.json` (word + definition per filename).
- `.github/workflows/compress-videos.yml` — runs on every push that touches `videos-raw/**`: compresses with ffmpeg, writes the result into `videos/`, regenerates `manifest.json`, commits and pushes.
