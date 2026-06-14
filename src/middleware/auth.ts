import { FastifyRequest, FastifyReply } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '../db/client.js';
import { members } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
);

export interface JWTPayload {
  sub: string;
  memberId: number;
  isCommittee: boolean;
}

export async function signToken(payload: Omit<JWTPayload, 'sub'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(payload.memberId))
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JWTPayload;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorised' });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = await verifyToken(token);

    const [member] = await db
      .select({ id: members.id, isCommittee: members.isCommittee, isDeleted: members.isDeleted, verified: members.verified, status: members.status, suspendedUntil: members.suspendedUntil })
      .from(members)
      .where(and(eq(members.id, payload.memberId), eq(members.isDeleted, false)));

    if (!member) {
      reply.code(401).send({ error: 'Unauthorised' });
      return;
    }

    if (member.status === 'banned') {
      reply.code(403).send({ error: 'Your account has been banned.' });
      return;
    }

    if (member.status === 'suspended') {
      if (!member.suspendedUntil || member.suspendedUntil > new Date()) {
        reply.code(403).send({ error: 'Your account is suspended.' });
        return;
      }
      // Suspension expired — lift it automatically
      await db.update(members).set({ status: 'active', suspendedUntil: null }).where(eq(members.id, member.id));
    }

    req.member = member;

    await db
      .update(members)
      .set({ lastActiveAt: new Date(), markedInactiveAt: null, inactivityWarningsSent: 0 })
      .where(eq(members.id, member.id));
  } catch {
    reply.code(401).send({ error: 'Unauthorised' });
  }
}

export async function requireVerified(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (req.member && !req.member.verified) {
    reply.code(403).send({ error: 'Your account is pending validation. Please check back soon.' });
  }
}

export async function requireCommittee(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(req, reply);
  if (!req.member?.isCommittee) {
    reply.code(403).send({ error: 'Committee members only' });
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    member?: { id: number; isCommittee: boolean; isDeleted: boolean; verified: boolean; status: string; suspendedUntil: Date | null };
  }
}
