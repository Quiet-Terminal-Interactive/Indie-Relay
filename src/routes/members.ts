import { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { members, inviteCodes, memberSubscriptions } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';
import { randomBytes } from 'crypto';

export async function memberRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/members/me', { preHandler: requireAuth }, async (req, reply) => {
    const [member] = await db
      .select({
        id: members.id,
        email: members.email,
        name: members.name,
        memberType: members.memberType,
        verified: members.verified,
        verificationUrl: members.verificationUrl,
        creditBalance: members.creditBalance,
        createdAt: members.createdAt,
        activeMonths: members.activeMonths,
        isCommittee: members.isCommittee,
      })
      .from(members)
      .where(eq(members.id, req.member!.id));

    if (!member) return reply.code(404).send({ error: 'Not found' });

    const subs = await db
      .select({ promoType: memberSubscriptions.promoType })
      .from(memberSubscriptions)
      .where(eq(memberSubscriptions.memberId, req.member!.id));

    return reply.send({ ...member, subscriptions: subs.map((s) => s.promoType) });
  });

  app.patch('/api/members/me', { preHandler: requireAuth }, async (req, reply) => {
    const { name, verificationUrl } = req.body as { name?: string; verificationUrl?: string };

    await db
      .update(members)
      .set({ ...(name && { name }), ...(verificationUrl && { verificationUrl }) })
      .where(eq(members.id, req.member!.id));

    return reply.send({ ok: true });
  });

  app.get('/api/members/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const [member] = await db
      .select({
        id: members.id,
        name: members.name,
        memberType: members.memberType,
        verified: members.verified,
        activeMonths: members.activeMonths,
        createdAt: members.createdAt,
      })
      .from(members)
      .where(eq(members.id, id));

    if (!member) return reply.code(404).send({ error: 'Not found' });
    return reply.send(member);
  });

  app.post('/api/members/me/invite', { preHandler: requireAuth }, async (req, reply) => {
    const code = randomBytes(6).toString('hex').toUpperCase();
    const [invite] = await db
      .insert(inviteCodes)
      .values({ creatorId: req.member!.id, code })
      .returning({ code: inviteCodes.code });

    return reply.code(201).send({ code: invite.code });
  });

  app.post('/api/members/me/subscriptions', { preHandler: requireAuth }, async (req, reply) => {
    const { promoType } = req.body as { promoType: string };
    try {
      await db.insert(memberSubscriptions).values({
        memberId: req.member!.id,
        promoType: promoType as any,
      });
    } catch {
      // unique violation = already subscribed, ignore
    }
    return reply.code(201).send({ ok: true });
  });

  app.delete('/api/members/me/subscriptions/:type', { preHandler: requireAuth }, async (req, reply) => {
    const type = (req.params as { type: string }).type;
    await db
      .delete(memberSubscriptions)
      .where(eq(memberSubscriptions.promoType, type as any));
    return reply.send({ ok: true });
  });
}
