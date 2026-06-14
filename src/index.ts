import 'dotenv/config';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import { fileURLToPath } from 'url';
import { join, dirname, extname } from 'path';
import { existsSync } from 'fs';

import { authRoutes } from './routes/auth.js';
import { memberRoutes } from './routes/members.js';
import { marketplaceRoutes } from './routes/marketplace.js';
import { claimRoutes } from './routes/claims.js';
import { creditRoutes } from './routes/credits.js';
import { committeeRoutes } from './routes/committee.js';
import { startInactivityJob } from './lib/inactivity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' } });

await app.register(fastifyCors, { origin: true });
await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
});

await app.register(authRoutes);
await app.register(memberRoutes);
await app.register(marketplaceRoutes);
await app.register(claimRoutes);
await app.register(creditRoutes);
await app.register(committeeRoutes);

app.get('/api/promo-types', async (_req, reply) => {
  return reply.send([
    { type: 'social_shoutout', label: 'Social shoutout / Discord announcement', minCredits: 1, qualityBar: 'Public post naming the game + link, visible for at least 2 weeks' },
    { type: 'community_crosspost', label: 'Community cross-post (reciprocal shoutout)', minCredits: 1, qualityBar: 'Same as above, framed as the reciprocal shout back' },
    { type: 'short_form_video', label: 'Short-form video (TikTok, Shorts, Reels)', minCredits: 2, qualityBar: 'At least 15 seconds of footage; public; link or game name in caption' },
    { type: 'livestream', label: 'Livestream (Twitch, YouTube Live)', minCredits: 3, qualityBar: 'At least 30 minutes playing/discussing; VOD available for at least 2 weeks; spoken + on-screen "Ad: Indie Relay" disclosure for livestreams' },
    { type: 'long_form_video', label: 'Long-form video / dedicated coverage', minCredits: 5, qualityBar: 'Dedicated segment of at least 3–5 minutes, public' },
    { type: 'press_feature', label: 'Written / press feature', minCredits: 5, qualityBar: 'At least ~150 words specifically about the game, with a link' },
  ]);
});

app.setNotFoundHandler(async (req, reply) => {
  if (req.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not found' });
  }
  const urlPath = req.url.split('?')[0].replace(/\/+$/, '');
  if (!extname(urlPath)) {
    const candidate = `${urlPath.replace(/^\//, '')}.html`;
    if (existsSync(join(__dirname, '..', 'public', candidate))) {
      return reply.sendFile(candidate);
    }
  }
  return reply.sendFile('index.html');
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Indie Relay running on http://localhost:${port}`);

if (process.env.NODE_ENV !== 'test') {
  startInactivityJob();
}
