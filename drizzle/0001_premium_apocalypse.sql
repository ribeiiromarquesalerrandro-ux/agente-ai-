CREATE TABLE `agent_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ollamaUrl` varchar(512) NOT NULL DEFAULT 'http://localhost:11434',
	`activeModel` varchar(160) NOT NULL DEFAULT 'llama3.2',
	`temperature` int NOT NULL DEFAULT 70,
	`contextSize` int NOT NULL DEFAULT 8192,
	`systemPrompt` text NOT NULL,
	`weatherEnabled` int NOT NULL DEFAULT 1,
	`newsEnabled` int NOT NULL DEFAULT 1,
	`currencyEnabled` int NOT NULL DEFAULT 1,
	`githubEnabled` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agent_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_settings_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `api_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(96) NOT NULL,
	`name` varchar(160) NOT NULL,
	`category` varchar(96) NOT NULL,
	`baseUrl` varchar(512) NOT NULL,
	`docsUrl` varchar(1024) NOT NULL,
	`authKind` enum('none','api_key','oauth','custom') NOT NULL DEFAULT 'none',
	`approvalStatus` enum('catalog','approved','disabled') NOT NULL DEFAULT 'catalog',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_catalog_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_catalog_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant','system','tool') NOT NULL,
	`content` text NOT NULL,
	`attachmentUrl` varchar(1024),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conversation_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(180) NOT NULL DEFAULT 'Nova conversa',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memory_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int,
	`content` text NOT NULL,
	`sourceRole` enum('user','assistant','tool') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `memory_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `agent_settings` ADD CONSTRAINT `agent_settings_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD CONSTRAINT `conversation_messages_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memory_entries` ADD CONSTRAINT `memory_entries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memory_entries` ADD CONSTRAINT `memory_entries_conversationId_conversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `messages_conversation_created_idx` ON `conversation_messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `conversations_user_updated_idx` ON `conversations` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `memory_user_created_idx` ON `memory_entries` (`userId`,`createdAt`);