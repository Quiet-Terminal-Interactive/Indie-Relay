import { db } from '../db/client.js';
import { memberFlags, promoClaims, promoRequests, members } from '../db/schema.js';
import { eq, and, count } from 'drizzle-orm';

const FLAG_MIN_RECEIVED = 4;
const FLAG_RATIO = 2;
const FLAGS_TO_REMOVAL = 3;

export async function checkAndFlagMember(memberId: number): Promise<void> {
  const receivedRows = await db
    .select({ n: count() })
    .from(promoClaims)
    .innerJoin(promoRequests, eq(promoClaims.requestId, promoRequests.id))
    .where(
      and(
        eq(promoRequests.requesterId, memberId),
        eq(promoClaims.status, 'approved'),
      ),
    );

  const givenRows = await db
    .select({ n: count() })
    .from(promoClaims)
    .where(
      and(
        eq(promoClaims.promoterId, memberId),
        eq(promoClaims.status, 'approved'),
      ),
    );

  const r = Number(receivedRows[0]?.n ?? 0);
  const g = Number(givenRows[0]?.n ?? 0);

  if (r >= FLAG_MIN_RECEIVED && g > 0 && r / g >= FLAG_RATIO) {
    await db.insert(memberFlags).values({
      memberId,
      reason: `Extraction ratio: ${r} received / ${g} given`,
    });

    const [flagCount] = await db
      .select({ n: count() })
      .from(memberFlags)
      .where(eq(memberFlags.memberId, memberId));

    if (Number(flagCount?.n ?? 0) >= FLAGS_TO_REMOVAL) {
      await db
        .update(members)
        .set({ isDeleted: true, deletedAt: new Date() })
        .where(eq(members.id, memberId));
    }
  }
}
