CREATE TABLE `resource_contacts` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`resource_id` int unsigned NOT NULL,
	`name` varchar(100) NOT NULL,
	`position` varchar(100) NOT NULL DEFAULT '',
	`phone` varchar(50) NOT NULL DEFAULT '',
	`email` varchar(150) NOT NULL DEFAULT '',
	`note` varchar(1000) NOT NULL DEFAULT '',
	`is_primary` int NOT NULL DEFAULT 0,
	`status` enum('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `resource_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resource_cooperations` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`resource_id` int unsigned NOT NULL,
	`title` varchar(150) NOT NULL,
	`type` enum('MANUAL','CONTRACT') NOT NULL DEFAULT 'MANUAL',
	`project_id` int unsigned,
	`contract_id` int unsigned,
	`owner_id` int unsigned NOT NULL,
	`status` enum('TO_CONTACT','CONTACTING','NEGOTIATING','TO_SIGN','AGREED','ENDED','TERMINATED') NOT NULL DEFAULT 'TO_CONTACT',
	`start_date` varchar(10),
	`end_date` varchar(10),
	`basis` varchar(1000) NOT NULL DEFAULT '',
	`result` varchar(2000) NOT NULL DEFAULT '',
	`feedback` varchar(2000) NOT NULL DEFAULT '',
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `resource_cooperations_id` PRIMARY KEY(`id`),
	CONSTRAINT `resource_contract_source` UNIQUE(`contract_id`)
);
--> statement-breakpoint
CREATE TABLE `resource_followups` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`resource_id` int unsigned NOT NULL,
	`cooperation_id` int unsigned,
	`contact_id` int unsigned,
	`occurred_at` datetime(3) NOT NULL,
	`method` varchar(50) NOT NULL,
	`content` varchar(2000) NOT NULL,
	`result` varchar(2000) NOT NULL DEFAULT '',
	`next_action` varchar(1000) NOT NULL DEFAULT '',
	`next_owner_id` int unsigned,
	`next_due_date` varchar(10),
	`completed` int NOT NULL DEFAULT 0,
	`created_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `resource_followups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resource_merge_records` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`source_id` int unsigned NOT NULL,
	`target_id` int unsigned NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`actor_id` int unsigned NOT NULL,
	`summary` json NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `resource_merge_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `resources` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(150) NOT NULL,
	`normalized_name` varchar(150) NOT NULL,
	`credit_code` varchar(32),
	`unit_type` varchar(50) NOT NULL,
	`region` varchar(100) NOT NULL,
	`address` varchar(255) NOT NULL DEFAULT '',
	`description` text,
	`source` varchar(100) NOT NULL DEFAULT '',
	`capability_codes` json NOT NULL,
	`service_field_codes` json NOT NULL,
	`intention` varchar(1000) NOT NULL DEFAULT '',
	`owner_org_id` int unsigned NOT NULL,
	`maintainer_id` int unsigned NOT NULL,
	`status` enum('ACTIVE','ARCHIVED','MERGED') NOT NULL DEFAULT 'ACTIVE',
	`merged_into_id` int unsigned,
	`created_by` int unsigned NOT NULL,
	`request_key` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `resources_id` PRIMARY KEY(`id`),
	CONSTRAINT `resource_credit_unique` UNIQUE(`credit_code`),
	CONSTRAINT `resource_request_unique` UNIQUE(`created_by`,`request_key`)
);
--> statement-breakpoint
ALTER TABLE `contract_contracts` ADD `resource_id` int unsigned;--> statement-breakpoint
ALTER TABLE `contract_contracts` ADD `partner_contact_snapshot` json;--> statement-breakpoint
ALTER TABLE `resource_contacts` ADD CONSTRAINT `resource_contacts_resource_id_resources_id_fk` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_cooperations` ADD CONSTRAINT `resource_cooperations_resource_id_resources_id_fk` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_cooperations` ADD CONSTRAINT `resource_cooperations_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_followups` ADD CONSTRAINT `resource_followups_resource_id_resources_id_fk` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_followups` ADD CONSTRAINT `resource_followups_cooperation_id_resource_cooperations_id_fk` FOREIGN KEY (`cooperation_id`) REFERENCES `resource_cooperations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_followups` ADD CONSTRAINT `resource_followups_contact_id_resource_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `resource_contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_followups` ADD CONSTRAINT `resource_followups_next_owner_id_users_id_fk` FOREIGN KEY (`next_owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_followups` ADD CONSTRAINT `resource_followups_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_merge_records` ADD CONSTRAINT `resource_merge_records_source_id_resources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_merge_records` ADD CONSTRAINT `resource_merge_records_target_id_resources_id_fk` FOREIGN KEY (`target_id`) REFERENCES `resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_merge_records` ADD CONSTRAINT `resource_merge_records_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resources` ADD CONSTRAINT `resources_owner_org_id_organizations_id_fk` FOREIGN KEY (`owner_org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resources` ADD CONSTRAINT `resources_maintainer_id_users_id_fk` FOREIGN KEY (`maintainer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resources` ADD CONSTRAINT `resources_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `cooperation_resource` ON `resource_cooperations` (`resource_id`);--> statement-breakpoint
CREATE INDEX `resource_scope` ON `resources` (`owner_org_id`,`maintainer_id`);--> statement-breakpoint
ALTER TABLE `contract_contracts` ADD CONSTRAINT `contract_contracts_resource_id_resources_id_fk` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE no action ON UPDATE no action;