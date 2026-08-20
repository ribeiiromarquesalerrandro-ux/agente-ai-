CREATE TABLE `api_catalog_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`apiId` int NOT NULL,
	`isEnabled` int NOT NULL DEFAULT 0,
	`credentialReference` varchar(128),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_catalog_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_catalog_settings_apiId_unique` UNIQUE(`apiId`)
);
--> statement-breakpoint
CREATE TABLE `plan_model_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`plan` enum('basic','pro_max') NOT NULL,
	`modelName` varchar(160) NOT NULL,
	`isEnabled` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plan_model_access_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `api_catalog_settings` ADD CONSTRAINT `api_catalog_settings_apiId_api_catalog_id_fk` FOREIGN KEY (`apiId`) REFERENCES `api_catalog`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `plan_model_access_plan_idx` ON `plan_model_access` (`plan`);