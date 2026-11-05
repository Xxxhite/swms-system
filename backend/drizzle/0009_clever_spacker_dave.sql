CREATE TABLE `administrative_regions` (
	`code` varchar(24) NOT NULL,
	`name` varchar(100) NOT NULL,
	`parent_code` varchar(24),
	`level` tinyint NOT NULL,
	`kind` enum('ADMIN','SERVICE') NOT NULL DEFAULT 'ADMIN',
	`enabled` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `administrative_regions_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
ALTER TABLE `contract_contracts` ADD `region_code` varchar(24);--> statement-breakpoint
ALTER TABLE `contract_contracts` ADD `region_path_snapshot` json;--> statement-breakpoint
ALTER TABLE `contract_service_points` ADD `region_code` varchar(24);--> statement-breakpoint
ALTER TABLE `contract_service_points` ADD `region_path_snapshot` json;--> statement-breakpoint
ALTER TABLE `resources` ADD `region_code` varchar(24);--> statement-breakpoint
ALTER TABLE `resources` ADD `region_path_snapshot` json;--> statement-breakpoint
ALTER TABLE `service_tasks` ADD `region_code` varchar(24);--> statement-breakpoint
ALTER TABLE `service_tasks` ADD `region_path_snapshot` json;--> statement-breakpoint
ALTER TABLE `administrative_regions` ADD CONSTRAINT `region_parent_fk` FOREIGN KEY (`parent_code`) REFERENCES `administrative_regions`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `region_parent` ON `administrative_regions` (`parent_code`);--> statement-breakpoint
ALTER TABLE `contract_contracts` ADD CONSTRAINT `contract_contracts_region_code_administrative_regions_code_fk` FOREIGN KEY (`region_code`) REFERENCES `administrative_regions`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contract_service_points` ADD CONSTRAINT `service_point_region_fk` FOREIGN KEY (`region_code`) REFERENCES `administrative_regions`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `resources` ADD CONSTRAINT `resources_region_code_administrative_regions_code_fk` FOREIGN KEY (`region_code`) REFERENCES `administrative_regions`(`code`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `service_tasks` ADD CONSTRAINT `service_tasks_region_code_administrative_regions_code_fk` FOREIGN KEY (`region_code`) REFERENCES `administrative_regions`(`code`) ON DELETE no action ON UPDATE no action;