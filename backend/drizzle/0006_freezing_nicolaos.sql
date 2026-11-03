CREATE TABLE `service_plan_periods` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`plan_id` int unsigned NOT NULL,
	`sequence` int unsigned NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`target_value` decimal(12,2) NOT NULL,
	CONSTRAINT `service_plan_periods_id` PRIMARY KEY(`id`),
	CONSTRAINT `plan_period_sequence` UNIQUE(`plan_id`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `service_plan_versions` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`target_id` int unsigned NOT NULL,
	`revision` int unsigned NOT NULL,
	`mode` enum('MONTHLY','MILESTONE') NOT NULL,
	`status` enum('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
	`effective_date` date NOT NULL,
	`target_value` decimal(12,2) NOT NULL,
	`target_version` int unsigned NOT NULL,
	`indicator_version` int unsigned NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`created_by` int unsigned NOT NULL,
	`published_by` int unsigned,
	`published_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `service_plan_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `plan_target_revision` UNIQUE(`target_id`,`revision`)
);
--> statement-breakpoint
CREATE TABLE `service_task_events` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`actor_id` int unsigned NOT NULL,
	`action` varchar(50) NOT NULL,
	`reason` varchar(1000) NOT NULL,
	`before_data` json,
	`after_data` json,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `service_task_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `service_task_indicators` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`indicator_id` int unsigned NOT NULL,
	`target_id` int unsigned NOT NULL,
	`planned_value` decimal(12,2) NOT NULL,
	`plan_id` int unsigned NOT NULL,
	`period_id` int unsigned NOT NULL,
	CONSTRAINT `service_task_indicators_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_indicator_unique` UNIQUE(`task_id`,`indicator_id`)
);
--> statement-breakpoint
CREATE TABLE `service_task_resources` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`resource_id` int unsigned NOT NULL,
	`contact_id` int unsigned,
	`resource_name` varchar(150) NOT NULL,
	`collaboration` varchar(1000) NOT NULL,
	CONSTRAINT `service_task_resources_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_resource_unique` UNIQUE(`task_id`,`resource_id`)
);
--> statement-breakpoint
CREATE TABLE `service_task_staff` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`user_id` int unsigned NOT NULL,
	CONSTRAINT `service_task_staff_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_staff_unique` UNIQUE(`task_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `service_tasks` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`team_id` int unsigned NOT NULL,
	`title` varchar(150) NOT NULL,
	`form` enum('COLLECTIVE','HOME_VISIT','STATIONED') NOT NULL,
	`kind` enum('INDICATOR','OTHER') NOT NULL,
	`point_id` int unsigned,
	`location` varchar(150) NOT NULL,
	`address` varchar(255) NOT NULL,
	`start_at` datetime(3) NOT NULL,
	`end_at` datetime(3) NOT NULL,
	`leader_id` int unsigned NOT NULL,
	`expected_people` int unsigned NOT NULL,
	`description` text NOT NULL,
	`evidence` varchar(1000) NOT NULL,
	`status` enum('SCHEDULED','CANCELED') NOT NULL DEFAULT 'SCHEDULED',
	`source_task_id` int unsigned,
	`created_by` int unsigned NOT NULL,
	`request_key` varchar(64) NOT NULL,
	`batch_index` int unsigned NOT NULL,
	`batch_fingerprint` varchar(64) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `service_tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_request_instance` UNIQUE(`created_by`,`request_key`,`batch_index`)
);
--> statement-breakpoint
ALTER TABLE `service_plan_periods` ADD CONSTRAINT `service_plan_periods_plan_id_service_plan_versions_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `service_plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_plan_versions` ADD CONSTRAINT `service_plan_versions_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_plan_versions` ADD CONSTRAINT `service_plan_versions_target_id_contract_targets_id_fk` FOREIGN KEY (`target_id`) REFERENCES `contract_targets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_plan_versions` ADD CONSTRAINT `service_plan_versions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_plan_versions` ADD CONSTRAINT `service_plan_versions_published_by_users_id_fk` FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_events` ADD CONSTRAINT `service_task_events_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_events` ADD CONSTRAINT `service_task_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_indicators` ADD CONSTRAINT `service_task_indicators_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_indicators` ADD CONSTRAINT `service_task_indicators_indicator_id_contract_indicators_id_fk` FOREIGN KEY (`indicator_id`) REFERENCES `contract_indicators`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_indicators` ADD CONSTRAINT `service_task_indicators_target_id_contract_targets_id_fk` FOREIGN KEY (`target_id`) REFERENCES `contract_targets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_indicators` ADD CONSTRAINT `service_task_indicators_plan_id_service_plan_versions_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `service_plan_versions`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_indicators` ADD CONSTRAINT `service_task_indicators_period_id_service_plan_periods_id_fk` FOREIGN KEY (`period_id`) REFERENCES `service_plan_periods`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_resources` ADD CONSTRAINT `service_task_resources_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_resources` ADD CONSTRAINT `service_task_resources_resource_id_resources_id_fk` FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_resources` ADD CONSTRAINT `service_task_resources_contact_id_resource_contacts_id_fk` FOREIGN KEY (`contact_id`) REFERENCES `resource_contacts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_staff` ADD CONSTRAINT `service_task_staff_task_id_service_tasks_id_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_staff` ADD CONSTRAINT `service_task_staff_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tasks` ADD CONSTRAINT `service_tasks_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tasks` ADD CONSTRAINT `service_tasks_team_id_organizations_id_fk` FOREIGN KEY (`team_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tasks` ADD CONSTRAINT `service_tasks_point_id_contract_service_points_id_fk` FOREIGN KEY (`point_id`) REFERENCES `contract_service_points`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tasks` ADD CONSTRAINT `service_tasks_leader_id_users_id_fk` FOREIGN KEY (`leader_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tasks` ADD CONSTRAINT `service_tasks_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `task_staff_user` ON `service_task_staff` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_schedule` ON `service_tasks` (`project_id`,`team_id`,`start_at`);