import { vercelFunction } from '../lib/vercel.js';

export default vercelFunction((app, { headers, body }) => app.search(headers, body), { method: 'POST' });
