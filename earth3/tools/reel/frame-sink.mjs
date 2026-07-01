// Dev-only frame sink for the highlight-reel capture. The in-browser tour POSTs each
// captured frame here and we write it to disk as frame_NNNN.jpg. CORS-open so the
// localhost:5174 preview tab can reach it.  Run:  node frame-sink.mjs <outDir> <port>
import http from 'node:http';
import fs from 'node:fs';

const DIR = process.argv[2] || '/tmp/reel';
const PORT = Number(process.argv[3] || 8137);
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (req.method === 'POST' && req.url === '/frame') {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => {
        try {
          const { i, data } = JSON.parse(b);
          fs.writeFileSync(`${DIR}/frame_${String(i).padStart(4, '0')}.jpg`, Buffer.from(String(data).split(',')[1], 'base64'));
          res.end('ok');
        } catch (e) { res.statusCode = 500; res.end(String(e)); }
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/count') {
      return res.end(String(fs.readdirSync(DIR).filter((f) => f.endsWith('.jpg')).length));
    }
    res.statusCode = 404;
    res.end();
  })
  .listen(PORT, () => console.log(`frame-sink → ${DIR} on :${PORT}`));
