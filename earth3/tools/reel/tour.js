// Highlight-reel capture tour. Paste as the body of a browser console / preview eval
// against the dev app loaded at http://localhost:5174/?capture  (the ?capture flag makes
// the WebGL drawing buffer readable so we can grab frames off the canvas).
//
// It drives a deterministic 3-act camera tour with the manual pump — rAF is throttled in a
// backgrounded tab, so we step the world by hand — captures each rendered frame (downscaled
// JPEG) and POSTs it to the frame-sink (tools/reel/frame-sink.mjs) for on-disk assembly.
//
// Acts:  1) cosmic-web opener on Andromeda   2) Powers-of-Ten fly-to DIVE to the solar
//        system   3) the Orion constellation figure on the real sky.
// The dive goes web→home (looking toward the stars) so there is no dark "warp" gap; a
// pull-OUT from the solar system instead stares into empty sky until the web appears.
(async () => {
  const m = window.meethos, u = m.unified;
  const SINK = 'http://localhost:8137/frame';
  window.dispatchEvent(new Event('resize'));
  const src = m.renderer.domElement;
  const W = 960, H = Math.round((W * src.height) / src.width);
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const octx = off.getContext('2d');
  const frames = [];
  const step = (dt) => { m.simClock.tick(dt); u.update(m.simClock, dt); m.game.update(m.simClock); m.hud.tick(); };
  const grab = () => { m.renderer.render(m.scene, m.camera); octx.drawImage(src, 0, 0, W, H); frames.push(off.toDataURL('image/jpeg', 0.8)); };
  const beat = (n, dt) => { for (let i = 0; i < n; i++) { step(dt); grab(); } };
  const idx = u.searchIndex();
  const m31 = idx.find((e) => e.name.includes('Andromeda')).target;
  const earth = idx.find((e) => e.name === 'Earth').target;

  // Act 1 — cosmic web, Andromeda centred, slow drift
  u.exitObserver(); u.setMaxLabels(16);
  u.focusOn(m31); u.setLogDist(Math.log10(9e10)); u.setView(0.5, 0.12);
  for (let i = 0; i < 24; i++) step(0.02);
  for (let i = 0; i < 14; i++) { u.setView(u.yaw + 0.0028, u.pitch); step(0.02); grab(); }

  // Act 2 — Powers-of-Ten dive: cosmic web → solar system
  u.goToTarget(earth);
  let g = 0; while (u.flyingTo && g++ < 200) { step(0.04); grab(); }
  beat(8, 0.02);

  // Act 3 — Orion's real figure on the sky, slow pan
  u.showConstellation('Ori');
  for (let i = 0; i < 26; i++) { u.setView(u.yaw + 0.0045, u.pitch); step(0.03); grab(); }

  for (let i = 0; i < frames.length; i++) {
    await fetch(SINK, { method: 'POST', body: JSON.stringify({ i, data: frames[i] }) });
  }
  return { frames: frames.length, W, H };
})()
