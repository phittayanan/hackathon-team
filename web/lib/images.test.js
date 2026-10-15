import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImageService, pickPicture, pictureUrl, PICTURES, DEFAULT_PICTURE } from './images.js';
import { createHandlers } from './handlers.js';

const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

test('every picture, and the default, is a committed PNG', () => {
  for (const name of [...PICTURES.map((p) => p.name), DEFAULT_PICTURE]) {
    assert.ok(existsSync(join(pub, pictureUrl(name))), `${name}.png is missing`);
  }
});

test('the prompt picks a picture by keyword, English or Thai, with a fixed fallback', () => {
  assert.equal(pickPicture('Fresh vegetables for a Sunday meal'), 'groceries');
  assert.equal(pickPicture('Runner at the Bangkok marathon start'), 'running');
  assert.equal(pickPicture('Airplane over the beach'), 'travel');
  assert.equal(pickPicture('วิ่งตอนเช้า'), 'running');
  assert.equal(pickPicture('a purple dragon'), DEFAULT_PICTURE);
  assert.equal(pickPicture('a purple dragon'), pickPicture('A purple   DRAGON '));
});

test('the service answers with a local picture and never calls the network', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('no network call allowed'); };
  try {
    const app = createHandlers({ env: { ELEVENLABS_API_KEY: 'k' }, imagesDir: null });
    assert.deepEqual(await app.image({}, { prompt: 'a gift bag', scene: 's' }), { url: '/pics/shopping.png' });
    assert.deepEqual(await createImageService().get(' '), { error: 'empty prompt' });
  } finally {
    globalThis.fetch = realFetch;
  }
});
