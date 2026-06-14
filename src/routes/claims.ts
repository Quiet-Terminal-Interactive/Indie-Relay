import { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { promoClaims, promoRequests, members, committeeQueue } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireVerified } from '../middleware/auth.js';
import { earnFromClaim, PROMO_VALUES } from '../lib/credits.js';
import { checkAndFlagMember } from '../lib/flags.js';

export async function claimRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/claims', { preHandler: requireVerified }, async (req, reply) => {
    const { requestId, proofUrl, platform } = req.body as {
      requestId: number;
      proofUrl: string;
      platform?: string;
    };

    const [request] = await db
      .select()
      .from(promoRequests)
      .where(eq(promoRequests.id, requestId));

    if (!request || request.status !== 'open') {
      return reply.code(400).send({ error: 'Request not available' });
    }
    if (request.requesterId === req.member!.id) {
      return reply.code(400).send({ error: 'You cannot claim your own request' });
    }

    await db.update(promoRequests).set({ status: 'claimed' }).where(eq(promoRequests.id, requestId));

    const [claim] = await db
      .insert(promoClaims)
      .values({
        requestId,
        promoterId: req.member!.id,
        proofUrl,
        platform,
      })
      .returning({ id: promoClaims.id });

    return reply.code(201).send({ id: claim.id });
  });

  app.get('/api/claims', { preHandler: requireVerified }, async (req, reply) => {
    const { role } = req.query as { role?: 'requester' | 'promoter' };
    const memberId = req.member!.id;

    let claimRows;
    if (role === 'promoter') {
      claimRows = await db
        .select()
        .from(promoClaims)
        .where(eq(promoClaims.promoterId, memberId));
    } else {
      claimRows = await db
        .select({
          id: promoClaims.id,
          requestId: promoClaims.requestId,
          promoterId: promoClaims.promoterId,
          proofUrl: promoClaims.proofUrl,
          platform: promoClaims.platform,
          status: promoClaims.status,
          claimedAt: promoClaims.claimedAt,
          resolvedAt: promoClaims.resolvedAt,
          gameName: promoRequests.gameName,
          promoType: promoRequests.promoType,
          creditsOffered: promoRequests.creditsOffered,
          promoterName: members.name,
        })
        .from(promoClaims)
        .innerJoin(promoRequests, eq(promoClaims.requestId, promoRequests.id))
        .innerJoin(members, eq(promoClaims.promoterId, members.id))
        .where(eq(promoRequests.requesterId, memberId));
    }

    return reply.send(claimRows);
  });

  app.post('/api/claims/:id/approve', { preHandler: requireVerified }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const claim = await getClaim(id);
    if (!claim) return reply.code(404).send({ error: 'Not found' });

    const request = await getRequest(claim.requestId);
    if (!request || request.requesterId !== req.member!.id) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (claim.status !== 'pending') {
      return reply.code(400).send({ error: 'Claim already resolved' });
    }

    const [promoter] = await db
      .select({ activeMonths: members.activeMonths })
      .from(members)
      .where(eq(members.id, claim.promoterId));

    await db
      .update(promoClaims)
      .set({ status: 'approved', resolvedAt: new Date() })
      .where(eq(promoClaims.id, id));

    await db
      .update(promoRequests)
      .set({ status: 'completed' })
      .where(eq(promoRequests.id, claim.requestId));

    await earnFromClaim(
      claim.promoterId,
      promoter?.activeMonths ?? 0,
      request.creditsOffered,
      id,
      `Approved promo for "${request.gameName}"`,
    );

    await checkAndFlagMember(request.requesterId);

    return reply.send({ ok: true });
  });

  app.post('/api/claims/:id/dispute', { preHandler: requireVerified }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { notes } = req.body as { notes?: string };

    const claim = await getClaim(id);
    if (!claim) return reply.code(404).send({ error: 'Not found' });
    const request = await getRequest(claim.requestId);
    if (!request || request.requesterId !== req.member!.id) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (claim.status !== 'pending') return reply.code(400).send({ error: 'Already resolved' });

    await db
      .update(promoClaims)
      .set({ status: 'disputed' })
      .where(eq(promoClaims.id, id));

    await db.insert(committeeQueue).values({
      claimId: id,
      priority: 'dispute',
      notes,
    });

    return reply.send({ ok: true });
  });

  app.post('/api/claims/:id/committee', { preHandler: requireVerified }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const claim = await getClaim(id);
    if (!claim) return reply.code(404).send({ error: 'Not found' });
    const request = await getRequest(claim.requestId);
    if (!request || request.requesterId !== req.member!.id) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    await db
      .update(promoClaims)
      .set({ status: 'committee' })
      .where(eq(promoClaims.id, id));

    await db.insert(committeeQueue).values({ claimId: id, priority: 'routine' });

    return reply.send({ ok: true });
  });
}

async function getClaim(id: number) {
  const [claim] = await db.select().from(promoClaims).where(eq(promoClaims.id, id));
  return claim ?? null;
}

async function getRequest(id: number) {
  const [request] = await db.select().from(promoRequests).where(eq(promoRequests.id, id));
  return request ?? null;
}
