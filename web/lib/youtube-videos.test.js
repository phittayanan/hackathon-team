import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchYouTubeVideos } from './youtube-videos.js';
import { createHandlers } from './handlers.js';

const env = { YOUTUBE_API_KEY: 'test-key' };
const item = (videoId, title = 'Rubik&#39;s Cube สำหรับมือใหม่', kind = 'youtube#video') =>
  ({ id: { kind, videoId }, snippet: { title, channelTitle: 'Cube &amp; Co', publishedAt: '2024-05-01T00:00:00Z', thumbnails: { default: { url: 'javascript:alert(1)' } } } });
const reply = (items, ok = true, status = 200) => async () => ({ ok, status, json: async () => ({ items }) });

test('search asks for embeddable, safe videos and returns only id, title, channel and date', async () => {
  let sent;
  const out = await searchYouTubeVideos({ query: '  เล่น  Rubik’s Cube ' }, env, async (url) => { sent = new URL(url); return reply([item('dQw4w9WgXcQ')])(); });
  assert.equal(sent.origin + sent.pathname, 'https://www.googleapis.com/youtube/v3/search');
  assert.equal(sent.searchParams.get('q'), 'เล่น Rubik’s Cube');
  assert.equal(sent.searchParams.get('type'), 'video');
  assert.equal(sent.searchParams.get('videoEmbeddable'), 'true');
  assert.equal(sent.searchParams.get('safeSearch'), 'strict');
  assert.equal(sent.searchParams.get('relevanceLanguage'), 'th');
  assert.deepEqual(out.videos, [{ id: 'dQw4w9WgXcQ', title: "Rubik's Cube สำหรับมือใหม่", channel: 'Cube & Co', published: '2024-05-01' }]);
});

test('channels, playlists and malformed ids are dropped', async () => {
  const out = await searchYouTubeVideos({ query: 'cube' }, env, reply([
    item('UCabcdefghij', 'channel', 'youtube#channel'), item('bad id"><x'), item('short'), item('abcdefghijk', ''), item('abcdefghijk'),
  ]));
  assert.deepEqual(out.videos.map((v) => v.id), ['abcdefghijk']);
});

test('bad input, no key and API errors never reach the network or leak the key', async () => {
  const fail = () => assert.fail('must not call');
  for (const query of [undefined, '', 'x', 'x'.repeat(161)]) await assert.rejects(searchYouTubeVideos({ query }, env, fail));
  await assert.rejects(searchYouTubeVideos({ query: 'cube' }, {}, fail), /YOUTUBE_API_KEY/);
  await assert.rejects(searchYouTubeVideos({ query: 'cube' }, env, reply([], false, 403)), (err) => /quota/.test(err.message) && !err.message.includes('test-key'));
});

test('the videos route: no key -> unavailable, an API error -> a short error and an empty list', async () => {
  assert.deepEqual(await createHandlers({ env: {} }).videos({}, { query: 'cube' }), { unavailable: true, videos: [] });
  const app = createHandlers({ env, fetchImpl: reply([], false, 500) });
  const out = await app.videos({}, { query: 'cube' });
  assert.equal(out.error, 'ค้นหาวิดีโอไม่สำเร็จ');
  assert.deepEqual(out.videos, []);
});
