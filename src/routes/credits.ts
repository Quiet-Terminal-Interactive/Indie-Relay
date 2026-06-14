import { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { members, creditTransactions } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

export async function creditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/credits/balance', { preHandler: requireAuth }, async (req, reply) => {
    const [member] = await db
      .select({ creditBalance: members.creditBalance })
      .from(members)
      .where(eq(members.id, req.member!.id));

    return reply.send({ balance: member?.creditBalance ?? 0 });
  });

  app.get('/api/credits/ledger', { preHandler: requireAuth }, async (req, reply) => {
    const transactions = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.memberId, req.member!.id))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(100);

    return reply.send(transactions);
  });
}
