import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { db } from '../db/client.js';
import { members, inviteCodes } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { signToken } from '../middleware/auth.js';
import { awardCredits, STARTER_GRANT, INVITE_BONUS } from '../lib/credits.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/signup', async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { email, password, name, memberType, verificationUrl, inviteCode } = body as {
      email?: string;
      password?: string;
      name?: string;
      memberType?: string;
      verificationUrl?: string;
      inviteCode?: string;
    };

    const VALID_TYPES = ['dev', 'creator', 'streamer', 'press'];
    const errors: string[] = [];

    if (!name?.trim()) errors.push('Name is required');
    else if (name.trim().length > 100) errors.push('Name must be 100 characters or fewer');

    if (!email?.trim()) errors.push('Email is required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push('Enter a valid email address');

    if (!password) errors.push('Password is required');
    else if (password.length < 8) errors.push('Password must be at least 8 characters');
    else if (password.length > 128) errors.push('Password must be 128 characters or fewer');

    if (!memberType) errors.push('Select your member type');
    else if (!VALID_TYPES.includes(memberType)) errors.push('Invalid member type');

    if (errors.length > 0) {
      return reply.code(400).send({ error: errors[0] });
    }

    const cleanEmail      = email!.trim().toLowerCase();
    const cleanName       = name!.trim();
    const cleanPassword   = password!;
    const cleanMemberType = memberType as 'dev' | 'creator' | 'streamer' | 'press';

    const existing = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.email, cleanEmail))
      .limit(1);

    if (existing.length > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 12);

    const [member] = await db
      .insert(members)
      .values({
        email: cleanEmail,
        passwordHash,
        name: cleanName,
        memberType: cleanMemberType,
        verificationUrl,
        creditBalance: 0,
      })
      .returning({ id: members.id, isCommittee: members.isCommittee });

    await awardCredits(member.id, STARTER_GRANT, 'Starter grant for new members');

    if (inviteCode) {
      const [invite] = await db
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.code, inviteCode))
        .limit(1);

      if (invite && !invite.usedBy) {
        await db
          .update(inviteCodes)
          .set({ usedBy: member.id, usedAt: new Date() })
          .where(eq(inviteCodes.id, invite.id));

        await awardCredits(member.id, INVITE_BONUS, 'Invite code bonus');
        await awardCredits(invite.creatorId, INVITE_BONUS, 'Invite code bonus — your referral joined');
      }
    }

    const token = await signToken({ memberId: member.id, isCommittee: member.isCommittee });
    return reply.code(201).send({ token, memberId: member.id });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = req.body as Record<string, unknown> | null;
    const email    = typeof body?.email    === 'string' ? body.email.trim()    : '';
    const password = typeof body?.password === 'string' ? body.password        : '';

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Enter a valid email address' });
    }

    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.email, email.toLowerCase()))
      .limit(1);

    if (!member || member.isDeleted) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, member.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = await signToken({ memberId: member.id, isCommittee: member.isCommittee });
    return reply.send({ token, memberId: member.id, isCommittee: member.isCommittee });
  });
}
