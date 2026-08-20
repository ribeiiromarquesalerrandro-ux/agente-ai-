ALTER TABLE `users` MODIFY COLUMN `role` enum('owner','admin','user') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `api_catalog` ADD `minimumPlan` enum('basic','pro_max') DEFAULT 'pro_max' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `plan` enum('basic','pro_max') DEFAULT 'basic' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY `role` enum('owner','admin','user') NOT NULL DEFAULT 'user';
