// Signed URL for the browser to join the private ElevenLabs agent. The key stays on the server.
// GET /v1/convai/conversation/get-signed-url?agent_id=... -> { signed_url } (valid 15 minutes to start).
import { creditError } from './tts.js';

export async function signedUrl(env = process.env, fetchImpl = fetch) {
  const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID)}`;
  const res = await fetchImpl(url, { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw creditError(res.status, await res.text().catch(() => ''), 'signed url');
  const body = await res.json();
  if (!body.signed_url) throw new Error('no signed_url in response');
  return body.signed_url;
}

// Today's date in Bangkok, for the agent's {{today}} dynamic variable, so "next month" or
// "tomorrow" resolve right. Example: "Friday 16 October 2026 (2026-10-16)".
export function today(now = new Date()) {
  const part = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', ...opts }).format(now);
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
  return `${part({ weekday: 'long' })} ${part({ day: 'numeric', month: 'long', year: 'numeric' })} (${iso})`;
}
