import { vercelFunction } from '../lib/vercel.js';

// A free HTML page for a generated scene, streamed as plain text (see lib/page-model.js).
export default vercelFunction((app, { headers, body, signal }) => app.page(headers, body, { signal }), { method: 'POST', stream: true });
