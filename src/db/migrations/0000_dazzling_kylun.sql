CREATE TABLE `committee_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`claim_id` integer NOT NULL,
	`priority` text DEFAULT 'routine' NOT NULL,
	`category` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`resolved_by` integer,
	FOREIGN KEY (`claim_id`) REFERENCES `promo_claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `committee_queue_priority_idx` ON `committee_queue` (`priority`);--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`related_claim_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_claim_id`) REFERENCES `promo_claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `credit_tx_member_idx` ON `credit_transactions` (`member_id`);--> statement-breakpoint
CREATE TABLE `invite_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`creator_id` integer NOT NULL,
	`code` text NOT NULL,
	`used_by` integer,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_codes_code_unique` ON `invite_codes` (`code`);--> statement-breakpoint
CREATE TABLE `member_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `member_flags_member_idx` ON `member_flags` (`member_id`);--> statement-breakpoint
CREATE TABLE `member_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_id` integer NOT NULL,
	`promo_type` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_subscriptions_unique` ON `member_subscriptions` (`member_id`,`promo_type`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`member_type` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`verification_url` text,
	`credit_balance` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`active_months` integer DEFAULT 0 NOT NULL,
	`is_committee` integer DEFAULT false NOT NULL,
	`inactivity_warnings_sent` integer DEFAULT 0 NOT NULL,
	`marked_inactive_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `promo_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`promoter_id` integer NOT NULL,
	`proof_url` text NOT NULL,
	`platform` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`claimed_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`request_id`) REFERENCES `promo_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`promoter_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `promo_claims_request_idx` ON `promo_claims` (`request_id`);--> statement-breakpoint
CREATE INDEX `promo_claims_promoter_idx` ON `promo_claims` (`promoter_id`);--> statement-breakpoint
CREATE TABLE `promo_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requester_id` integer NOT NULL,
	`game_name` text NOT NULL,
	`game_url` text,
	`promo_type` text NOT NULL,
	`credits_offered` integer NOT NULL,
	`description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`requester_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `promo_requests_requester_idx` ON `promo_requests` (`requester_id`);--> statement-breakpoint
CREATE INDEX `promo_requests_status_idx` ON `promo_requests` (`status`);