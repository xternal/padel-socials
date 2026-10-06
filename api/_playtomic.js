// Reads Playtomic club listing pages (public HTML, no login) and turns their activity cards into rows.
// Personal, non-commercial use only: Playtomic's terms forbid republishing this data.
//   /clubs/<slug>/academy/public-classes      -> public classes (about 10 days ahead)
//   /clubs/<slug>/competitions/tournaments    -> socials, americanos, tournaments (weeks ahead)
import { readFileSync } from 'node:fs';

export const CLUBS = JSON.parse(readFileSync(new URL('../clubs.json', import.meta.url), 'utf8'));
const UA = 'padel-socials (personal use; github.com/xternal/padel-socials)';
const PAGES = { class: 'academy/public-classes', social: 'competitions/tournaments' };
const KINDS = { 'Public class': 'class', 'Tournament': 'social' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const decode = s => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const ukNow = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, stamp: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`, year: +p.year };
};

// Cards carry no year: take this year, or next year when that date is long past (a December page read in January)
function isoDate(month, day, now) {
  const m = MONTHS.indexOf(month) + 1; if (!m) return null;
  let iso = `${now.year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (iso < now.date && (Date.parse(now.date) - Date.parse(iso)) > 60 * 864e5) iso = `${now.year + 1}${iso.slice(4)}`;
  return iso;
}

// Playtomic's pages are Next.js server components: the HTML holds only part of each card, and the rest
// (places, length, price, link) lives in the page's embedded component stream (self.__next_f), as rows that
// point at each other ("$L64"). Decode that stream, follow the pointers, and render it back to simple
// markup, so every card is complete before parsing.
function flightRows(html) {
  const text = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(m => JSON.parse(`"${m[1]}"`)).join('');
  const buf = Buffer.from(text, 'utf8'), rows = new Map();
  let i = 0;
  while (i < buf.length) {
    const colon = buf.indexOf(58, i);                       // ':'
    if (colon < 0) break;
    const id = buf.toString('utf8', i, colon).trim();
    if (buf[colon + 1] === 84) {                            // 'T<hex length>,<text>'
      const comma = buf.indexOf(44, colon);
      const len = parseInt(buf.toString('utf8', colon + 2, comma), 16);
      rows.set(id, buf.toString('utf8', comma + 1, comma + 1 + len)); i = comma + 1 + len;
    } else {
      let nl = buf.indexOf(10, colon); if (nl < 0) nl = buf.length;
      const raw = buf.toString('utf8', colon + 1, nl);
      try { rows.set(id, JSON.parse(raw)); } catch { rows.set(id, null); }
      i = nl + 1;
    }
  }
  return rows;
}

function render(node, rows, depth = 0, seen = new Set()) {
  if (depth > 400 || node == null || node === false || node === true) return '';
  if (typeof node === 'string') {
    const ref = node.match(/^\$L?([0-9a-f]+)$/);
    if (ref) {
      if (seen.has(ref[1]) || !rows.has(ref[1])) return '';
      seen.add(ref[1]); const out = render(rows.get(ref[1]), rows, depth + 1, seen); seen.delete(ref[1]); return out;
    }
    if (node.startsWith('$$')) return node.slice(1);
    return node.startsWith('$') ? '' : node.replace(/</g, '&lt;');
  }
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    if (node[0] === '$' && typeof node[1] === 'string' && node.length >= 4) {   // an element: ["$", type, key, props]
      const props = node[3] || {}, attrs = [];
      for (const k of ['data-tracking-property-activity-type', 'href']) if (typeof props[k] === 'string') attrs.push(`${k}="${props[k]}"`);
      return `<x ${attrs.join(' ')}>\n${render(props.children, rows, depth + 1, seen)}\n</x>`;
    }
    return node.map(n => render(n, rows, depth + 1, seen)).join('\n');
  }
  return '';
}

export function resolvePage(html) {
  const rows = flightRows(html);
  return rows.has('0') || rows.size ? [...rows.keys()].filter(k => {
    const v = rows.get(k); return Array.isArray(v) && v[0] === '$';        // top-level element rows only
  }).map(k => render(rows.get(k), rows)).join('\n') : html;
}

