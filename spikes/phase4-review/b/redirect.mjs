import { createServer } from 'node:http';
const seen = [];
const b = createServer((req, res) => { seen.push({ host: req.headers.host, auth: req.headers.authorization ?? null }); res.end('asset bytes'); });
await new Promise((r) => b.listen(0, '127.0.0.1', r));
const bPort = b.address().port;
const a = createServer((req, res) => {
  seen.push({ host: req.headers.host, auth: req.headers.authorization ?? null });
  const to = req.url === '/same' ? `http://127.0.0.1:${a.address().port}/final` : req.url === '/final' ? null : `http://localhost:${bPort}/asset`;
  if (!to) { res.end('same-origin final'); return; }
  res.writeHead(302, { location: to }); res.end();
});
await new Promise((r) => a.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${a.address().port}`;
for (const path of ['/cross', '/same']) {
  seen.length = 0;
  const r = await fetch(base + path, { headers: { authorization: 'Bearer SECRET-TOKEN' } });
  await r.text();
  console.log(path, JSON.stringify(seen));
}
// Redirect loop / count
seen.length = 0;
a.close(); b.close();
console.log('node', process.version);
