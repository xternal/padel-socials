// The landing page stays easy for search engines and AI answer tools to read and quote:
// valid JSON-LD, an FAQ that matches what readers see, one canonical address, and dates that agree. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const SITE = 'https://padel-socials.vercel.app/';
const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const node = type => ld['@graph'].find(n => n['@type'] === type);
const text = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();

test('JSON-LD has the app, the site, the page, the author and the FAQ', () => {
  for (const t of ['WebApplication', 'WebSite', 'WebPage', 'Person', 'FAQPage']) assert.ok(node(t), `${t} missing`);
  assert.equal(node('WebSite').url, SITE);
});

test('every FAQ question in JSON-LD is also on the page', () => {
  const visible = [...html.matchAll(/<dt>([\s\S]*?)<\/dt>/g)].map(m => text(m[1]));
  for (const q of node('FAQPage').mainEntity) assert.ok(visible.includes(q.name), `"${q.name}" is not a visible question`);
});

test('one canonical address, matching og:url', () => {
  assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}">`));
  assert.match(html, new RegExp(`<meta property="og:url" content="${SITE}">`));
});

test('the visible "updated" date, JSON-LD dateModified, sitemap lastmod and llms.txt agree', () => {
  const shown = html.match(/<time datetime="(\d{4}-\d{2}-\d{2})">/)[1];
  assert.equal(node('WebPage').dateModified, shown);
  assert.equal(node('WebSite').dateModified, shown);
  assert.equal(read('sitemap.xml').match(/<lastmod>([^<]+)<\/lastmod>/)[1], shown);
  assert.match(read('llms.txt'), new RegExp(`Updated: ${shown}`));
});

test('the IndexNow key file is served and matches the workflow', () => {
  const file = readdirSync(new URL('..', import.meta.url)).find(f => /^[0-9a-f]{32}\.txt$/.test(f));
  assert.ok(file, 'IndexNow key file missing');
  assert.equal(read(file), file.slice(0, 32));
  assert.match(read('.github/workflows/indexnow.yml'), new RegExp(`KEY: ${file.slice(0, 32)}`));
});

test('fonts never hold up the first paint', () => {
  const outside = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const links = [...outside.matchAll(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g)].map(m => m[0]);
  assert.ok(links.length > 0);
  for (const l of links) assert.match(l, /media="print" onload="this\.media='all'"/);
});
