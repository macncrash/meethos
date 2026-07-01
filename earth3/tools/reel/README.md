# Highlight-reel capture

A tiny pipeline that records a scripted camera tour of the app into a shareable **GIF + MP4**
— a "what changed" clip. Deterministic (steps the world by hand, so it works even though the
preview tab throttles `requestAnimationFrame`) and needs no headless browser.

## How it works

1. **`?capture`** — the app creates its `WebGLRenderer` with `preserveDrawingBuffer: true` only
   when the URL has `?capture`, so a script can read finished frames off the canvas.
2. **`frame-sink.mjs`** — a dev-only HTTP server; the tour POSTs each JPEG frame and it writes
   `frame_NNNN.jpg` to a directory (CORS-open for the localhost preview).
3. **`tour.js`** — pasted into the page console (or an eval). It drives the tour off
   `window.meethos`, grabs each rendered frame, and uploads them to the sink.
4. **`assemble.sh`** — `ffmpeg` turns the frames into a palette-optimized GIF and an MP4.

## Run it

```bash
# 1. dev server
bun run dev                                   # http://localhost:5174

# 2. frame sink (writes to ./reel_out)
node tools/reel/frame-sink.mjs "$PWD/reel_out" 8137

# 3. open the app at  http://localhost:5174/?capture , then paste tools/reel/tour.js
#    into the DevTools console. It reports { frames } when the upload finishes.

# 4. build the clip
bash tools/reel/assemble.sh "$PWD/reel_out" 18 "$PWD/reel_out/highlight"
#    -> reel_out/highlight.gif  +  reel_out/highlight.mp4
```

## Tuning

- Edit the acts / pacing in `tour.js` (frame counts and `step(dt)` sizes).
- The **dive direction** matters: fly web→home (looking toward the stars) to avoid a dark
  "warp" gap; a pull-OUT from the solar system stares into empty sky until the web appears.
- GIF size scales with width/frames — drop `scale=720` or the fps in `assemble.sh` to shrink.
