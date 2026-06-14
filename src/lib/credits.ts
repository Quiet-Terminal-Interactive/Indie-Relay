import { db } from '../db/client.js';
import { members, creditTransactions } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const CREDIT_CAP    = 20;
export const STARTER_GRANT = 2;
export const INVITE_BONUS  = 3;

export const PROMO_VALUES: Record<string, number> = {
  social_shoutout:    1,
  community_crosspost: 1,
  short_form_video:   2,
  livestream:         3,
  long_form_video:    5,
  press_feature:      5,
};

export function loyaltyMultiplier(activeMonths: number): number {
  if (activeMonths >= 12) return 1.5;
  if (activeMonths >= 6)  return 1.25;
  return 1.0;
}

export async function awardCredits(
  memberId: number,
  amount: number,
  reason: string,
  relatedClaimId?: number,
): Promise<void> {
  db.transaction((tx) => {
    const [member] = tx
      .select({ balance: members.creditBalance })
      .from(members)
      .where(eq(members.id, memberId))
      .all();

    if (!member) throw new Error('Member not found');

    const newBalance  = Math.min(member.balance + amount, CREDIT_CAP);
    const actualDelta = newBalance - member.balance;

    tx.update(members)
      .set({ creditBalance: newBalance })
      .where(eq(members.id, memberId))
      .run();

    tx.insert(creditTransactions)
      .values({ memberId, amount: actualDelta, balanceAfter: newBalance, reason, relatedClaimId })
      .run();
  });
}

export async function spendCredits(
  memberId: number,
  amount: number,
  reason: string,
  relatedClaimId?: number,
): Promise<void> {
  db.transaction((tx) => {
    const [member] = tx
      .select({ balance: members.creditBalance })
      .from(members)
      .where(eq(members.id, memberId))
      .all();

    if (!member) throw new Error('Member not found');
    if (member.balance < amount) throw new Error('Insufficient credits');

    const newBalance = member.balance - amount;

    tx.update(members)
      .set({ creditBalance: newBalance })
      .where(eq(members.id, memberId))
      .run();

    tx.insert(creditTransactions)
      .values({ memberId, amount: -amount, balanceAfter: newBalance, reason, relatedClaimId })
      .run();
  });
}

export async function earnFromClaim(
  promoterId: number,
  activeMonths: number,
  baseValue: number,
  claimId: number,
  reason: string,
): Promise<void> {
  const multiplier = loyaltyMultiplier(activeMonths);
  const earned     = Math.round(baseValue * multiplier);
  await awardCredits(promoterId, earned, reason, claimId);
}
