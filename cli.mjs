#!/usr/bin/env node
// Playtomic socials and public classes with free places at the clubs in clubs.json.
// usage: node playtomic/cli.mjs [--all] [--socials | --classes] [--days 14] [--clubs slug,slug] [--list]
import { feed, CLUBS, DEFAULT_CLUBS } from './api/_playtomic.js';

const args = process.argv.slice(2);
const days = +(args[args.indexOf('--days') + 1] || 0) || (args.includes('--days') ? 14 : 60);
const kind = args.includes('--socials') ? 'social' : args.includes('--classes') ? 'class' : null;
const until = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

if (args.includes('--list')) { for (const c of CLUBS) console.log(`${c.slug.padEnd(38)} ${c.name.padEnd(32)} ${c.area}${c.default ? '  (default)' : ''}`); process.exit(0); }
const asked = args.includes('--clubs') ? (args[args.indexOf('--clubs') + 1] || '').split(',') : [];
const { rows, missing } = await feed(asked.length ? CLUBS.filter(c => asked.includes(c.slug)) : DEFAULT_CLUBS);
const shown = rows.filter(r => (!kind || r.kind === kind) && r.d <= until && (args.includes('--all') || r.b < r.x));
for (const r of shown) {
  const day = new Date(r.d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const left = r.x - r.b, state = left <= 0 ? 'full' : left === 1 ? 'last place' : `${left} places`;
  console.log(`${day.padEnd(11)} ${r.t}  ${(r.kind === 'social' ? 'Social' : 'Class').padEnd(6)} ${r.club.padEnd(24)} ${r.n.slice(0, 38).padEnd(38)} ${('lvl ' + r.level).padEnd(11)} ${String(r.b).padStart(2)}/${String(r.x).padEnd(2)} ${state.padEnd(10)} ${r.price}`);
}
console.log(`\n${shown.length} shown of ${rows.length} (${rows.filter(r => r.b < r.x).length} with places)${missing.length ? ' · failed: ' + missing.map(m => `${m.name}: ${m.error}`).join('; ') : ''}`);
