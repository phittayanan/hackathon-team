import { vercelFunction } from '../lib/vercel.js';

export default vercelFunction((app, { headers, body }) => app.catalog(headers, body), { method: 'POST' });
