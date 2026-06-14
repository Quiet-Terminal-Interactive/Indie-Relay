import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../db/client.js';
import { members } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const [,, email, password] = process.argv;

if (!email) {
  console.error('Usage: tsx src/scripts/make-committee.ts <email> [password]');
  process.exit(1);
}

const existing = db.select().from(members).where(eq(members.email, email.toLowerCase())).all();

if (existing.length > 0) {
  db.update(members)
    .set({ isCommittee: true, verified: true })
    .where(eq(members.email, email.toLowerCase()))
    .run();
  console.log(`✓ ${email} is now a committee member (existing account promoted).`);
} else {
  if (!password) {
    console.error(`No account found for ${email}. Provide a password to create one.`);
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  db.insert(members)
    .values({
      email: email.toLowerCase(),
      passwordHash: hash,
      name: email.split('@')[0],
      memberType: 'dev',
      verified: true,
      isCommittee: true,
      creditBalance: 2,
    })
    .run();
  console.log(`✓ Committee account created for ${email}. Log in and update your profile name.`);
}
