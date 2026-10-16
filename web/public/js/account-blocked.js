// ElevenLabs blocks a workspace mid-day with, for example:
// "[account_restricted] This workspace is restricted from the free tier. Upgrade your plan to start a new
// conversation." Treated exactly like out of credit: the account is marked and the next key is used.
// Matched on the text, whatever the HTTP status. One source for both sides: live-agent.js in the page,
// lib/tts.js (TTS and signed URL) and lib/page-model.js on the server.
export const ACCOUNT_BLOCKED = /account_restricted|restricted from the free tier|upgrade your plan/i;
