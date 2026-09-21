import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, body, type = 'application/json; charset=utf-8') { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); }
async function envValue(name) {
  if (process.env[name]) return process.env[name];
  try { const line = (await readFile(join(process.cwd(), '.env'), 'utf8')).split(/\r?\n/).find(row => row.startsWith(`${name}=`)); return line?.slice(name.length + 1).replace(/^['"]|['"]$/g, ''); } catch { return ''; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  if (path === '/config.js') {
    const url = await envValue('NEXT_PUBLIC_SUPABASE_URL');
    const key = await envValue('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    return send(res, 200, `window.DIDIDO_CONFIG=${JSON.stringify({ url, key })};`, 'text/javascript; charset=utf-8');
  }
  const requested = path === '/' ? '/index.html' : path;
  const file = normalize(join(publicDir, requested));
  if (!file.startsWith(publicDir)) return send(res, 403, 'Forbidden', 'text/plain');
  try { await access(file, constants.R_OK); send(res, 200, await readFile(file), mime[extname(file)] || 'application/octet-stream'); }
  catch { send(res, 404, 'Not found', 'text/plain'); }
}).listen(port, () => console.log(`Didido running at http://localhost:${port}`));
