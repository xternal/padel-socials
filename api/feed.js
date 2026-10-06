// GET /api/feed?clubs=slug,slug  (header X-Key: <PADEL_KEY>) -> socials and public classes with places
// at up to 8 of the London clubs in clubs.json (default: the ones marked "default").
// Private: Playtomic's terms allow personal, non-commercial use only, so nothing goes out without the key.
import { timingSafeEqual } from 'node:crypto';
import { feed, CLUBS, DEFAULT_CLUBS, MAX_CLUBS } from './_playtomic.js';

export const config = { maxDuration: 30 };

function allowed(req) {
  const want = process.env.PADEL_KEY || '', got = String(req.headers['x-key'] || '');
  return want.length > 0 && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');   // the feed is personal; only the landing page is for search
  if (!allowed(req)) { res.status(401).json({ error: 'Enter your key to see the feed.' }); return; }
  const asked = String(req.query.clubs || '').split(',').filter(Boolean);
  const picked = asked.length ? CLUBS.filter(c => asked.includes(c.slug)).slice(0, MAX_CLUBS) : DEFAULT_CLUBS;
  try {
    const out = await feed(picked, { fresh: req.query.fresh === '1' });
    res.status(200).json({ ...out, selected: picked.map(c => c.slug), maxClubs: MAX_CLUBS,
      clubs: CLUBS.map(({ slug, name, area }) => ({ slug, name, area })) });
  } catch (e) {
    res.status(502).json({ error: `Playtomic didn't answer (${e.message}).` });
  }
}
