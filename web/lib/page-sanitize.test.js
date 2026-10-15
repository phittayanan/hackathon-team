import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePage, sanitizePartial, sanitizeCss, safePictureUrl, pageOk } from './page-sanitize.js';

const doc = (body, head = '') => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

test('keeps allowed tags, classes and data-action; wraps the body', () => {
  const out = sanitizePage(doc('<section class="hero"><h1>สวัสดี</h1><button data-action="go" data-value="a">ไป</button></section>'));
  assert.equal(out.complete, true);
  assert.match(out.html, /<div class="pg-body"><section class="hero"><h1>สวัสดี<\/h1><button data-action="go" data-value="a" type="button">ไป<\/button><\/section><\/div>$/);
  assert.equal(pageOk(sanitizePage(doc('<p>ข้อความที่ยาวพอสำหรับหน้าเว็บนี้แน่นอน</p>'))), true);
});

test('removes scripts, on* attributes, javascript: URLs, forms, iframes, links and meta', () => {
  const raw = doc(
    '<script>alert(1)</script><p onclick="alert(2)" onmouseover=x>hi</p><a href="javascript:alert(3)">link</a>' +
      '<form action="https://evil.example"><input name="q" onfocus="x"><button type="submit">Go</button></form>' +
      '<iframe src="https://evil.example"></iframe><img src="javascript:alert(4)"><img src=x onerror=alert(5)>' +
      '<svg><script>alert(6)</script><a href="javascript:alert(7)"><text>t</text></a></svg><object data="x">o</object>',
    '<meta http-equiv="refresh" content="0;url=https://evil.example"><link rel="stylesheet" href="https://evil.example/a.css"><base href="https://evil.example/">',
  );
  const { html } = sanitizePage(raw);
  for (const bad of ['<script', 'alert', 'onclick', 'onmouseover', 'onerror', 'onfocus', 'javascript:', '<form', '<iframe', '<a ', 'href', '<meta', '<link', '<base', 'evil.example', '<object', 'submit']) {
    assert.ok(!html.includes(bad), `${bad} left in ${html}`);
  }
  assert.match(html, /<p>hi<\/p>/);
  assert.match(html, /<button type="button">Go<\/button>/);
});

test('tricky markup: entity-encoded URLs, unclosed script, stray brackets, comments', () => {
  assert.equal(safePictureUrl('jav&#x61;script:alert(1)'), '');
  assert.equal(safePictureUrl('/img/race.svg'), '/img/race.svg');
  assert.equal(safePictureUrl('/api/log'), '');
  assert.equal(safePictureUrl('http://example.com/a.png'), '');
  assert.equal(safePictureUrl('https://example.com/a.png'), 'https://example.com/a.png');
  const { html } = sanitizePage('<body><p>a < b > c</p><!-- <script>x</script> --><script>never ends <p>gone');
  assert.match(html, /<p>a &lt; b &gt; c<\/p>/);
  assert.ok(!html.includes('gone') && !html.includes('script'));
  assert.ok(!sanitizePage('<p title="x" onclick=alert(1) >y</p>').html.includes('onclick'));
});

test('CSS: no @import, no @font-face, url() only to app pictures or https; root selectors hit the wrapper', () => {
  const css = sanitizeCss('@import url(https://evil.example/x.css); @font-face{src:url(https://f.example/f.woff)} ' +
    ':root{--x:1} body{background:url(/img/mascot.svg)} .a{background:url("javascript:alert(1)")} .b{background:url(\'https://p.example/a.png\')} ' +
    '.c{width:expression(alert(1))} .d{background:\\75 rl(https://evil.example)}', { selectors: true });
  assert.ok(!css.includes('@import') && !css.includes('@font-face') && !css.includes('javascript') && !css.includes('expression('));
  assert.ok(!/url\("?https:\/\/evil/.test(css), css);
  assert.match(css, /\.pg-body\{--x:1\}/);
  assert.match(css, /\.pg-body\{background:url\("\/img\/mascot\.svg"\)\}/);
  assert.match(css, /url\("https:\/\/p\.example\/a\.png"\)/);
  const { html } = sanitizePage(doc('<p style="background:url(http://track.example/p.gif);color:red">x</p>', '<style>body{margin:0}</style>'));
  assert.match(html, /^<style>\.pg-body\{margin:0\}<\/style>/);
  assert.match(html, /style="background:none;color:red"/);
  assert.ok(!sanitizeCss('a{}</style><script>alert(1)</script>').includes('<'));
});

test('a page is ok only when finished and with real text; partial pages cut the unfinished tag', () => {
  assert.equal(pageOk(sanitizePage('<html><body><h1>Half a pa')), false);
  assert.equal(pageOk(sanitizePage(doc('<div></div>'))), false);
  const partial = sanitizePartial('<html><body><h1>หัวข้อ</h1><div cla');
  assert.equal(partial.complete, false);
  assert.ok(!partial.html.includes('&lt;div'));
  assert.ok(sanitizePage(doc('<p>x</p>') + '\n```').html.endsWith('<p>x</p></div>'));
});

test('body class and style move to the wrapper; svg keeps its case', () => {
  const { html } = sanitizePage(doc('<svg viewBox="0 0 10 10"><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient><circle cx="5" cy="5" r="4" fill="url(#g)"/></svg>').replace('<body>', '<body class="night" style="color:white" onload="x()">'));
  assert.match(html, /<div class="pg-body night" style="color:white">/);
  assert.match(html, /<svg viewBox="0 0 10 10"><linearGradient id="g">/);
  assert.ok(!html.includes('onload'));
});
