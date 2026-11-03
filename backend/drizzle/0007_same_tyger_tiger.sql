CREATE TABLE `execution_credentials` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`roster_id` int unsigned NOT NULL,
	`purpose` enum('COLLECTIVE','HOME_CONFIRM') NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`nonce` varchar(64) NOT NULL,
	`task_version` int unsigned NOT NULL,
	`issuer_id` int unsigned NOT NULL,
	`issuer_auth_version` int unsigned NOT NULL,
	`request_key` varchar(64) NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`status` enum('ACTIVE','USED','REVOKED') NOT NULL DEFAULT 'ACTIVE',
	`used_event_id` int unsigned,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `execution_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_credentials_token_hash_unique` UNIQUE(`token_hash`),
	CONSTRAINT `execution_credential_request` UNIQUE(`issuer_id`,`request_key`)
);
--> statement-breakpoint
CREATE TABLE `execution_evidence` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`uploaded_by` int unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`content_type` varchar(100) NOT NULL,
	`size` int unsigned NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`storage_key` varchar(64) NOT NULL,
	`request_key` varchar(64) NOT NULL,
	`bound_kind` enum('STAFF','PARTICIPATION','EXCEPTION'),
	`bound_id` int unsigned,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `execution_evidence_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_evidence_storage_key_unique` UNIQUE(`storage_key`),
	CONSTRAINT `execution_evidence_request` UNIQUE(`uploaded_by`,`request_key`)
);
--> statement-breakpoint
CREATE TABLE `execution_exceptions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`source_key` varchar(150) NOT NULL,
	`code` varchar(60) NOT NULL,
	`owner_id` int unsigned NOT NULL,
	`reviewer_id` int unsigned,
	`source_kind` enum('STAFF','PARTICIPATION','SESSION') NOT NULL,
	`source_id` int unsigned NOT NULL,
	`status` enum('OPEN','EXPLAINED','RESOLVED') NOT NULL DEFAULT 'OPEN',
	`notes` json NOT NULL,
	`resolved_by_event_id` int unsigned,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `execution_exceptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_exception_source` UNIQUE(`task_id`,`source_key`)
);
--> statement-breakpoint
CREATE TABLE `execution_participations` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`roster_id` int unsigned NOT NULL,
	`current_event_id` int unsigned NOT NULL,
	`status` enum('RECORDED','VOID') NOT NULL,
	`requires_review` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `execution_participations_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_participations_roster_id_unique` UNIQUE(`roster_id`)
);
--> statement-breakpoint
CREATE TABLE `execution_policies` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`task_version` int unsigned NOT NULL,
	`settings` json NOT NULL,
	`updated_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `execution_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_policies_task_id_unique` UNIQUE(`task_id`)
);
--> statement-breakpoint
CREATE TABLE `execution_rosters` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`participant_id` int unsigned NOT NULL,
	`created_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `execution_rosters_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_roster_unique` UNIQUE(`task_id`,`participant_id`)
);
--> statement-breakpoint
CREATE TABLE `execution_sessions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`status` enum('IN_PROGRESS','ENDED','STOPPED') NOT NULL,
	`snapshot` json NOT NULL,
	`source_version` int unsigned NOT NULL DEFAULT 1,
	`started_at` datetime(3) NOT NULL,
	`started_by` int unsigned NOT NULL,
	`ended_at` datetime(3),
	`ended_by` int unsigned,
	`stop_reason` varchar(1000),
	`end_request_key` varchar(64),
	`end_fingerprint` varchar(64),
	`stop_request_key` varchar(64),
	`stop_fingerprint` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `execution_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `execution_sessions_task_id_unique` UNIQUE(`task_id`)
);
--> statement-breakpoint
CREATE TABLE `participation_events` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`roster_id` int unsigned NOT NULL,
	`kind` enum('CONFIRM','CORRECT','VOID') NOT NULL,
	`method` enum('SELF','FAMILY','ASSISTED','SUPPLEMENT') NOT NULL,
	`actor_id` int unsigned,
	`credential_id` int unsigned,
	`confirmer_role` enum('SELF','FAMILY','COMPANION','STAFF') NOT NULL,
	`relation` varchar(200) NOT NULL DEFAULT '',
	`reason` varchar(1000) NOT NULL,
	`occurred_at` datetime(3) NOT NULL,
	`received_at` datetime(3) NOT NULL,
	`flags` json NOT NULL,
	`request_key` varchar(64) NOT NULL,
	`request_owner` varchar(60) NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	CONSTRAINT `participation_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `participation_event_request` UNIQUE(`request_owner`,`request_key`)
);
--> statement-breakpoint
CREATE TABLE `service_participants` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`code` varchar(40) NOT NULL,
	`name` varchar(100) NOT NULL,
	`phone` varchar(50) NOT NULL DEFAULT '',
	`status` enum('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
	`created_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `service_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `participant_project_code` UNIQUE(`project_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `staff_execution_events` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`user_id` int unsigned NOT NULL,
	`kind` enum('CHECK_IN','CHECK_OUT') NOT NULL,
	`method` enum('NORMAL','SUPPLEMENT','CORRECTION') NOT NULL,
	`slot_key` varchar(64) NOT NULL,
	`supersedes_id` int unsigned,
	`occurred_at` datetime(3) NOT NULL,
	`declared_at` datetime(3) NOT NULL,
	`received_at` datetime(3) NOT NULL,
	`geo` json NOT NULL,
	`distance` double,
	`flags` json NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`request_key` varchar(64) NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	CONSTRAINT `staff_execution_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_execution_events_supersedes_id_unique` UNIQUE(`supersedes_id`),
	CONSTRAINT `staff_event_request` UNIQUE(`user_id`,`request_key`),
	CONSTRAINT `staff_event_slot` UNIQUE(`task_id`,`user_id`,`kind`,`slot_key`)
);
--> statement-breakpoint
ALTER TABLE `contract_service_points` ADD `latitude` double;--> statement-breakpoint
ALTER TABLE `contract_service_points` ADD `longitude` double;--> statement-breakpoint
ALTER TABLE `contract_service_points` ADD `radius` int unsigned;--> statement-breakpoint
ALTER TABLE `execution_credentials` ADD CONSTRAINT `execution_credentials_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_credentials` ADD CONSTRAINT `execution_credentials_roster_id_execution_rosters_id_fk` FOREIGN KEY (`roster_id`) REFERENCES `execution_rosters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_credentials` ADD CONSTRAINT `execution_credentials_issuer_id_users_id_fk` FOREIGN KEY (`issuer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_evidence` ADD CONSTRAINT `execution_evidence_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_evidence` ADD CONSTRAINT `execution_evidence_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_exceptions` ADD CONSTRAINT `execution_exceptions_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_exceptions` ADD CONSTRAINT `execution_exceptions_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_exceptions` ADD CONSTRAINT `execution_exceptions_reviewer_id_users_id_fk` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_participations` ADD CONSTRAINT `execution_participations_roster_id_execution_rosters_id_fk` FOREIGN KEY (`roster_id`) REFERENCES `execution_rosters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_participations` ADD CONSTRAINT `execution_participation_event_fk` FOREIGN KEY (`current_event_id`) REFERENCES `participation_events`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_policies` ADD CONSTRAINT `execution_policies_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_policies` ADD CONSTRAINT `execution_policies_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_rosters` ADD CONSTRAINT `execution_rosters_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_rosters` ADD CONSTRAINT `execution_rosters_participant_id_service_participants_id_fk` FOREIGN KEY (`participant_id`) REFERENCES `service_participants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_rosters` ADD CONSTRAINT `execution_rosters_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_sessions` ADD CONSTRAINT `execution_sessions_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_sessions` ADD CONSTRAINT `execution_sessions_started_by_users_id_fk` FOREIGN KEY (`started_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `execution_sessions` ADD CONSTRAINT `execution_sessions_ended_by_users_id_fk` FOREIGN KEY (`ended_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `participation_events` ADD CONSTRAINT `participation_events_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `participation_events` ADD CONSTRAINT `participation_events_roster_id_execution_rosters_id_fk` FOREIGN KEY (`roster_id`) REFERENCES `execution_rosters`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `participation_events` ADD CONSTRAINT `participation_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `participation_events` ADD CONSTRAINT `participation_events_credential_id_execution_credentials_id_fk` FOREIGN KEY (`credential_id`) REFERENCES `execution_credentials`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_participants` ADD CONSTRAINT `service_participants_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_participants` ADD CONSTRAINT `service_participants_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_execution_events` ADD CONSTRAINT `staff_execution_events_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staff_execution_events` ADD CONSTRAINT `staff_execution_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `staff_event_task` ON `staff_execution_events` (`task_id`);