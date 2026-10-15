// Demo sunucusu: statik dosyalar + sahte LLM (/v1/chat/completions). `npm run demo:serve`
// ?harness=1 ile istenen fixture sayfasına demo arayüzü (dist/demo/harness.js) eklenir.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockChat } from './mock-llm.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8' };

export function startServer(port = Number(process.env.PORT || 8787)) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        let raw = '';
        for await (const c of req) raw += c;
        const out = mockChat(JSON.parse(raw));
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        return res.end(JSON.stringify(out));
      }
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' }); return res.end(); }
      let rel = url.pathname === '/' ? '/demo/index.html' : url.pathname;
      if (rel.startsWith('/fixtures/')) rel = '/demo' + rel;
      const file = path.join(root, rel);
      if (!file.startsWith(root) || file.includes('node_modules') || file.includes('/eval/corpus')) { res.writeHead(403); return res.end('forbidden'); }
      let body = await readFile(file);
      if (file.endsWith('.html') && url.searchParams.get('harness') === '1') {
        body = Buffer.from(body.toString('utf8').replace('</body>', '<script src="/dist/demo/harness.js"></script></body>'));
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' });
      res.end(String(e.message));
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer();
  console.log(`demo sunucusu: http://127.0.0.1:${s.address().port}/  (sahte LLM: /v1/chat/completions)`);
}
