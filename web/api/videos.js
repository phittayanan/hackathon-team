import { vercelFunction } from '../lib/vercel.js';

export default vercelFunction((app, { headers, body }) => app.videos(headers, body), { method: 'POST' });
