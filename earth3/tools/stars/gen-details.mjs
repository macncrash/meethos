// Generate the star DETAILS sidecars, aligned to the existing stars.bin order:
//   src/data/starExt.bin   — 9 × f32 per star: raHours, decDeg, pmra, pmdec (mas/yr),
//                            rv (km/s), lum (L☉, V-band), hip, hd, hr  (NaN = unknown)
//   src/data/starDesig.json — sparse { index: [spect, bayer, flam, gl, con, var] }
// Source: HYG v4.1 (astronexus/HYG-Database, CC BY-SA 4.0). Matching is the same
// direction+absmag+distance alignment as gen-velocities.mjs, so every index keeps
// its name, constellation and velocity.
//
//   node tools/stars/gen-details.mjs <hyg.csv> <stars.bin> <extOut> <desigOut>
import fs from 'node:fs';

const [, , csvPath, binPath, extOut, desigOut] = process.argv;
const OBL = (23.4392911 * Math.PI) / 180;
const ce = Math.cos(OBL);
const se = Math.sin(OBL);

const bin = new Float32Array(fs.readFileSync(binPath).buffer.slice());
const N = bin.length / 6;

const eqToRender = (x, y, z) => [x, -y * se + z * ce, y * ce + z * se];
const num = (s) => (s === '' || s === undefined ? NaN : Number(s));
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
  const strip = (s) => (s ?? '').replaceAll('"', '').trim();
  rows.push({
    dir,
    dist: Number(f[col.dist]),
    absmag: Number(f[col.absmag]),
    raH: Number(f[col.ra]),
    decDeg: Number(f[col.dec]),
    pmra: num(f[col.pmra]),
    pmdec: num(f[col.pmdec]),
    rv: num(strip(f[col.rv]) === '' ? '' : f[col.rv]),
    lum: num(f[col.lum]),
    hip: num(f[col.hip]),
    hd: num(f[col.hd]),
    hr: num(f[col.hr]),
    spect: strip(f[col.spect]),
    bayer: strip(f[col.bayer]),
    flam: strip(f[col.flam]),
    gl: strip(f[col.gl]),
    con: strip(f[col.con]),
    varr: strip(f[col.var]),
  });
}
console.log(`candidates (mag ≤ 7): ${rows.length}`);

const ext = new Float32Array(N * 9).fill(NaN);
const desig = {};
let matched = 0;
for (let i = 0; i < N; i++) {
  const dx = bin[i * 6], dy = bin[i * 6 + 1], dz = bin[i * 6 + 2];
  const dist = bin[i * 6 + 3], am = bin[i * 6 + 4];
  let best = null, bestDot = Math.cos((0.05 * Math.PI) / 180);
  for (const r of rows) {
    const dot = dx * r.dir[0] + dy * r.dir[1] + dz * r.dir[2];
    if (dot > bestDot && Math.abs(r.absmag - am) < 0.25 && Math.abs(r.dist / dist - 1) < 0.06) {
      bestDot = dot; best = r;
    }
  }
  if (!best) continue;
  matched++;
  const o = i * 9;
  ext[o] = best.raH; ext[o + 1] = best.decDeg;
  ext[o + 2] = best.pmra; ext[o + 3] = best.pmdec; ext[o + 4] = best.rv;
  ext[o + 5] = best.lum; ext[o + 6] = best.hip; ext[o + 7] = best.hd; ext[o + 8] = best.hr;
  if (best.spect || best.bayer || best.flam || best.gl || best.con || best.varr) {
    desig[i] = [best.spect, best.bayer, best.flam, best.gl, best.con, best.varr];
  }
}
fs.writeFileSync(extOut, Buffer.from(ext.buffer));
const dj = JSON.stringify(desig);
fs.writeFileSync(desigOut, dj);
console.log(`matched ${matched}/${N}; ext ${(ext.byteLength / 1024).toFixed(0)} KB; desig ${(dj.length / 1024).toFixed(0)} KB, ${Object.keys(desig).length} entries`);
