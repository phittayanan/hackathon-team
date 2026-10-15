// Sanitizer for HTML pages written by the page model (lib/page-model.js). Pure string code, so the
// same module runs in the browser (before a page is shown) and in Node (lib/page-sanitize.js, tests).
// Allow-list only: known tags and attributes are rebuilt, everything else is dropped.
// - never: <script>, on* attributes, javascript: URLs, forms, iframes/objects, <link>/<meta>/<base>
// - pictures only from the app's /img/ folder, https, or data:image
// - CSS: no @import or @font-face; url() follows the picture rule
// The result goes into a shadow root (scenes/generated.js); scripts written by the model never run.
//
// sanitizePage(raw) -> { html, text, complete }
//   html: <style>...</style><div class="pg-body">...</div>   (:root/html/body in CSS -> the wrapper)
//   text: length of visible text; complete: the model finished the document (</html> seen)

// Elements dropped together with everything inside them.
const DROP_WITH_CONTENT = new Set(['script', 'iframe', 'object', 'embed', 'applet', 'frame', 'frameset', 'noscript', 'template', 'title', 'textarea', 'select', 'math', 'noembed', 'xmp', 'plaintext']);
const VOID = new Set(['br', 'hr', 'img', 'input', 'wbr', 'col']);
const HTML_TAGS = [
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside',
  'figure', 'figcaption', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup',
  'br', 'hr', 'wbr', 'blockquote', 'pre', 'code', 'time', 'abbr', 'q', 'cite', 'kbd', 'table', 'thead', 'tbody', 'tfoot', 'tr',
  'th', 'td', 'caption', 'col', 'colgroup', 'img', 'button', 'label', 'input', 'progress', 'meter', 'details', 'summary', 'output', 'a',
];
const SVG_TAGS = ['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'lineargradient', 'radialgradient', 'stop'];
const TAGS = new Set([...HTML_TAGS, ...SVG_TAGS]);
// SVG names are case sensitive in the output.
const SVG_CASE = { lineargradient: 'linearGradient', radialgradient: 'radialGradient', viewbox: 'viewBox', gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform', preserveaspectratio: 'preserveAspectRatio' };

const ATTRS = new Set([
  'class', 'id', 'style', 'title', 'lang', 'dir', 'role', 'tabindex', 'alt', 'src', 'width', 'height', 'colspan', 'rowspan',
  'type', 'value', 'placeholder', 'checked', 'disabled', 'min', 'max', 'step', 'low', 'high', 'optimum', 'for', 'open', 'datetime',
  'data-action', 'data-value', 'data-toggle', 'data-on', 'data-count', 'data-step', 'data-count-step',
  // SVG presentation
  'viewbox', 'xmlns', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'preserveaspectratio', 'text-anchor', 'font-size', 'font-weight',
]);
const INPUT_TYPES = new Set(['checkbox', 'radio', 'range', 'text', 'number']);

const decode = (s) =>
  String(s)
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d) || 32))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// A picture address the page may load: the app's own /img/ files, https, or an inline data image.
export function safePictureUrl(raw) {
  const url = decode(raw).trim().replace(/[\u0000-\u001f\s]+/g, '');
  if (/^\/img\/[\w.-]+\.(svg|png|jpe?g|webp|gif)$/i.test(url)) return url;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(url)) return url;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

