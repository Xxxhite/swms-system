ALTER TABLE `service_tasks` ADD `execution_mode` enum('LEGACY','SIMPLE') DEFAULT 'LEGACY' NOT NULL;--> statement-breakpoint
ALTER TABLE `execution_sessions` ADD `registration` json;