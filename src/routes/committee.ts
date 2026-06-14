import { FastifyInstance } from 'fastify';
import { db } from '../db/client.js';
import { committeeQueue, committeeAuditLog, promoClaims, promoRequests, members } from '../db/schema.js';
import { eq, isNull, desc, and, asc } from 'drizzle-orm';
import { requireCommittee } from '../middleware/auth.js';
import { earnFromClaim } from '../lib/credits.js';

type AuditAction = typeof committeeAuditLog.$inferInsert['action'];

async function writeAudit(
  committeeId: number,
  action: AuditAction,
  opts: { targetMemberId?: number; targetClaimId?: number; targetRequestId?: number; reason?: string } = {},
): Promise<void> {
  await db.insert(committeeAuditLog).values({ committeeId, action, ...opts });
}

export async function committeeRoutes(app: FastifyInstance): Promise<void> {

  app.get('/api/committee/queue', { preHandler: requireCommittee }, async (req, reply) => {
    const queue = await db
      .select({
        id: committeeQueue.id,
        claimId: committeeQueue.claimId,
        priority: committeeQueue.priority,
        category: committeeQueue.category,
        notes: committeeQueue.notes,
        createdAt: committeeQueue.createdAt,
        proofUrl: promoClaims.proofUrl,
        platform: promoClaims.platform,
        claimStatus: promoClaims.status,
        gameName: promoRequests.gameName,
        promoType: promoRequests.promoType,
        creditsOffered: promoRequests.creditsOffered,
        promoterName: members.name,
      })
      .from(committeeQueue)
      .innerJoin(promoClaims, eq(committeeQueue.claimId, promoClaims.id))
      .innerJoin(promoRequests, eq(promoClaims.requestId, promoRequests.id))
      .innerJoin(members, eq(promoClaims.promoterId, members.id))
      .where(isNull(committeeQueue.resolvedAt))
      .orderBy(desc(committeeQueue.priority), desc(committeeQueue.createdAt));

    return reply.send(queue);
  });

  app.post('/api/committee/queue/:id/approve', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    await resolveQueueItem(id, req.member!.id);

    const [item] = await db
      .select({ claimId: committeeQueue.claimId })
      .from(committeeQueue)
      .where(eq(committeeQueue.id, id));

    if (!item) return reply.code(404).send({ error: 'Not found' });

    const [claim] = await db.select().from(promoClaims).where(eq(promoClaims.id, item.claimId));
    const [request] = await db.select().from(promoRequests).where(eq(promoRequests.id, claim.requestId));
    const [promoter] = await db
      .select({ activeMonths: members.activeMonths })
      .from(members)
      .where(eq(members.id, claim.promoterId));

    await earnFromClaim(
      claim.promoterId,
      promoter?.activeMonths ?? 0,
      request.creditsOffered,
      claim.id,
      `Committee-approved promo for "${request.gameName}"`,
    );

    await writeAudit(req.member!.id, 'approve_claim', { targetClaimId: claim.id });

    return reply.send({ ok: true });
  });

  app.post('/api/committee/queue/:id/reject', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const item = await getQueueItem(id);
    if (!item) return reply.code(404).send({ error: 'Not found' });

    await resolveQueueItem(id, req.member!.id);

    await db
      .update(promoClaims)
      .set({ status: 'disputed', resolvedAt: new Date() })
      .where(eq(promoClaims.id, item.claimId));

    await writeAudit(req.member!.id, 'reject_claim', { targetClaimId: item.claimId });

    return reply.send({ ok: true });
  });

  app.post('/api/committee/queue/:id/partial', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const item = await getQueueItem(id);
    if (!item) return reply.code(404).send({ error: 'Not found' });

    const [claim] = await db.select().from(promoClaims).where(eq(promoClaims.id, item.claimId));
    const [request] = await db.select().from(promoRequests).where(eq(promoRequests.id, claim.requestId));
    const [promoter] = await db
      .select({ activeMonths: members.activeMonths })
      .from(members)
      .where(eq(members.id, claim.promoterId));

    const partialValue = Math.max(1, Math.floor(request.creditsOffered / 2));
    await earnFromClaim(
      claim.promoterId,
      promoter?.activeMonths ?? 0,
      partialValue,
      claim.id,
      `Partial payout (50%) for "${request.gameName}"`,
    );

    await resolveQueueItem(id, req.member!.id);
    await db
      .update(promoClaims)
      .set({ status: 'approved', resolvedAt: new Date() })
      .where(eq(promoClaims.id, item.claimId));

    await writeAudit(req.member!.id, 'partial_claim', { targetClaimId: item.claimId });

    return reply.send({ ok: true });
  });

  app.get('/api/committee/pending-members', { preHandler: requireCommittee }, async (_req, reply) => {
    const pending = await db
      .select({
        id: members.id,
        name: members.name,
        email: members.email,
        memberType: members.memberType,
        verificationUrl: members.verificationUrl,
        createdAt: members.createdAt,
      })
      .from(members)
      .where(and(eq(members.verified, false), eq(members.isDeleted, false)))
      .orderBy(desc(members.createdAt));

    return reply.send(pending);
  });

  app.post('/api/committee/pending-members/:id/approve', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    await db.update(members).set({ verified: true }).where(eq(members.id, id));
    await writeAudit(req.member!.id, 'approve_member', { targetMemberId: id });
    return reply.send({ ok: true });
  });

  app.post('/api/committee/pending-members/:id/reject', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    await db.update(members).set({ isDeleted: true, deletedAt: new Date() }).where(eq(members.id, id));
    await writeAudit(req.member!.id, 'reject_member', { targetMemberId: id });
    return reply.send({ ok: true });
  });

  app.get('/api/committee/members', { preHandler: requireCommittee }, async (req, reply) => {
    const { search, status } = req.query as { search?: string; status?: string };

    const rows = await db
      .select({
        id: members.id,
        name: members.name,
        email: members.email,
        memberType: members.memberType,
        verified: members.verified,
        status: members.status,
        suspendedUntil: members.suspendedUntil,
        creditBalance: members.creditBalance,
        createdAt: members.createdAt,
        lastActiveAt: members.lastActiveAt,
        isCommittee: members.isCommittee,
      })
      .from(members)
      .where(eq(members.isDeleted, false))
      .orderBy(desc(members.createdAt));

    let filtered = rows;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }
    if (status) {
      filtered = filtered.filter((m) => m.status === status);
    }

    return reply.send(filtered);
  });

  app.post('/api/committee/members/:id/ban', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { reason } = (req.body ?? {}) as { reason?: string };

    const [target] = await db.select({ id: members.id, isCommittee: members.isCommittee }).from(members).where(and(eq(members.id, id), eq(members.isDeleted, false)));
    if (!target) return reply.code(404).send({ error: 'Member not found' });
    if (target.isCommittee) return reply.code(403).send({ error: 'Cannot ban a committee member' });

    await db.update(members).set({ status: 'banned', suspendedUntil: null }).where(eq(members.id, id));
    await writeAudit(req.member!.id, 'ban', { targetMemberId: id, reason });

    return reply.send({ ok: true });
  });

  app.post('/api/committee/members/:id/unban', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { reason } = (req.body ?? {}) as { reason?: string };

    const [target] = await db.select({ id: members.id }).from(members).where(and(eq(members.id, id), eq(members.isDeleted, false)));
    if (!target) return reply.code(404).send({ error: 'Member not found' });

    await db.update(members).set({ status: 'active' }).where(eq(members.id, id));
    await writeAudit(req.member!.id, 'unban', { targetMemberId: id, reason });

    return reply.send({ ok: true });
  });

  app.post('/api/committee/members/:id/suspend', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { reason, until } = (req.body ?? {}) as { reason?: string; until?: string };

    const [target] = await db.select({ id: members.id, isCommittee: members.isCommittee }).from(members).where(and(eq(members.id, id), eq(members.isDeleted, false)));
    if (!target) return reply.code(404).send({ error: 'Member not found' });
    if (target.isCommittee) return reply.code(403).send({ error: 'Cannot suspend a committee member' });

    const suspendedUntil = until ? new Date(until) : null;
    await db.update(members).set({ status: 'suspended', suspendedUntil }).where(eq(members.id, id));
    await writeAudit(req.member!.id, 'suspend', { targetMemberId: id, reason });

    return reply.send({ ok: true });
  });

  app.post('/api/committee/members/:id/unsuspend', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { reason } = (req.body ?? {}) as { reason?: string };

    const [target] = await db.select({ id: members.id }).from(members).where(and(eq(members.id, id), eq(members.isDeleted, false)));
    if (!target) return reply.code(404).send({ error: 'Member not found' });

    await db.update(members).set({ status: 'active', suspendedUntil: null }).where(eq(members.id, id));
    await writeAudit(req.member!.id, 'unsuspend', { targetMemberId: id, reason });

    return reply.send({ ok: true });
  });

  app.get('/api/committee/audit-log', { preHandler: requireCommittee }, async (req, reply) => {
    const { limit = '50', offset = '0' } = req.query as { limit?: string; offset?: string };

    const committeeAlias = members;
    const targetAlias = db
      .select({ id: members.id, name: members.name })
      .from(members)
      .as('target');

    const log = await db
      .select({
        id: committeeAuditLog.id,
        action: committeeAuditLog.action,
        reason: committeeAuditLog.reason,
        createdAt: committeeAuditLog.createdAt,
        targetMemberId: committeeAuditLog.targetMemberId,
        targetClaimId: committeeAuditLog.targetClaimId,
        targetRequestId: committeeAuditLog.targetRequestId,
        committeeMemberName: committeeAlias.name,
        committeeMemberId: committeeAlias.id,
        targetMemberName: targetAlias.name,
      })
      .from(committeeAuditLog)
      .innerJoin(committeeAlias, eq(committeeAuditLog.committeeId, committeeAlias.id))
      .leftJoin(targetAlias, eq(committeeAuditLog.targetMemberId, targetAlias.id))
      .orderBy(desc(committeeAuditLog.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    return reply.send(log);
  });

  // ── Promo request management ──────────────────────────────────────────────

  app.get('/api/committee/requests', { preHandler: requireCommittee }, async (req, reply) => {
    const { status, memberId } = req.query as { status?: string; memberId?: string };

    const conditions = [];
    if (status) conditions.push(eq(promoRequests.status, status as any));
    if (memberId) conditions.push(eq(promoRequests.requesterId, Number(memberId)));

    const rows = await db
      .select({
        id: promoRequests.id,
        gameName: promoRequests.gameName,
        gameUrl: promoRequests.gameUrl,
        promoType: promoRequests.promoType,
        creditsOffered: promoRequests.creditsOffered,
        description: promoRequests.description,
        status: promoRequests.status,
        createdAt: promoRequests.createdAt,
        requesterId: promoRequests.requesterId,
        requesterName: members.name,
        requesterEmail: members.email,
      })
      .from(promoRequests)
      .innerJoin(members, eq(promoRequests.requesterId, members.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(promoRequests.createdAt));

    return reply.send(rows);
  });

  app.post('/api/committee/requests/:id/cancel', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { reason } = (req.body ?? {}) as { reason?: string };

    const [request] = await db.select().from(promoRequests).where(eq(promoRequests.id, id));
    if (!request) return reply.code(404).send({ error: 'Request not found' });
    if (request.status === 'completed') return reply.code(400).send({ error: 'Cannot cancel a completed request' });
    if (request.status === 'cancelled') return reply.code(400).send({ error: 'Request already cancelled' });

    await db.update(promoRequests).set({ status: 'cancelled' }).where(eq(promoRequests.id, id));

    // If the request was open or claimed, refund the requester
    if (request.status === 'open' || request.status === 'claimed') {
      const { awardCredits } = await import('../lib/credits.js');
      await awardCredits(request.requesterId, request.creditsOffered, `Committee refund: cancelled promo request`);
    }

    // If it was claimed, reject the in-flight claim
    if (request.status === 'claimed') {
      await db
        .update(promoClaims)
        .set({ status: 'disputed', resolvedAt: new Date() })
        .where(and(eq(promoClaims.requestId, id), isNull(promoClaims.resolvedAt)));
    }

    await writeAudit(req.member!.id, 'cancel_request', { targetRequestId: id, reason });

    return reply.send({ ok: true });
  });

  // ── Claim management ──────────────────────────────────────────────────────

  app.get('/api/committee/claims', { preHandler: requireCommittee }, async (req, reply) => {
    const { status, memberId } = req.query as { status?: string; memberId?: string };

    const conditions = [];
    if (status) conditions.push(eq(promoClaims.status, status as any));
    if (memberId) conditions.push(eq(promoClaims.promoterId, Number(memberId)));

    const promoterMembers = db
      .select({ id: members.id, name: members.name, email: members.email })
      .from(members)
      .as('promoter');

    const rows = await db
      .select({
        id: promoClaims.id,
        requestId: promoClaims.requestId,
        status: promoClaims.status,
        proofUrl: promoClaims.proofUrl,
        platform: promoClaims.platform,
        claimedAt: promoClaims.claimedAt,
        resolvedAt: promoClaims.resolvedAt,
        promoterId: promoClaims.promoterId,
        promoterName: promoterMembers.name,
        promoterEmail: promoterMembers.email,
        gameName: promoRequests.gameName,
        promoType: promoRequests.promoType,
        creditsOffered: promoRequests.creditsOffered,
        requesterId: promoRequests.requesterId,
      })
      .from(promoClaims)
      .innerJoin(promoRequests, eq(promoClaims.requestId, promoRequests.id))
      .innerJoin(promoterMembers, eq(promoClaims.promoterId, promoterMembers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(promoClaims.claimedAt));

    return reply.send(rows);
  });

  app.post('/api/committee/claims/:id/force-approve', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { reason } = (req.body ?? {}) as { reason?: string };

    const [claim] = await db.select().from(promoClaims).where(eq(promoClaims.id, id));
    if (!claim) return reply.code(404).send({ error: 'Claim not found' });
    if (claim.status === 'approved' || claim.status === 'auto_approved') {
      return reply.code(400).send({ error: 'Claim already approved' });
    }

    const [request] = await db.select().from(promoRequests).where(eq(promoRequests.id, claim.requestId));
    const [promoter] = await db
      .select({ activeMonths: members.activeMonths })
      .from(members)
      .where(eq(members.id, claim.promoterId));

    await db.update(promoClaims).set({ status: 'approved', resolvedAt: new Date() }).where(eq(promoClaims.id, id));
    await db.update(promoRequests).set({ status: 'completed' }).where(eq(promoRequests.id, claim.requestId));

    await earnFromClaim(
      claim.promoterId,
      promoter?.activeMonths ?? 0,
      request.creditsOffered,
      id,
      `Committee force-approved promo for "${request.gameName}"`,
    );

    await writeAudit(req.member!.id, 'force_approve_claim', { targetClaimId: id, reason });

    return reply.send({ ok: true });
  });

  app.post('/api/committee/claims/:id/force-reject', { preHandler: requireCommittee }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const { reason } = (req.body ?? {}) as { reason?: string };

    const [claim] = await db.select().from(promoClaims).where(eq(promoClaims.id, id));
    if (!claim) return reply.code(404).send({ error: 'Claim not found' });
    if (claim.status === 'approved' || claim.status === 'auto_approved') {
      return reply.code(400).send({ error: 'Cannot reject an already-approved claim' });
    }

    await db.update(promoClaims).set({ status: 'disputed', resolvedAt: new Date() }).where(eq(promoClaims.id, id));
    // Reset request to open so another promoter can claim it
    await db.update(promoRequests).set({ status: 'open' }).where(eq(promoRequests.id, claim.requestId));

    await writeAudit(req.member!.id, 'force_reject_claim', { targetClaimId: id, reason });

    return reply.send({ ok: true });
  });
}

async function getQueueItem(id: number) {
  const [item] = await db.select().from(committeeQueue).where(eq(committeeQueue.id, id));
  return item ?? null;
}

async function resolveQueueItem(id: number, resolvedBy: number): Promise<void> {
  await db
    .update(committeeQueue)
    .set({ resolvedAt: new Date(), resolvedBy })
    .where(eq(committeeQueue.id, id));
}
