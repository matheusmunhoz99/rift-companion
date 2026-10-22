const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'docs/site/style.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'docs/site/site.js'), 'utf8');

test('site: all local assets and navigation targets exist', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Duplicate HTML IDs');
  for (const [, reference] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    if (/^https?:/.test(reference)) continue;
    if (reference.startsWith('#')) {
      if (reference !== '#') assert.ok(ids.includes(reference.slice(1)), reference);
    } else {
      assert.ok(fs.existsSync(path.join(root, reference)), reference);
    }
  }
  for (const [, reference] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    assert.ok(fs.existsSync(path.join(root, 'docs/site', reference)), reference);
  }
});

test('site: published downloads use the official HTTPS origin', () => {
  const downloads = [...html.matchAll(/href="([^"]+\.(?:exe|apk))"/g)].map(match => match[1]);
  assert.ok(downloads.some(url => url.endsWith('.exe')));
  assert.ok(downloads.some(url => url.endsWith('.apk')));
  for (const address of downloads) {
    const url = new URL(address);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'rift-api.workscanner.com.br');
    assert.match(url.pathname, /^\/downloads\/RiftCompanion\.(exe|apk)$/);
  }
});

test('site: document has one main title, image alternatives and reduced-motion support', () => {
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.match(html, /<html lang="pt-BR">/);
  for (const [image] of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(image, /\balt="/);
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  new vm.Script(script);
});

test('site: tabs update the image and accessible selection, including keyboard wraparound', () => {
  const makeElement = () => ({
    attributes: {}, handlers: {}, classList: { remove() {} },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, handler) { this.handlers[key] = handler; },
    focus() { this.focused = true; },
  });
  const tabs = ['select', 'live', 'post'].map(stage => ({
    ...makeElement(), dataset: { stage }, id: 'tab-' + stage,
  }));
  const elements = Object.fromEntries(
    ['stage-panel', 'stage-image', 'stage-title', 'stage-description', 'stage-tag', 'image-dialog']
      .map(id => ['#' + id, makeElement()]),
  );
  elements['#stage-image'].parentElement = makeElement();
  const document = {
    querySelector: selector => elements[selector],
    querySelectorAll: selector => selector === '[data-stage]' ? tabs : [],
  };
  vm.runInNewContext(script, { document, window: { matchMedia: () => ({ matches: true }) } });
  tabs[1].handlers.click();
  assert.equal(elements['#stage-image'].src, 'docs/screenshots/live.png');
  assert.equal(elements['#stage-panel'].attributes['aria-labelledby'], 'tab-live');
  assert.equal(tabs[1].attributes['aria-selected'], 'true');
  assert.equal(tabs[0].tabIndex, -1);
  tabs[1].handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(elements['#stage-image'].src, 'docs/screenshots/postgame.png');
  assert.equal(tabs[2].focused, true);
  tabs[2].handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(elements['#stage-image'].src, 'docs/screenshots/champselect.png');
  assert.equal(elements['#stage-image'].parentElement.href, elements['#stage-image'].src);
  tabs[0].handlers.keydown({ key: 'End', preventDefault() {} });
  assert.equal(tabs[2].tabIndex, 0);
  tabs[2].handlers.keydown({ key: 'Home', preventDefault() {} });
  assert.equal(tabs[0].tabIndex, 0);
});
