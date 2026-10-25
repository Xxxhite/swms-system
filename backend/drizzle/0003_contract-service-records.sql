CREATE TABLE `headquarters_projects` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(150) NOT NULL,
	`category` enum('HEADQUARTERS','FUND') NOT NULL,
	`owner_org_id` int unsigned NOT NULL,
	`director_id` int unsigned NOT NULL,
	`legacy_project_id` int unsigned,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `headquarters_projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `headquarters_projects_code_unique` UNIQUE(`code`),
	CONSTRAINT `headquarters_projects_legacy_project_id_unique` UNIQUE(`legacy_project_id`)
);
--> statement-breakpoint
CREATE TABLE `contract_contracts` (
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
	CONSTRAINT `contract_contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contract_contracts_project_id_unique` UNIQUE(`project_id`)
);
--> statement-breakpoint
CREATE TABLE `contract_memberships` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`team_id` int unsigned NOT NULL,
	`user_id` int unsigned NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `contract_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `membership_project_user` UNIQUE(`project_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `contract_service_points` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`name` varchar(100) NOT NULL,
	`address` varchar(255),
	`note` varchar(1000),
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `contract_service_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_teams` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`team_id` int unsigned NOT NULL,
	`reporter_id` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `contract_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_team_unique` UNIQUE(`project_id`,`team_id`)
);
--> statement-breakpoint
CREATE TABLE `contract_projects` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(150) NOT NULL,
	`category` enum('CONTRACT_PACKAGE') NOT NULL DEFAULT 'CONTRACT_PACKAGE',
	`owner_org_id` int unsigned NOT NULL,
	`director_id` int unsigned NOT NULL,
	`senior_director_id` int unsigned NOT NULL,
	`supervisor_id` int unsigned,
	`sub_field_codes` json NOT NULL,
	`brand_codes` json NOT NULL,
	`service_field_code` varchar(100) NOT NULL,
	`status` enum('DRAFT','ACTIVE') NOT NULL DEFAULT 'DRAFT',
	`created_by` int unsigned NOT NULL,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `contract_projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `contract_projects_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `service_records` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`indicator_id` int unsigned NOT NULL,
	`team_id` int unsigned NOT NULL,
	`service_date` date,
	`request_key` varchar(64),
	`legacy_report_id` int unsigned,
	`month` char(7) NOT NULL,
	`actual_value` decimal(12,2) NOT NULL,
	`note` varchar(1000),
	`status` enum('DRAFT','IN_REVIEW','REJECTED','SUBMITTED','VOID') NOT NULL DEFAULT 'DRAFT',
	`created_by` int unsigned NOT NULL,
	`submitted_by` int unsigned,
	`submitted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `service_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_records_legacy_report_id_unique` UNIQUE(`legacy_report_id`),
	CONSTRAINT `service_request_unique` UNIQUE(`created_by`,`request_key`)
);
--> statement-breakpoint
CREATE TABLE `contract_indicators` (
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
	CONSTRAINT `contract_indicators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_targets` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`indicator_id` int unsigned NOT NULL,
	`team_id` int unsigned NOT NULL,
	`target_value` decimal(12,2) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `contract_targets_id` PRIMARY KEY(`id`),
	CONSTRAINT `indicator_team_unique` UNIQUE(`indicator_id`,`team_id`)
);
--> statement-breakpoint
CREATE TABLE `service_record_changes` (
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
	CONSTRAINT `service_record_changes_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_record_changes_pending_report_id_unique` UNIQUE(`pending_report_id`)
);
--> statement-breakpoint
CREATE TABLE `contract_files` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`project_id` int unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`storage_key` varchar(100) NOT NULL,
	`size` int unsigned NOT NULL,
	`content_type` varchar(150) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`uploaded_by` int unsigned NOT NULL,
	`deleted_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `contract_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `contract_files_storage_key_unique` UNIQUE(`storage_key`)
);
--> statement-breakpoint
ALTER TABLE `headquarters_projects` ADD CONSTRAINT `headquarters_projects_owner_org_id_organizations_id_fk` FOREIGN KEY (`owner_org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `headquarters_projects` ADD CONSTRAINT `headquarters_projects_director_id_users_id_fk` FOREIGN KEY (`director_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_contracts` ADD CONSTRAINT `contract_contracts_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_memberships` ADD CONSTRAINT `contract_memberships_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_memberships` ADD CONSTRAINT `contract_memberships_team_id_organizations_id_fk` FOREIGN KEY (`team_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_memberships` ADD CONSTRAINT `contract_memberships_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_service_points` ADD CONSTRAINT `contract_service_points_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_teams` ADD CONSTRAINT `contract_teams_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_teams` ADD CONSTRAINT `contract_teams_team_id_organizations_id_fk` FOREIGN KEY (`team_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_teams` ADD CONSTRAINT `contract_teams_reporter_id_users_id_fk` FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_projects` ADD CONSTRAINT `contract_projects_owner_org_id_organizations_id_fk` FOREIGN KEY (`owner_org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_projects` ADD CONSTRAINT `contract_projects_director_id_users_id_fk` FOREIGN KEY (`director_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_projects` ADD CONSTRAINT `contract_projects_senior_director_id_users_id_fk` FOREIGN KEY (`senior_director_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_projects` ADD CONSTRAINT `contract_projects_supervisor_id_users_id_fk` FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_projects` ADD CONSTRAINT `contract_projects_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_records` ADD CONSTRAINT `service_records_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_records` ADD CONSTRAINT `service_records_submitted_by_users_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_records` ADD CONSTRAINT `service_record_target_fk` FOREIGN KEY (`indicator_id`,`team_id`) REFERENCES `contract_targets`(`indicator_id`,`team_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_indicators` ADD CONSTRAINT `contract_indicators_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_targets` ADD CONSTRAINT `contract_targets_indicator_id_contract_indicators_id_fk` FOREIGN KEY (`indicator_id`) REFERENCES `contract_indicators`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_targets` ADD CONSTRAINT `contract_targets_team_id_organizations_id_fk` FOREIGN KEY (`team_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_record_changes` ADD CONSTRAINT `service_record_changes_report_id_service_records_id_fk` FOREIGN KEY (`report_id`) REFERENCES `service_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_record_changes` ADD CONSTRAINT `service_record_changes_applicant_id_users_id_fk` FOREIGN KEY (`applicant_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_record_changes` ADD CONSTRAINT `service_record_changes_pending_report_id_service_records_id_fk` FOREIGN KEY (`pending_report_id`) REFERENCES `service_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_files` ADD CONSTRAINT `contract_files_project_id_contract_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `contract_projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_files` ADD CONSTRAINT `contract_files_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `membership_user_dates` ON `contract_memberships` (`user_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `project_team_reverse` ON `contract_teams` (`team_id`,`project_id`);--> statement-breakpoint
CREATE INDEX `projects_owner_status` ON `contract_projects` (`owner_org_id`,`status`);--> statement-breakpoint
CREATE INDEX `monthly_aggregate` ON `service_records` (`indicator_id`,`team_id`,`status`,`month`);--> statement-breakpoint
CREATE INDEX `indicator_project` ON `contract_indicators` (`project_id`);--> statement-breakpoint
CREATE INDEX `contract_file_project` ON `contract_files` (`project_id`);
--> statement-breakpoint
INSERT INTO `contract_projects` (`id`,`code`,`name`,`category`,`owner_org_id`,`director_id`,`senior_director_id`,`supervisor_id`,`service_field_code`,`sub_field_codes`,`brand_codes`,`status`,`created_by`,`deleted_at`,`created_at`,`updated_at`,`version`)
SELECT p.`id`,p.`code`,p.`name`,'CONTRACT_PACKAGE',p.`owner_org_id`,p.`director_id`,p.`supervisor_id`,CASE WHEN u.`is_supervisor` = true AND u.`position_code` IN ('position-6','position-8','position-9','position-10','position-11') THEN p.`supervisor_id` ELSE NULL END,
CASE p.`service_field_code` WHEN '其他-退役军人' THEN '其他-现退役军人服务' WHEN '其他-场馆' THEN '其他-场馆运营' WHEN '其他-社会福利' THEN '社会福利' WHEN '其他-双百' THEN '其他-双百服务' WHEN '其他-心理' THEN '其他-心理服务' WHEN '纠纷调节' THEN '纠纷调解' ELSE p.`service_field_code` END,
JSON_ARRAY(),JSON_ARRAY(),p.`status`,p.`created_by`,p.`deleted_at`,p.`created_at`,p.`updated_at`,p.`version`
FROM `projects` p JOIN `users` u ON u.`id`=p.`supervisor_id` WHERE p.`category`='CONTRACT_PACKAGE';
--> statement-breakpoint
INSERT INTO `headquarters_projects` (`id`,`code`,`name`,`category`,`owner_org_id`,`director_id`,`legacy_project_id`,`created_at`,`updated_at`,`version`)
SELECT `id`,`code`,`name`,`category`,`owner_org_id`,`director_id`,`id`,`created_at`,`updated_at`,`version` FROM `projects` WHERE `category` IN ('HEADQUARTERS','FUND');
--> statement-breakpoint
INSERT INTO `contract_contracts` SELECT c.* FROM `project_contracts` c JOIN `contract_projects` p ON c.`project_id`=p.`id`;
--> statement-breakpoint
INSERT INTO `contract_service_points` SELECT c.* FROM `project_service_points` c JOIN `contract_projects` p ON c.`project_id`=p.`id`;
--> statement-breakpoint
INSERT INTO `contract_teams` SELECT c.* FROM `project_teams` c JOIN `contract_projects` p ON c.`project_id`=p.`id`;
--> statement-breakpoint
INSERT INTO `contract_indicators` SELECT c.* FROM `project_indicators` c JOIN `contract_projects` p ON c.`project_id`=p.`id`;
--> statement-breakpoint
INSERT INTO `contract_targets` SELECT t.* FROM `team_indicator_targets` t JOIN `contract_indicators` i ON t.`indicator_id`=i.`id`;
--> statement-breakpoint
INSERT INTO `service_records` (`id`,`indicator_id`,`team_id`,`service_date`,`request_key`,`legacy_report_id`,`month`,`actual_value`,`note`,`status`,`created_by`,`submitted_by`,`submitted_at`,`created_at`,`updated_at`,`version`)
SELECT r.`id`,r.`indicator_id`,r.`team_id`,NULL,NULL,r.`id`,r.`month`,r.`actual_value`,r.`note`,r.`status`,r.`created_by`,r.`submitted_by`,r.`submitted_at`,r.`created_at`,r.`updated_at`,r.`version` FROM `monthly_reports` r JOIN `contract_indicators` i ON r.`indicator_id`=i.`id`;
--> statement-breakpoint
INSERT INTO `service_record_changes` SELECT c.* FROM `monthly_report_changes` c JOIN `service_records` r ON c.`report_id`=r.`id`;
--> statement-breakpoint
INSERT INTO `contract_memberships` (`project_id`,`team_id`,`user_id`,`start_date`,`end_date`,`created_at`,`updated_at`,`version`)
SELECT t.`project_id`,t.`team_id`,u.`id`,c.`start_date`,c.`end_date`,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),1
FROM `project_teams` t JOIN `contract_projects` p ON p.`id`=t.`project_id` JOIN `contract_contracts` c ON c.`project_id`=t.`project_id` JOIN `users` u ON u.`org_id`=t.`team_id`;
