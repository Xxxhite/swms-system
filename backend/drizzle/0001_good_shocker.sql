CREATE TABLE `project_contracts` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`contract_no` varchar(100),
	`partner_name` varchar(150) NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`service_area` varchar(100) NOT NULL,
	`note` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `project_contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_contracts_project_id_unique` UNIQUE(`project_id`)
);
--> statement-breakpoint
CREATE TABLE `project_service_points` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`name` varchar(100) NOT NULL,
	`address` varchar(255),
	`note` varchar(1000),
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `project_service_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_teams` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`team_id` int unsigned NOT NULL,
	`reporter_id` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `project_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_team_unique` UNIQUE(`project_id`,`team_id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(150) NOT NULL,
	`category` enum('CONTRACT_PACKAGE','HEADQUARTERS','FUND') NOT NULL,
	`owner_org_id` int unsigned NOT NULL,
	`director_id` int unsigned NOT NULL,
	`supervisor_id` int unsigned NOT NULL,
	`service_field_code` varchar(100) NOT NULL,
	`status` enum('DRAFT','ACTIVE') NOT NULL DEFAULT 'DRAFT',
	`created_by` int unsigned NOT NULL,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `monthly_reports` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`indicator_id` int unsigned NOT NULL,
	`team_id` int unsigned NOT NULL,
	`month` char(7) NOT NULL,
	`actual_value` decimal(12,2) NOT NULL,
	`note` varchar(1000),
	`status` enum('DRAFT','SUBMITTED','VOID') NOT NULL DEFAULT 'DRAFT',
	`created_by` int unsigned NOT NULL,
	`submitted_by` int unsigned,
	`submitted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `monthly_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_slot_unique` UNIQUE(`indicator_id`,`team_id`,`month`)
);
--> statement-breakpoint
CREATE TABLE `project_indicators` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`name` varchar(150) NOT NULL,
	`unit` varchar(20) NOT NULL,
	`definition` text NOT NULL,
	`target_value` decimal(12,2) NOT NULL,
	`status` enum('DRAFT','ACTIVE') NOT NULL DEFAULT 'DRAFT',
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `project_indicators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_indicator_targets` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`indicator_id` int unsigned NOT NULL,
	`team_id` int unsigned NOT NULL,
	`target_value` decimal(12,2) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `team_indicator_targets_id` PRIMARY KEY(`id`),
	CONSTRAINT `indicator_team_unique` UNIQUE(`indicator_id`,`team_id`)
);
--> statement-breakpoint
CREATE TABLE `approval_instances` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`business_type` varchar(32) NOT NULL,
	`business_id` int unsigned NOT NULL,
	`round` int unsigned NOT NULL DEFAULT 1,
	`applicant_id` int unsigned NOT NULL,
	`status` enum('IN_REVIEW','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'IN_REVIEW',
	`current_node_no` int NOT NULL DEFAULT 1,
	`workflow_snapshot` json NOT NULL,
	`business_snapshot` json NOT NULL,
	`completed_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `approval_instances_id` PRIMARY KEY(`id`),
	CONSTRAINT `approval_business_round` UNIQUE(`business_type`,`business_id`,`round`)
);
--> statement-breakpoint
CREATE TABLE `approval_records` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`instance_id` int unsigned NOT NULL,
	`task_id` int unsigned,
	`actor_id` int unsigned NOT NULL,
	`action` enum('SUBMIT','APPROVE','REJECT','WITHDRAW') NOT NULL,
	`comment` varchar(1000),
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `approval_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `approval_tasks` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`instance_id` int unsigned NOT NULL,
	`node_no` int NOT NULL DEFAULT 1,
	`approver_id` int unsigned NOT NULL,
	`status` enum('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`decided_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `approval_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_node_approver` UNIQUE(`instance_id`,`node_no`,`approver_id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_report_changes` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`report_id` int unsigned NOT NULL,
	`operation` enum('CORRECT','DELETE','RESTORE') NOT NULL,
	`report_version` int unsigned NOT NULL,
	`before_value` varchar(32) NOT NULL,
	`before_status` varchar(20) NOT NULL,
	`proposed_value` varchar(32) NOT NULL,
	`proposed_note` varchar(1000),
	`reason` varchar(1000) NOT NULL,
	`applicant_id` int unsigned NOT NULL,
	`pending_report_id` int unsigned,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `monthly_report_changes_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_report_changes_pending_report_id_unique` UNIQUE(`pending_report_id`)
);
--> statement-breakpoint
ALTER TABLE `project_contracts` ADD CONSTRAINT `project_contracts_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_service_points` ADD CONSTRAINT `project_service_points_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_teams` ADD CONSTRAINT `project_teams_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_teams` ADD CONSTRAINT `project_teams_team_id_organizations_id_fk` FOREIGN KEY (`team_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_teams` ADD CONSTRAINT `project_teams_reporter_id_users_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_owner_org_id_organizations_id_fk` FOREIGN KEY (`owner_org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_director_id_users_id_fk` FOREIGN KEY (`director_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_supervisor_id_users_id_fk` FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthly_reports` ADD CONSTRAINT `monthly_reports_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthly_reports` ADD CONSTRAINT `monthly_reports_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthly_reports` ADD CONSTRAINT `monthly_target_fk` FOREIGN KEY (`indicator_id`,`team_id`) REFERENCES `team_indicator_targets`(`indicator_id`,`team_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_indicators` ADD CONSTRAINT `project_indicators_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_indicator_targets` ADD CONSTRAINT `team_indicator_targets_indicator_id_project_indicators_id_fk` FOREIGN KEY (`indicator_id`) REFERENCES `project_indicators`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_indicator_targets` ADD CONSTRAINT `team_indicator_targets_team_id_organizations_id_fk` FOREIGN KEY (`team_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_instances` ADD CONSTRAINT `approval_instances_applicant_id_users_id_fk` FOREIGN KEY (`applicant_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_records` ADD CONSTRAINT `approval_records_instance_id_approval_instances_id_fk` FOREIGN KEY (`instance_id`) REFERENCES `approval_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_records` ADD CONSTRAINT `approval_records_task_id_approval_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `approval_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_records` ADD CONSTRAINT `approval_records_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_tasks` ADD CONSTRAINT `approval_tasks_instance_id_approval_instances_id_fk` FOREIGN KEY (`instance_id`) REFERENCES `approval_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_tasks` ADD CONSTRAINT `approval_tasks_approver_id_users_id_fk` FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthly_report_changes` ADD CONSTRAINT `monthly_report_changes_report_id_monthly_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `monthly_reports`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthly_report_changes` ADD CONSTRAINT `monthly_report_changes_applicant_id_users_id_fk` FOREIGN KEY (`applicant_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `monthly_report_changes` ADD CONSTRAINT `monthly_report_changes_pending_report_id_monthly_reports_id_fk` FOREIGN KEY (`pending_report_id`) REFERENCES `monthly_reports`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `project_team_reverse` ON `project_teams` (`team_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `projects_owner_status` ON `projects` (`owner_org_id`,`status`);--> statement-breakpoint
CREATE INDEX `monthly_aggregate` ON `monthly_reports` (`indicator_id`,`team_id`,`status`,`month`);--> statement-breakpoint
CREATE INDEX `indicator_project` ON `project_indicators` (`project_id`);--> statement-breakpoint
CREATE INDEX `task_inbox` ON `approval_tasks` (`approver_id`,`status`);