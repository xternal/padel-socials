// Dark mode is Pavel's dark brown: body text about 13:1 and never above 14:1, every text colour WCAG AA (4.5:1),
// chart marks 3:1, no blue cast in the chrome, and the phone's bar colour matches the page. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vars = block => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;}]+?)\s*(?:;|})/g)].map(m => [m[1], m[2]]));
const media = html.match(/@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme="light"\]\) \{([^}]*)\}/)[1];
const forced = html.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)[1];
const dark = vars(forced);

// Colours as [r, g, b, alpha]; translucent ones are laid over the background they sit on, as the browser does
const rgb = c => c.startsWith('#') ? [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)).concat(1) : c.match(/[\d.]+/g).map(Number).concat(1).slice(0, 4);
const over = (fg, a, bg) => fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a));
const lum = c => c.slice(0, 3).map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const v = name => rgb(dark[name]);
const tint = name => Number(html.match(new RegExp(`color-mix\\(in srgb, var\\(--${name}\\) (\\d+)%`))[1]) / 100;

test('both dark blocks hold the same palette', () => assert.deepEqual(vars(media), dark));

test('the phone bar matches the dark background', () => {
  assert.match(html, new RegExp(`<meta name="theme-color" content="${dark.bg}" media="\\(prefers-color-scheme: dark\\)">`));
  assert.match(html, new RegExp(`BAR = \\{ light: '[^']+', dark: '${dark.bg}' \\}`));
});

test('body text is about 13:1, never above 14:1', () => {
  const r = ratio(v('ink'), v('bg'));
  assert.ok(r >= 12.5 && r <= 14, `ink on bg is ${r.toFixed(2)}:1`);
});

test('every text colour passes AA on the background and on raised surfaces', () => {
  for (const fg of ['ink', 'muted', 'accent', 'open', 'last', 'warn', 'social'])
    for (const bg of ['bg', 'surface']) {
      const r = ratio(v(fg), v(bg));
      assert.ok(r >= 4.5, `--${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
});

test('text on filled colours passes AA', () => {
  const pairs = [
    ['open pill', v('open'), over(v('open'), tint('open'), v('bg'))],
    ['last-place pill', v('last'), over(v('last'), tint('last'), v('bg'))],
    ['pressed chip', v('accent-ink'), v('accent')],
    ['next-up card', v('ball-ink'), v('ball')],
    ['next-up eyebrow', over(v('ball-ink'), 0.75, v('ball')), v('ball')],
    ['deploy button', v('bg'), v('ink')],
  ];
  for (const [what, fg, bg] of pairs) assert.ok(ratio(fg, bg) >= 4.5, `${what} is ${ratio(fg, bg).toFixed(2)}:1`);
});

test('the places bar fill stands out from its track', () => {
  const r = ratio(v('muted'), v('bar-off'));
  assert.ok(r >= 3, `bar fill on track is ${r.toFixed(2)}:1`);
});

test('no blue cast in the chrome', () => {
  for (const name of ['bg', 'surface', 'ink', 'muted', 'line', 'bar-off', 'accent']) {
    const [r, , b] = v(name);
    assert.ok(b <= r, `--${name} ${dark[name]} leans blue`);
  }
});
