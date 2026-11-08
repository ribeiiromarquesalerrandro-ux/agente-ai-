CREATE TABLE `youtube_connections` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `channelId` varchar(128) NOT NULL,
  `channelTitle` text NOT NULL,
  `encryptedRefreshToken` text NOT NULL,
  `grantedScopes` text NOT NULL,
  `connectedAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `youtube_connections_id` PRIMARY KEY(`id`),
  CONSTRAINT `youtube_connections_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `youtube_connections` ADD CONSTRAINT `youtube_connections_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;