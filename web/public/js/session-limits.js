// Limits for one live agent session, to save ElevenLabs credit. One source for both sides:
// agent/config.js sends them to ElevenLabs (agent-sync), live-agent.js enforces them in the page too.
export const MAX_SESSION_SECONDS = 180;
// Seconds since the user last spoke (or tapped) before the call ends.
export const IDLE_END_SECONDS = 20;
