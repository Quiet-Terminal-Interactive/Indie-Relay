CREATE TABLE `oauth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`platform_user_id` text NOT NULL,
	`platform_username` text NOT NULL,
	`platform_url` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
