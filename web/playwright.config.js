import { defineConfig } from '@playwright/test';

const NO_KEYS = {
  ELEVENLABS_API_KEY: '', ELEVENLABS_AGENT_ID: '', ELEVENLABS_VOICE_ID: '', ELEVENLABS_API_KEYS: '', TAVILY_API_KEY: '',
  UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_URL: '', KV_REST_API_TOKEN: '',
};

// The app must run with no API keys, so the test server gets empty keys.
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  workers: 1,
  // Port 5176: 5173/5174 are often in use by a running demo.
  use: { baseURL: 'http://localhost:5176', channel: 'chrome', headless: true, viewport: { width: 500, height: 900 } },
  webServer: [
    {
      command: 'node server.js',
      url: 'http://localhost:5176/api/health',
      reuseExistingServer: false,
      env: { PORT: '5176', ...NO_KEYS },
    },
    {
      // A live-configured site whose daily limit is already used up (limits 0): it must start offline.
      // The key is fake; with the limit at 0 no call reaches ElevenLabs.
      command: 'node server.js',
      url: 'http://localhost:5177/api/health',
      reuseExistingServer: false,
      env: { PORT: '5177', ...NO_KEYS, ELEVENLABS_API_KEY: 'fake', ELEVENLABS_AGENT_ID: 'fake', USAGE_SESSIONS_PER_DAY: '0', USAGE_CALLS_PER_DAY: '0' },
    },
  ],
});
