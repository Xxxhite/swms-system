CREATE TABLE `management_followup_events` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`followup_id` int unsigned NOT NULL,
	`actor_id` int unsigned NOT NULL,
	`action` varchar(32) NOT NULL,
	`note` varchar(2000) NOT NULL,
	`before_data` json,
	`after_data` json,
	`request_key` varchar(64) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `management_followup_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `management_event_key` UNIQUE(`followup_id`,`request_key`)
);
--> statement-breakpoint
CREATE TABLE `management_followups` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`team_id` int unsigned,
	`title` varchar(150) NOT NULL,
	`description` varchar(2000) NOT NULL,
	`source_type` enum('PROJECT','INDICATOR','PLAN','TASK','RECORD') NOT NULL,
	`source_id` int unsigned NOT NULL,
	`owner_id` int unsigned NOT NULL,
	`due_date` date NOT NULL,
	`status` enum('OPEN','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'OPEN',
	`result` varchar(2000) NOT NULL DEFAULT '',
	`completed_by` int unsigned,
	`completed_at` datetime(3),
	`created_by` int unsigned NOT NULL,
	`request_key` varchar(64) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `management_followups_id` PRIMARY KEY(`id`),
	CONSTRAINT `management_creation_key` UNIQUE(`created_by`,`request_key`)
);
--> statement-breakpoint
ALTER TABLE `management_followup_events` ADD CONSTRAINT `management_followup_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `management_followup_events` ADD CONSTRAINT `management_event_followup_fk` FOREIGN KEY (`followup_id`) REFERENCES `management_followups`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `management_followups` ADD CONSTRAINT `management_followups_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `management_followups` ADD CONSTRAINT `management_followups_team_id_organizations_id_fk` FOREIGN KEY (`team_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `management_followups` ADD CONSTRAINT `management_followups_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `management_followups` ADD CONSTRAINT `management_followups_completed_by_users_id_fk` FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `management_followups` ADD CONSTRAINT `management_followups_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `management_scope_due` ON `management_followups` (`project_id`,`team_id`,`owner_id`,`status`,`due_date`);