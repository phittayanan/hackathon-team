import { test } from 'node:test';
import assert from 'node:assert/strict';
import { youtubeSearch, videoQueryFromRequest } from '../public/js/youtube-search.js';

test('YouTube search URLs encode Thai and punctuation on the fixed trusted host', () => {
  const result = youtubeSearch('Rubik’s Cube วิธีเล่น มือใหม่');
  const url = new URL(result.url);
  assert.equal(url.origin, 'https://www.youtube.com');
  assert.equal(url.pathname, '/results');
  assert.equal(url.searchParams.get('search_query'), result.query);
});

test('invalid and oversized video queries are rejected or bounded', () => {
  assert.equal(youtubeSearch(' '), null);
  assert.equal(youtubeSearch('x'), null);
  assert.equal(youtubeSearch('x'.repeat(180)).query.length, 160);
});

test('video request wording is stripped while its topic is preserved', () => {
  assert.deepEqual(videoQueryFromRequest('ช่วยหาวิดีโอสอนเล่น Rubik’s Cube ให้หน่อย'), {
    query: 'เล่น Rubik’s Cube',
    url: 'https://www.youtube.com/results?search_query=%E0%B9%80%E0%B8%A5%E0%B9%88%E0%B8%99+Rubik%E2%80%99s+Cube',
  });
  assert.equal(videoQueryFromRequest('ช่วยหาวิดีโอสอนเล่น rubric ให้หน่อย').query, "เล่น Rubik's Cube");
});
