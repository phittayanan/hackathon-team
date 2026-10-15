// Adapter from a shared handler to a Vercel Node.js function (req, res).
// Logs go to the function log (console), which shows in Vercel's logs.
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandlers, HttpError, errorBody } from './handlers.js';

let app = null;
export const handlers = () => (app ??= createHandlers({ imagesDir: join(tmpdir(), 'agentos-images'), inlineImages: true }));

async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 60_000) throw new HttpError(413, 'body too large');
  }
  return text ? JSON.parse(text) : {};
}

// Writes an async iterator of text as a plain-text stream. Plain text with nosniff: the page model's
// raw HTML is never rendered at this origin; the browser sanitizes it into a shadow root.
export async function streamText(res, pieces) {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  for await (const piece of pieces) res.write(piece);
  res.end();
}

// fn(app, { headers, body, signal }) -> JSON-able object, or { buffer, type } for binary.
// With stream: true, fn returns an async iterator of text, sent as it comes (streamText).
export function vercelFunction(fn, { method = null, stream = false } = {}) {
  return async (req, res) => {
    try {
      if (method && req.method !== method) throw new HttpError(405, 'method not allowed');
      const left = new AbortController();
      res.on?.('close', () => left.abort());
      const out = await fn(handlers(), { headers: req.headers, body: method === 'POST' ? await body(req) : {}, signal: left.signal });
      if (stream) return await streamText(res, out);
      res.setHeader('cache-control', 'no-store');
      if (Buffer.isBuffer(out)) {
        res.setHeader('content-type', 'audio/mpeg');
        res.statusCode = 200;
        return res.end(out);
      }
      res.setHeader('content-type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify(out));
    } catch (err) {
      if (res.headersSent) return res.end();
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) {
        console.error(`[api] ${req.url}: ${err.message}`);
        handlers().runLog.server('error', { where: req.url, message: err.message });
      }
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(status === 500 ? { error: 'server error' } : errorBody(err)));
    }
  };
}
