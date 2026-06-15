import {
  sqliteTable, integer, text, uniqueIndex, index,
} from 'drizzle-orm/sqlite-core';

export const members = sqliteTable('members', {
  id:                     integer('id').primaryKey({ autoIncrement: true }),
  email:                  text('email').notNull().unique(),
  passwordHash:           text('password_hash').notNull(),
  name:                   text('name').notNull(),
  memberType:             text('member_type', { enum: ['dev','creator','streamer','press'] }).notNull(),
  verified:               integer('verified', { mode: 'boolean' }).default(false).notNull(),
  verificationUrl:        text('verification_url'),
  creditBalance:          integer('credit_balance').default(2).notNull(),
  createdAt:              integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  lastActiveAt:           integer('last_active_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  isDeleted:              integer('is_deleted', { mode: 'boolean' }).default(false).notNull(),
  deletedAt:              integer('deleted_at', { mode: 'timestamp_ms' }),
  activeMonths:           integer('active_months').default(0).notNull(),
  isCommittee:            integer('is_committee', { mode: 'boolean' }).default(false).notNull(),
  status:                 text('status', { enum: ['active','suspended','banned'] }).default('active').notNull(),
  suspendedUntil:         integer('suspended_until', { mode: 'timestamp_ms' }),
  inactivityWarningsSent: integer('inactivity_warnings_sent').default(0).notNull(),
  markedInactiveAt:       integer('marked_inactive_at', { mode: 'timestamp_ms' }),
});

export const promoRequests = sqliteTable('promo_requests', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  requesterId:    integer('requester_id').references(() => members.id).notNull(),
  gameName:       text('game_name').notNull(),
  gameUrl:        text('game_url'),
  promoType:      text('promo_type', { enum: ['social_shoutout','community_crosspost','short_form_video','livestream','long_form_video','press_feature'] }).notNull(),
  creditsOffered: integer('credits_offered').notNull(),
  description:    text('description'),
  status:         text('status', { enum: ['open','claimed','completed','cancelled'] }).default('open').notNull(),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index('promo_requests_requester_idx').on(t.requesterId),
  index('promo_requests_status_idx').on(t.status),
]);

export const promoClaims = sqliteTable('promo_claims', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  requestId:   integer('request_id').references(() => promoRequests.id).notNull(),
  promoterId:  integer('promoter_id').references(() => members.id).notNull(),
  proofUrl:    text('proof_url').notNull(),
  platform:    text('platform'),
  status:      text('status', { enum: ['pending','approved','disputed','committee','auto_approved'] }).default('pending').notNull(),
  claimedAt:   integer('claimed_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  resolvedAt:  integer('resolved_at', { mode: 'timestamp_ms' }),
}, (t) => [
  index('promo_claims_request_idx').on(t.requestId),
  index('promo_claims_promoter_idx').on(t.promoterId),
]);

export const creditTransactions = sqliteTable('credit_transactions', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  memberId:       integer('member_id').references(() => members.id).notNull(),
  amount:         integer('amount').notNull(),
  balanceAfter:   integer('balance_after').notNull(),
  reason:         text('reason').notNull(),
  relatedClaimId: integer('related_claim_id').references(() => promoClaims.id),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index('credit_tx_member_idx').on(t.memberId),
]);

export const inviteCodes = sqliteTable('invite_codes', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  creatorId: integer('creator_id').references(() => members.id).notNull(),
  code:      text('code').notNull().unique(),
  usedBy:    integer('used_by').references(() => members.id),
  usedAt:    integer('used_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
});

export const memberSubscriptions = sqliteTable('member_subscriptions', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  memberId:  integer('member_id').references(() => members.id).notNull(),
  promoType: text('promo_type', { enum: ['social_shoutout','community_crosspost','short_form_video','livestream','long_form_video','press_feature'] }).notNull(),
}, (t) => [
  uniqueIndex('member_subscriptions_unique').on(t.memberId, t.promoType),
]);

export const committeeQueue = sqliteTable('committee_queue', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  claimId:    integer('claim_id').references(() => promoClaims.id).notNull(),
  priority:   text('priority', { enum: ['dispute','routine','suggestion'] }).default('routine').notNull(),
  category:   text('category'),
  notes:      text('notes'),
  createdAt:  integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  resolvedBy: integer('resolved_by').references(() => members.id),
}, (t) => [
  index('committee_queue_priority_idx').on(t.priority),
]);

export const memberFlags = sqliteTable('member_flags', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  memberId:  integer('member_id').references(() => members.id).notNull(),
  reason:    text('reason').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index('member_flags_member_idx').on(t.memberId),
]);

export const oauthVerifications = sqliteTable('oauth_verifications', {
  id:               text('id').primaryKey(),
  platform:         text('platform', { enum: ['twitch','youtube','tiktok'] }).notNull(),
  platformUserId:   text('platform_user_id').notNull(),
  platformUsername: text('platform_username').notNull(),
  platformUrl:      text('platform_url').notNull(),
  expiresAt:        integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt:           integer('used_at', { mode: 'timestamp_ms' }),
  createdAt:        integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
});

export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  memberId:  integer('member_id').references(() => members.id).notNull(),
  token:     text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt:    integer('used_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index('prt_member_idx').on(t.memberId),
]);

export const committeeAuditLog = sqliteTable('committee_audit_log', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  committeeId:    integer('committee_id').references(() => members.id).notNull(),
  action:          text('action', { enum: ['ban','unban','suspend','unsuspend','approve_member','reject_member','approve_claim','reject_claim','partial_claim','cancel_request','force_approve_claim','force_reject_claim'] }).notNull(),
  targetMemberId:  integer('target_member_id').references(() => members.id),
  targetClaimId:   integer('target_claim_id').references(() => promoClaims.id),
  targetRequestId: integer('target_request_id').references(() => promoRequests.id),
  reason:         text('reason'),
  createdAt:      integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index('audit_log_committee_idx').on(t.committeeId),
  index('audit_log_target_member_idx').on(t.targetMemberId),
]);
