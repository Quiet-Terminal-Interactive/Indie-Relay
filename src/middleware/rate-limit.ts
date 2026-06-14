import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { promoRequests } from '../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export async function promoRequestRateLimit(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!req.member) return;

  const since = new Date(Date.now() - TWO_WEEKS_MS);
  const recent = await db
    .select({ id: promoRequests.id })
    .from(promoRequests)
    .where(
      and(
        eq(promoRequests.requesterId, req.member.id),
        gte(promoRequests.createdAt, since),
      ),
    )
    .limit(1);

  if (recent.length > 0) {
    reply.code(429).send({ error: 'You can only submit one promo request every two weeks.' });
  }
}