export function parseCards(html, club, now = ukNow()) {
  html = resolvePage(html);
  const rows = [];
  for (const part of html.split('data-tracking-property-activity-type="').slice(1)) {
    const kind = KINDS[part.slice(0, part.indexOf('"'))];
    if (!kind) continue;                                     // courses and anything else
    const end = part.indexOf('data-tracking-property-activity-type');
    const body = (end < 0 ? part : part.slice(0, end)).slice(0, 20000);
    const href = body.match(/href="(\/activities\/[a-z-]+\/[0-9a-f-]{36})"/);
    const toks = decode(body.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, '')
      .replace(/<[^>]+>/g, '\n')).split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('<') && !s.includes('"'));
    const joined = toks.join(' | ');
    const when = joined.match(/(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, ([A-Z][a-z]+) (\d{1,2})\s*\|\s*(\d{2}:\d{2})h/);
    if (!when) continue;
    const d = isoDate(when[1], +when[2], now);
    const ti = toks.findIndex(t => t.endsWith(`${when[3]}h`));
    const slash = toks.indexOf('/');
    const level = toks.find(t => /^\d+(\.\d+)? – \d+(\.\d+)?$/.test(t));
    const ci = toks.indexOf('Coach');
    const price = toks.find(t => /^£\d+(\.\d+)?$/.test(t));
    rows.push({
      kind, club: club.name, slug: club.slug, d, t: when[3],
      n: toks[ti + 1] && !/^(Padel|Public class|Tournament)$/.test(toks[ti + 1]) ? toks[ti + 1] : '',
      level: level ? level.replace(' – ', '–') : '',
      m: +(toks.find(t => /^\d+ min$/.test(t)) || '0').split(' ')[0] || null,
      b: slash > 0 ? +toks[slash - 1] : null, x: slash > 0 ? +toks[slash + 1] : null,
      coach: ci >= 0 ? toks[ci + 1] : '', price: price || '',
      // Some cards stream in without their link; then point at the club's full list of that kind
      url: href ? `https://playtomic.com${href[1]}` : `https://playtomic.com/clubs/${club.slug}/${PAGES[kind]}`,
    });
  }
  return rows.filter(r => r.d && `${r.d} ${r.t}` >= now.stamp && Number.isFinite(r.b) && Number.isFinite(r.x));
}

async function page(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${new URL(url).pathname} answered ${r.status}`);
  return r.text();
}

// Every club's classes and socials. Failed pages are reported, not fatal.
export const DEFAULT_CLUBS = CLUBS.filter(c => c.default);
export const MAX_CLUBS = 8;              // ~2 x 1.5 MB pages per club: keep each request gentle
const clubCache = new Map();             // slug -> {at, rows}; per instance, 5 minutes

async function clubRows(c, fresh) {
  const hit = clubCache.get(c.slug);
  if (hit && Date.now() - hit.at < (fresh ? 60e3 : 5 * 60e3)) return hit.rows;
  const rows = [];
  await Promise.all(Object.entries(PAGES).map(async ([kind, path]) =>
    rows.push(...parseCards(await page(`https://playtomic.com/clubs/${c.slug}/${path}`), c).filter(r => r.kind === kind))));
  clubCache.set(c.slug, { at: Date.now(), rows });
  return rows;
}

// Classes and socials with places at the given clubs. A club that fails is reported, not fatal.
export async function feed(clubs = DEFAULT_CLUBS, { fresh = false } = {}) {
  const failed = [], rows = [];
  await Promise.all(clubs.slice(0, MAX_CLUBS).map(async c => {
    try { rows.push(...await clubRows(c, fresh)); } catch (e) { failed.push(`${c.name}: ${e.message}`); }
  }));
  const seen = new Set();
  return { at: new Date().toISOString(), failed,
    rows: rows.filter(r => !seen.has(r.url + r.d + r.t) && seen.add(r.url + r.d + r.t)).sort((a, z) => (a.d + a.t).localeCompare(z.d + z.t)) };
}
