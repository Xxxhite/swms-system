CREATE TABLE `organizations` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`parent_id` int unsigned,
	`code` varchar(32) NOT NULL,
	`name` varchar(100) NOT NULL,
	`type` enum('HEADQUARTERS','DEPARTMENT','TEAM') NOT NULL,
	`status` enum('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`code` varchar(100) NOT NULL,
	`module` varchar(50) NOT NULL,
	`resource` varchar(50) NOT NULL,
	`action` varchar(32) NOT NULL,
	`name` varchar(100) NOT NULL,
	CONSTRAINT `permissions_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` int unsigned NOT NULL,
	`permission_code` varchar(100) NOT NULL,
	CONSTRAINT `role_permissions_role_id_permission_code_pk` PRIMARY KEY(`role_id`,`permission_code`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(1000) NOT NULL DEFAULT '',
	`status` enum('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
	`built_in` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `user_extra_permissions` (
	`user_id` int unsigned NOT NULL,
	`permission_code` varchar(100) NOT NULL,
	CONSTRAINT `user_extra_permissions_user_id_permission_code_pk` PRIMARY KEY(`user_id`,`permission_code`)
);
--> statement-breakpoint
CREATE TABLE `user_managed_orgs` (
	`user_id` int unsigned NOT NULL,
	`org_id` int unsigned NOT NULL,
	CONSTRAINT `user_managed_orgs_user_id_org_id_pk` PRIMARY KEY(`user_id`,`org_id`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` int unsigned NOT NULL,
	`role_id` int unsigned NOT NULL,
	CONSTRAINT `user_roles_user_id_role_id_pk` PRIMARY KEY(`user_id`,`role_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`username` varchar(32) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(50) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`arrival_date` date NOT NULL,
	`major` varchar(100) NOT NULL,
	`social_worker_no` varchar(100),
	`service_field_code` varchar(100),
	`proposed_position` varchar(100) NOT NULL,
	`proposed_team` varchar(100),
	`org_id` int unsigned,
	`position_code` varchar(32),
	`education` varchar(100) NOT NULL,
	`political_status` varchar(100) NOT NULL,
	`supervisor_id` int unsigned,
	`data_scope` enum('SELF','TEAM','SUBTREE','ALL') NOT NULL DEFAULT 'SELF',
	`status` enum('PENDING','REJECTED','ACTIVE','DISABLED','LEFT') NOT NULL DEFAULT 'PENDING',
	`review_comment` varchar(1000),
	`reviewed_by` int unsigned,
	`reviewed_at` datetime(3),
	`auth_version` int unsigned NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`actor_id` int unsigned,
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(50) NOT NULL,
	`entity_id` int unsigned,
	`before_data` json,
	`after_data` json,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_parent_id_organizations_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_code_permissions_code_fk` FOREIGN KEY (`permission_code`) REFERENCES `permissions`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_extra_permissions` ADD CONSTRAINT `user_extra_permissions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_extra_permissions` ADD CONSTRAINT `user_extra_permissions_permission_code_permissions_code_fk` FOREIGN KEY (`permission_code`) REFERENCES `permissions`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_managed_orgs` ADD CONSTRAINT `user_managed_orgs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_managed_orgs` ADD CONSTRAINT `user_managed_orgs_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_org_id_organizations_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_supervisor_id_users_id_fk` FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;