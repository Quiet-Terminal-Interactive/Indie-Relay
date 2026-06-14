import { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { promoRequests, members } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { promoRequestRateLimit } from '../middleware/rate-limit.js';
import { spendCredits, PROMO_VALUES } from '../lib/credits.js';

export async function marketplaceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/requests', { preHandler: requireVerified }, async (req, reply) => {
    const { type, minCredits, maxCredits } = req.query as {
      type?: string;
      minCredits?: string;
      maxCredits?: string;
    };

    const conditions = [eq(promoRequests.status, 'open')];
    if (type) conditions.push(eq(promoRequests.promoType, type as any));
    if (minCredits) conditions.push(gte(promoRequests.creditsOffered, Number(minCredits)));
    if (maxCredits) conditions.push(lte(promoRequests.creditsOffered, Number(maxCredits)));

    const requests = await db
      .select({
        id: promoRequests.id,
        gameName: promoRequests.gameName,
        gameUrl: promoRequests.gameUrl,
        promoType: promoRequests.promoType,
        creditsOffered: promoRequests.creditsOffered,
        description: promoRequests.description,
        createdAt: promoRequests.createdAt,
        requesterName: members.name,
        requesterId: promoRequests.requesterId,
      })
      .from(promoRequests)
      .innerJoin(members, eq(promoRequests.requesterId, members.id))
      .where(and(...conditions))
      .orderBy(desc(promoRequests.createdAt));

    return reply.send(requests);
  });

  app.post(
    '/api/requests',
    { preHandler: [requireVerified, promoRequestRateLimit] },
    async (req, reply) => {
      const { gameName, gameUrl, promoType, creditsOffered, description } = req.body as {
        gameName: string;
        gameUrl?: string;
        promoType: string;
        creditsOffered: number;
        description?: string;
      };

      const minValue = PROMO_VALUES[promoType];
      if (!minValue) return reply.code(400).send({ error: 'Invalid promo type' });
      if (creditsOffered < minValue) {
        return reply.code(400).send({ error: `Minimum credit offer for this type is ${minValue}` });
      }

      await spendCredits(req.member!.id, creditsOffered, `Promo request: ${gameName}`);

      const [request] = await db
        .insert(promoRequests)
        .values({
          requesterId: req.member!.id,
          gameName,
          gameUrl,
          promoType: promoType as any,
          creditsOffered,
          description,
        })
        .returning({ id: promoRequests.id });

      return reply.code(201).send({ id: request.id });
    },
  );

  app.get('/api/requests/:id', { preHandler: requireVerified }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const [request] = await db
      .select()
      .from(promoRequests)
      .where(eq(promoRequests.id, id));

    if (!request) return reply.code(404).send({ error: 'Not found' });
    return reply.send(request);
  });

  app.delete('/api/requests/:id', { preHandler: requireVerified }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const [request] = await db
      .select()
      .from(promoRequests)
      .where(eq(promoRequests.id, id));

    if (!request) return reply.code(404).send({ error: 'Not found' });
    if (request.requesterId !== req.member!.id) return reply.code(403).send({ error: 'Forbidden' });
    if (request.status !== 'open') return reply.code(400).send({ error: 'Cannot cancel a claimed request' });

    await db
      .update(promoRequests)
      .set({ status: 'cancelled' })
      .where(eq(promoRequests.id, id));

    const { awardCredits } = await import('../lib/credits.js');
    await awardCredits(req.member!.id, request.creditsOffered, `Refund: cancelled promo request`);

    return reply.send({ ok: true });
  });
}
