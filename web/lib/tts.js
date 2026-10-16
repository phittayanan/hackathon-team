// ElevenLabs text to speech. The key stays on the server.
import { ACCOUNT_BLOCKED } from '../public/js/account-blocked.js';
// Default voice: "Jessica" (premade, multilingual; speaks Thai with eleven_v4).
export const DEFAULT_VOICE = 'cgSgspJ2msm6clMCkdW9';
export const DEFAULT_MODEL = 'eleven_v4';

export const voiceSettings = (env = process.env) => ({
  voice: env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE,
  model: env.ELEVENLABS_MODEL || DEFAULT_MODEL,
});

export async function elevenTts(text, env = process.env, fetchImpl = fetch) {
  const { voice, model } = voiceSettings(env);
  const res = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY, accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, language_code: 'th' }),
  });
  if (!res.ok) throw creditError(res.status, await res.text().catch(() => ''), 'elevenlabs');
  return Buffer.from(await res.arrayBuffer());
}

// ElevenLabs answers 401 quota_exceeded (or 402/429 with a credit message) when the credit runs out.
// A blocked workspace (account_restricted) counts too, whatever the status.
export const isOutOfCredit = (status, text = '') =>
  ([401, 402, 429].includes(status) && /quota|credit|insufficient|exceeded/i.test(text)) || ACCOUNT_BLOCKED.test(text);

export function creditError(status, text, what) {
  const err = new Error(`${what} ${status}`);
  if (isOutOfCredit(status, text)) err.outOfCredit = true;
  return err;
}

export const ttsReady = (env = process.env) => Boolean(env.ELEVENLABS_API_KEY);
