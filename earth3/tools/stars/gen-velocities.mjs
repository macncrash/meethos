// Generate src/data/starVel.bin — per-star 3D space velocities aligned to the EXISTING
// stars.bin order (so every catalogue index, name and constellation stays valid).
//
// Source: HYG v4.1 (astronexus/HYG-Database, CC BY-SA 4.0) — vx,vy,vz are the star's
// velocity in PARSECS/YEAR in the equatorial cartesian frame (+X vernal equinox,
// +Y RA 6h, +Z celestial north), derived from proper motion + radial velocity.
// We match each of our packed stars to its HYG row by sky direction + absolute
// magnitude + distance, rotate the velocity into the render frame (ecliptic Y-up,
// the same transform as eclipticDirFromRaDec), and store AU/YEAR as float32 ×3.
//
//   node tools/stars/gen-velocities.mjs <hyg.csv> <stars.bin> <out starVel.bin>
import fs from 'node:fs';

const [, , csvPath, binPath, outPath] = process.argv;
const OBL = (23.4392911 * Math.PI) / 180; // J2000 obliquity — must match frames.ts
const ce = Math.cos(OBL);
const se = Math.sin(OBL);
const AU_PER_PC = 206_264.806;

// ---- our packed stars: stride 6 f32 = dirX, dirY, dirZ (render frame), distPc, absmag, ci
const bin = new Float32Array(fs.readFileSync(binPath).buffer.slice());
const N = bin.length / 6;

// ---- HYG rows (mag ≤ 7 pre-filter keeps the candidate set small)
const eqToRender = (x, y, z) => [x, -y * se + z * ce, y * ce + z * se];
const rows = [];
const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
const header = lines[0].replaceAll('"', '').split(',');
const col = Object.fromEntries(header.map((h, i) => [h, i]));
for (let li = 1; li < lines.length; li++) {
  const f = lines[li].split(',');
  if (f.length < header.length) continue;
  const mag = Number(f[col.mag]);
  if (!(mag <= 7)) continue;
  const ra = Number(f[col.rarad]);
  const dec = Number(f[col.decrad]);
  const cd = Math.cos(dec);
  const dir = eqToRender(cd * Math.cos(ra), cd * Math.sin(ra), Math.sin(dec));
  const vel = eqToRender(Number(f[col.vx]), Number(f[col.vy]), Number(f[col.vz]));
  rows.push({ dir, vel, dist: Number(f[col.dist]), absmag: Number(f[col.absmag]), proper: f[col.proper]?.replaceAll('"', '') });
}
console.log(`candidates (mag ≤ 7): ${rows.length}`);

// ---- match each packed star to its HYG row: best direction dot, gated by absmag + dist
const vout = new Float32Array(N * 3);
let matched = 0;
let worstDot = 1;
for (let i = 0; i < N; i++) {
  const dx = bin[i * 6], dy = bin[i * 6 + 1], dz = bin[i * 6 + 2];
  const dist = bin[i * 6 + 3], am = bin[i * 6 + 4];
  let best = null, bestDot = Math.cos((0.05 * Math.PI) / 180); // 0.05° gate
  for (const r of rows) {
    const dot = dx * r.dir[0] + dy * r.dir[1] + dz * r.dir[2];
    if (dot > bestDot && Math.abs(r.absmag - am) < 0.25 && Math.abs(r.dist / dist - 1) < 0.06) {
      bestDot = dot; best = r;
    }
  }
  if (best) {
    matched++;
    if (bestDot < worstDot) worstDot = bestDot;
    vout[i * 3] = best.vel[0] * AU_PER_PC; // pc/yr → AU/yr
    vout[i * 3 + 1] = best.vel[1] * AU_PER_PC;
    vout[i * 3 + 2] = best.vel[2] * AU_PER_PC;
  } // unmatched stars keep zero velocity — they simply don't drift
}
fs.writeFileSync(outPath, Buffer.from(vout.buffer));
console.log(`matched ${matched}/${N} (${((matched / N) * 100).toFixed(1)}%), worst dir dot ${worstDot.toFixed(8)}`);

// sanity: the fastest movers should be the famous high-proper-motion stars
const speed = (i) => Math.hypot(vout[i * 3], vout[i * 3 + 1], vout[i * 3 + 2]);
const top = [...Array(N).keys()].sort((a, b) => speed(b) - speed(a)).slice(0, 5);
for (const i of top) console.log(`  fast: idx ${i} · ${speed(i).toFixed(1)} AU/yr · dist ${bin[i * 6 + 3].toFixed(2)} pc`);
