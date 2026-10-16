import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// generated.js reads location when it loads (through its imports), so stub it first.
globalThis.location ??= { search: '', href: 'http://localhost/' };
globalThis.window ??= { addEventListener() {} };
const { loadSaved, removeSaved, savedIndex } = await import('../public/js/scenes/generated.js');

const STORE = 'agentos.savedScenes';
let data;
beforeEach(() => {
  data = new Map();
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
});

test('removeSaved removes one kept page and keeps the rest', () => {
  data.set(STORE, JSON.stringify({ todo: { kind: 'todo', name: 'To-do', match: ['todo'] }, packing: { kind: 'packing', name: 'Packing', match: ['pack'] } }));
  assert.equal(removeSaved('packing'), true);
  assert.deepEqual(Object.keys(loadSaved()), ['todo']);
  assert.deepEqual(savedIndex(), [{ kind: 'todo', match: ['todo'] }]);
  assert.equal(removeSaved('packing'), false);
});

test('removeSaved with nothing kept or broken storage returns false', () => {
  assert.equal(removeSaved('todo'), false);
  data.set(STORE, 'not json');
  assert.equal(removeSaved('todo'), false);
  data.set(STORE, 'null');
  assert.equal(removeSaved('todo'), false);
});
