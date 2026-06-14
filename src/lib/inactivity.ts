import cron from 'node-cron';
import { db } from '../db/client.js';
import { members, promoClaims, promoRequests } from '../db/schema.js';
import { eq, and, lt, isNull, isNotNull } from 'drizzle-orm';
import { sendEmail } from './email.js';
import { awardCredits } from './credits.js';

const TWO_MONTHS_MS  = 60 * 24 * 60 * 60 * 1000;
const SIX_WEEKS_MS   = 42 * 24 * 60 * 60 * 1000;

export function startInactivityJob(): void {
  cron.schedule('0 2 * * *', () => { runInactivityCheck().catch(console.error); });
}

async function runInactivityCheck(): Promise<void> {
  const now            = new Date();
  const twoMonthsAgo  = new Date(now.getTime() - TWO_MONTHS_MS);
  const deletionCutoff = new Date(now.getTime() - TWO_MONTHS_MS - SIX_WEEKS_MS);

  const toMarkInactive = await db
    .select({ id: members.id, email: members.email, name: members.name })
    .from(members)
    .where(
      and(
        eq(members.isDeleted, false),
        isNull(members.markedInactiveAt),
        lt(members.lastActiveAt, twoMonthsAgo),
      ),
    );

  for (const member of toMarkInactive) {
    await db
      .update(members)
      .set({ markedInactiveAt: now, inactivityWarningsSent: 0 })
      .where(eq(members.id, member.id));

    await autoApprovePendingClaims(member.id);
    await sendEmail(member.email, 'Indie Relay — inactivity notice', inactivityEmail(member.name, 6));
  }

  const inactive = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.isDeleted, false),
        isNotNull(members.markedInactiveAt),
      ),
    );

  for (const member of inactive) {
    if (!member.markedInactiveAt || member.inactivityWarningsSent >= 6) continue;

    const weeksSince = Math.floor(
      (now.getTime() - member.markedInactiveAt.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );

    if (weeksSince > member.inactivityWarningsSent) {
      const weeksLeft = 6 - member.inactivityWarningsSent - 1;
      await sendEmail(member.email, 'Indie Relay — reminder', inactivityEmail(member.name, weeksLeft));
      await db
        .update(members)
        .set({ inactivityWarningsSent: member.inactivityWarningsSent + 1 })
        .where(eq(members.id, member.id));
    }
  }

  const toDelete = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.isDeleted, false),
        isNotNull(members.markedInactiveAt),
        lt(members.markedInactiveAt, deletionCutoff),
      ),
    );

  for (const { id } of toDelete) {
    await db
      .update(members)
      .set({ isDeleted: true, deletedAt: now })
      .where(eq(members.id, id));
  }
}

async function autoApprovePendingClaims(requesterId: number): Promise<void> {
  const pending = await db
    .select({ id: promoClaims.id, promoterId: promoClaims.promoterId })
    .from(promoClaims)
    .innerJoin(promoRequests, eq(promoClaims.requestId, promoRequests.id))
    .where(
      and(
        eq(promoRequests.requesterId, requesterId),
        eq(promoClaims.status, 'pending'),
      ),
    );

  for (const claim of pending) {
    await db
      .update(promoClaims)
      .set({ status: 'auto_approved', resolvedAt: new Date() })
      .where(eq(promoClaims.id, claim.id));

    await awardCredits(claim.promoterId, 1, 'Auto-approved: requester inactive (50% rate)', claim.id);
  }
}

function inactivityEmail(name: string, weeksLeft: number): string {
  return `Hi ${name},\n\nYour Indie Relay account has been inactive. You have ${weeksLeft} week(s) remaining before your account and personal data are deleted in line with our retention policy.\n\nLog in at any time to keep your account active.\n\nThe Indie Relay Committee`;
}
