CREATE TABLE `service_task_feedback` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`task_id` int unsigned NOT NULL,
	`satisfied_count` int unsigned NOT NULL,
	`neutral_count` int unsigned NOT NULL,
	`dissatisfied_count` int unsigned NOT NULL,
	`source` enum('PAPER','ORAL','PHONE','OTHER') NOT NULL,
	`source_note` varchar(500) NOT NULL DEFAULT '',
	`feedback_date` date NOT NULL,
	`suggestions` varchar(2000) NOT NULL DEFAULT '',
	`status` enum('ACTIVE','VOID') NOT NULL DEFAULT 'ACTIVE',
	`void_reason` varchar(1000) NOT NULL DEFAULT '',
	`created_by` int unsigned NOT NULL,
	`updated_by` int unsigned NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `service_task_feedback_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_feedback_unique` UNIQUE(`task_id`)
);
--> statement-breakpoint
ALTER TABLE `resource_cooperations` ADD `feedback_rating` enum('SATISFIED','GENERAL','NEEDS_IMPROVEMENT');--> statement-breakpoint
ALTER TABLE `resource_cooperations` ADD `feedback_by` int unsigned;--> statement-breakpoint
ALTER TABLE `resource_cooperations` ADD `feedback_at` datetime(3);--> statement-breakpoint
ALTER TABLE `service_task_feedback` ADD CONSTRAINT `service_task_feedback_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_feedback` ADD CONSTRAINT `service_task_feedback_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_task_feedback` ADD CONSTRAINT `task_feedback_task_fk` FOREIGN KEY (`task_id`) REFERENCES `service_tasks`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resource_cooperations` ADD CONSTRAINT `resource_cooperations_feedback_by_users_id_fk` FOREIGN KEY (`feedback_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;