const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

async function handleHealth(res) {
  const url   = process.env.TURSO_URL;
  const token = process.env.TURSO_AUTH_TOKEN;

  const missing = [!url && 'TURSO_URL', !token && 'TURSO_AUTH_TOKEN'].filter(Boolean);
  if (missing.length) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      code: 'ENV_MISSING',
      error: `환경변수 누락: ${missing.join(', ')}`,
      detail: { TURSO_URL: !!url, TURSO_AUTH_TOKEN: !!token },
    }));
    return;
  }

  try {
    const { createClient } = require('@libsql/client');
    const client = createClient({ url, authToken: token });
    await client.execute('SELECT 1');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      code: 'DB_CONNECTION_FAILED',
      error: err.message,
      detail: { url: url.replace(/\/\/.*?@/, '//***@') },
    }));
  }
}

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === '/api/health') {
    handleHealth(res);
    return;
  }

  const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\n  메모장 서버 실행 중`);
  console.log(`  http://localhost:${PORT}\n`);
});
