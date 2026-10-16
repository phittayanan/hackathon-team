// Agent OS local server: serves public/ and the same routes the Vercel functions in api/ serve.
//   GET  /api/health                            -> { brain, tts, offline: null | 'limit' }
//   GET  /api/agent/session                     -> { live, signedUrl } to join the ElevenLabs agent (if configured and under the daily limit)
//   POST /api/route           { text, context } -> offline brain: keyword router (used when the live agent is not)
//   POST /api/tts             { text }          -> audio/mpeg from ElevenLabs (if ELEVENLABS_API_KEY)
//   POST /api/videos          { query }         -> { videos: [{ id, title, channel, published }] } from YouTube (if YOUTUBE_API_KEY)
//   POST /api/image           { prompt, scene } -> { url } or { error }: a picture for a generated page
//   GET  /api/image/<key>.png                   -> a cached picture (local only)
//   POST /api/page            { spec, design, style } -> text/plain stream of the page writer agent's HTML (ElevenLabs)
//   POST /api/log             { events }        -> appends browser events to the run log (web/logs/*.jsonl)
// The always-on agent loop runs in the page (public/js/agent-link.js), not here.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './lib/env.js';
import { createHandlers, HttpError, errorBody } from './lib/handlers.js';
import { streamText } from './lib/vercel.js';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv(join(here, '..', '.env'));

const PUBLIC = join(here, 'public');
const PORT = Number(process.env.PORT || 5173);
const app = createHandlers({ logDir: join(here, 'logs'), imagesDir: join(here, '.cache', 'images') });
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp',
};

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 60_000) throw new HttpError(413, 'body too large');
  }
  return body ? JSON.parse(body) : {};
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Locally the visitor is the socket address; on Vercel it is x-forwarded-for.
  const h = { 'x-real-ip': req.socket.remoteAddress, ...req.headers };
  try {
    if (url.pathname === '/api/health') return send(res, 200, await app.health());
    if (url.pathname === '/api/agent/session') return send(res, 200, await app.session(h));
    if (url.pathname === '/api/route' && req.method === 'POST') return send(res, 200, await app.route(await readJson(req)));
    if (url.pathname === '/api/tts' && req.method === 'POST') return send(res, 200, await app.tts(h, await readJson(req)), 'audio/mpeg');
    if (url.pathname === '/api/catalog' && req.method === 'POST') return send(res, 200, await app.catalog(h, await readJson(req)));
    if (url.pathname === '/api/videos' && req.method === 'POST') return send(res, 200, await app.videos(h, await readJson(req)));
    if (url.pathname === '/api/image' && req.method === 'POST') return send(res, 200, await app.image(h, await readJson(req)));
    if (url.pathname === '/api/page' && req.method === 'POST') {
      const body = await readJson(req);
      const left = new AbortController();
      res.on('close', () => left.abort());
      return await streamText(res, await app.page(h, body, { signal: left.signal }));
    }
    if (url.pathname === '/api/log' && req.method === 'POST') return send(res, 200, await app.log(h, await readJson(req)));
    if (url.pathname.startsWith('/api/image/')) {
      const file = app.images.file(url.pathname.slice('/api/image/'.length));
      if (!file) return send(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=86400' });
      return res.end(await readFile(file));
    }
    const path = normalize(url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname));
    const file = join(PUBLIC, path);
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
    const body = await readFile(file);
    // Same as vercel.json: voice clips and pictures may be cached for an hour.
    const cache = /^\/(voice|img)\//.test(path) ? { 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' } : {};
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', ...cache });
    res.end(body);
  } catch (err) {
    if (res.headersSent) return res.end();
    if (err instanceof HttpError) return send(res, err.status, errorBody(err));
    if (err.code === 'ENOENT' || err.code === 'EISDIR') return send(res, 404, { error: 'not found' });
    console.error(`[server] ${req.method} ${url.pathname}: ${err.message}`);
    app.runLog.server('error', { where: url.pathname, message: err.message });
    send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, async () => {
  const health = await app.health();
  console.log(`run log: ${app.runLog.file}`);
  console.log(`Agent OS on http://localhost:${PORT}  brain=${health.brain} tts=${health.tts ? 'elevenlabs' : 'browser'} usage=${app.usage.store}`);
});
