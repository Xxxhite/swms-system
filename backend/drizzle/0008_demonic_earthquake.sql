CREATE TABLE `indicator_calculation_rules` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`indicator_id` int unsigned NOT NULL,
	`mode` enum('MANUAL','SCENES','VISITS','PEOPLE','STAFF_HOURS') NOT NULL,
	`effective_date` date NOT NULL,
	`revision` int unsigned NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`created_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `indicator_calculation_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `calculation_rule_revision` UNIQUE(`indicator_id`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `outcome_record_links` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`outcome_id` int unsigned NOT NULL,
	`task_id` int unsigned NOT NULL,
	`indicator_id` int unsigned NOT NULL,
	`record_id` int unsigned NOT NULL,
	`draft_snapshot_id` int unsigned,
	`effective_review_id` int unsigned,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `outcome_record_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `outcome_record_links_record_id_unique` UNIQUE(`record_id`),
	CONSTRAINT `outcome_task_indicator` UNIQUE(`task_id`,`indicator_id`)
);
--> statement-breakpoint
CREATE TABLE `outcome_reviews` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`approval_task_id` int unsigned NOT NULL,
	`snapshot_id` int unsigned NOT NULL,
	`record_link_id` int unsigned,
	`reviewer_id` int unsigned NOT NULL,
	`decisions` json NOT NULL,
	`declared_value` varchar(40) NOT NULL,
	`measure` json NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `outcome_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `outcome_reviews_approval_task_id_unique` UNIQUE(`approval_task_id`)
);
--> statement-breakpoint
CREATE TABLE `outcome_snapshots` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`outcome_id` int unsigned NOT NULL,
	`source_version` int unsigned NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	`data` json NOT NULL,
	`created_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `outcome_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_outcomes` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`summary` varchar(4000) NOT NULL DEFAULT '',
	`draft_snapshot_id` int unsigned,
	`summary_status` enum('DRAFT','IN_REVIEW','REJECTED','SUBMITTED') NOT NULL DEFAULT 'DRAFT',
	`effective_summary_snapshot_id` int unsigned,
	`created_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `task_outcomes_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_outcomes_task_id_unique` UNIQUE(`task_id`)
);
--> statement-breakpoint
ALTER TABLE `execution_evidence` MODIFY COLUMN `bound_kind` enum('STAFF','PARTICIPATION','EXCEPTION','OUTCOME');--> statement-breakpoint
ALTER TABLE `indicator_calculation_rules` ADD CONSTRAINT `indicator_calculation_rules_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `indicator_calculation_rules` ADD CONSTRAINT `calc_rule_indicator_fk` FOREIGN KEY (`indicator_id`) REFERENCES `contract_indicators`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_record_links` ADD CONSTRAINT `outcome_record_links_outcome_id_task_outcomes_id_fk` FOREIGN KEY (`outcome_id`) REFERENCES `task_outcomes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_record_links` ADD CONSTRAINT `outcome_record_links_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_record_links` ADD CONSTRAINT `outcome_record_links_indicator_id_contract_indicators_id_fk` FOREIGN KEY (`indicator_id`) REFERENCES `contract_indicators`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_record_links` ADD CONSTRAINT `outcome_record_links_record_id_service_records_id_fk` FOREIGN KEY (`record_id`) REFERENCES `service_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_record_links` ADD CONSTRAINT `outcome_record_links_draft_snapshot_id_outcome_snapshots_id_fk` FOREIGN KEY (`draft_snapshot_id`) REFERENCES `outcome_snapshots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_reviews` ADD CONSTRAINT `outcome_reviews_approval_task_id_approval_tasks_id_fk` FOREIGN KEY (`approval_task_id`) REFERENCES `approval_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_reviews` ADD CONSTRAINT `outcome_reviews_snapshot_id_outcome_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `outcome_snapshots`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_reviews` ADD CONSTRAINT `outcome_reviews_record_link_id_outcome_record_links_id_fk` FOREIGN KEY (`record_link_id`) REFERENCES `outcome_record_links`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_reviews` ADD CONSTRAINT `outcome_reviews_reviewer_id_users_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_snapshots` ADD CONSTRAINT `outcome_snapshots_outcome_id_task_outcomes_id_fk` FOREIGN KEY (`outcome_id`) REFERENCES `task_outcomes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `outcome_snapshots` ADD CONSTRAINT `outcome_snapshots_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_outcomes` ADD CONSTRAINT `task_outcomes_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_outcomes` ADD CONSTRAINT `task_outcomes_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;