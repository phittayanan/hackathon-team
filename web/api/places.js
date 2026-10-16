import { vercelFunction } from '../lib/vercel.js';

export default vercelFunction((app, { headers, body }) => app.places(headers, body), { method: 'POST' });
