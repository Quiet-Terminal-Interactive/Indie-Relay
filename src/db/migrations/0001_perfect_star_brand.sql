CREATE TABLE `committee_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`committee_id` integer NOT NULL,
	`action` text NOT NULL,
	`target_member_id` integer,
	`target_claim_id` integer,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`committee_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_claim_id`) REFERENCES `promo_claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_log_committee_idx` ON `committee_audit_log` (`committee_id`);--> statement-breakpoint
CREATE INDEX `audit_log_target_member_idx` ON `committee_audit_log` (`target_member_id`);--> statement-breakpoint
ALTER TABLE `members` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `suspended_until` integer;