// CSS from a <style> block or a style attribute.
export function sanitizeCss(raw, { selectors = false } = {}) {
  let css = String(raw)
    .replace(/\/\*[\s\S]*?(\*\/|$)/g, '')
    .replace(/<\/?\w[^>]*>?/g, '')
    .replace(/[\\\u0001]/g, '') // no CSS escapes: they could hide "url" or "expression"
    .replace(/@(import|charset|namespace)[^;{}]*;?/gi, '')
    .replace(/@font-face\s*\{[^}]*\}?/gi, '')
    .replace(/(expression|behavior|-moz-binding|javascript:)/gi, 'x-');
  css = css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (_, q, u) => {
    const safe = /^#[\w-]+$/.test(u.trim()) ? u.trim() : safePictureUrl(u);
    return safe ? `\u0001("${safe.replace(/"/g, '%22')}")` : 'none';
  });
  // Any url( left over is malformed: drop it.
  css = css.replace(/url\(/gi, 'x-url(').replace(/image-set\(|src\(/gi, 'x-(').replace(/\u0001/g, 'url');
  // In a shadow root :root, html and body match nothing: point them at the page wrapper.
  if (selectors) css = css.replace(/(^|[}{,;\s>+~])(:root|html|body)(?=[\s,{.:#[>+~])/gi, '$1.pg-body');
  return css;
}

function cleanAttrs(tag, rawAttrs) {
  const out = [];
  const seen = new Set();
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(rawAttrs))) {
    const name = m[1].toLowerCase();
    if (seen.has(name) || !ATTRS.has(name) || name.startsWith('on')) continue;
    seen.add(name);
    let value = decode(m[2] ?? m[3] ?? m[4] ?? '');
    if (name === 'src') {
      if (tag !== 'img') continue;
      value = safePictureUrl(value);
      if (!value) continue;
    } else if (name === 'style') {
      value = sanitizeCss(value);
    } else if (name === 'type') {
      if (tag === 'button') value = 'button';
      else if (tag === 'input') value = INPUT_TYPES.has(value.toLowerCase()) ? value.toLowerCase() : 'text';
      else continue;
    } else if (/url\s*\(/i.test(value) && !/^url\(#[\w-]+\)$/.test(value.trim())) {
      continue; // SVG fill/stroke may point at a gradient on the page, nothing else
    } else if (/^(javascript|vbscript|data):/i.test(value.replace(/[\u0000- ]+/g, ''))) {
      continue;
    }
    out.push(`${SVG_CASE[name] || name}="${escAttr(value.slice(0, 2000))}"`);
  }
  if (tag === 'button' && !seen.has('type')) out.push('type="button"');
  return out.length ? ` ${out.join(' ')}` : '';
}

export function sanitizePage(raw) {
  const src = String(raw ?? '');
  const complete = /<\/html\s*>/i.test(src);
  // Anything after the end of the document (for example a closing ``` fence) is ignored.
  const end = src.search(/<\/html\s*>/i);
  const input = end >= 0 ? src.slice(0, end) : src;

  const styles = [];
  let body = '';
  let bodyAttrs = '';
  let text = 0;
  let i = 0;
  const token = /<!--[\s\S]*?(?:-->|$)|<![^>]*>?|<\?[^>]*>?|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
  while (i < input.length) {
    token.lastIndex = i;
    const m = token.exec(input);
    const at = m ? m.index : input.length;
    if (at > i) {
      const chunk = input.slice(i, at);
      // Text: a stray "<" that does not start a tag is shown as text.
      const shown = chunk.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      body += shown;
      text += decode(chunk).replace(/\s+/g, '').length;
    }
    if (!m) break;
    i = m.index + m[0].length;
    const name = m[1]?.toLowerCase();
    if (!name) continue; // comment, doctype, processing instruction
    const closing = m[0][1] === '/';
    if (name === 'style' || DROP_WITH_CONTENT.has(name)) {
      if (closing) continue;
      const close = new RegExp(`</${name}\\s*>`, 'i');
      const rest = input.slice(i);
      const c = rest.search(close);
      const content = c >= 0 ? rest.slice(0, c) : rest;
      i += c >= 0 ? c + rest.slice(c).match(close)[0].length : rest.length;
      if (name === 'style') styles.push(sanitizeCss(content, { selectors: true }));
      continue;
    }
    if (name === 'body' && !closing) {
      bodyAttrs = cleanAttrs('div', m[2] || '');
      continue;
    }
    if (!TAGS.has(name)) continue; // html, head, meta, link, base, form, unknown: tag dropped, text kept
    const tag = SVG_CASE[name] || name;
    if (closing) {
      if (!VOID.has(name)) body += `</${tag}>`;
      continue;
    }
    body += `<${tag}${cleanAttrs(name, m[2] || '')}>`;
  }

  // The body's own class and style move to the wrapper.
  const cls = /class="([^"]*)"/.exec(bodyAttrs)?.[1] || '';
  const style = /style="([^"]*)"/.exec(bodyAttrs)?.[1] || '';
  const wrapper = `<div class="pg-body${cls ? ` ${cls}` : ''}"${style ? ` style="${style}"` : ''}>`;
  return { html: `<style>${styles.join('\n')}</style>${wrapper}${body}</div>`, text, complete };
}

// The partial page while it is still being written: cut an unfinished tag at the end.
export function sanitizePartial(raw) {
  const src = String(raw ?? '');
  const lt = src.lastIndexOf('<');
  const cut = lt > src.lastIndexOf('>') ? src.slice(0, lt) : src;
  return sanitizePage(cut);
}

// A finished page worth showing: the model closed the document and wrote real text.
export const pageOk = (out) => Boolean(out?.complete && out.text >= 20 && out.html.length <= 300_000);
