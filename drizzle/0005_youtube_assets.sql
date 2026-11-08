CREATE TABLE `youtube_assets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `productionId` varchar(160) NOT NULL,
  `objectKey` varchar(512) NOT NULL,
  `fileName` varchar(255) NOT NULL,
  `fileSizeBytes` bigint NOT NULL,
  `sha256` varchar(64) NOT NULL,
  `qaStatus` enum('PASS') NOT NULL DEFAULT 'PASS',
  `status` enum('received','approved','uploading','uploaded_private','rejected','upload_failed') NOT NULL DEFAULT 'received',
  `title` varchar(100),
  `description` text,
  `tagsJson` text,
  `categoryId` varchar(16) DEFAULT '22',
  `encryptedUploadSessionUrl` text,
  `youtubeVideoId` varchar(128),
  `approvedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `youtube_assets_id` PRIMARY KEY(`id`),
  CONSTRAINT `youtube_assets_productionId_unique` UNIQUE(`productionId`)
);
--> statement-breakpoint
CREATE INDEX `youtube_assets_status_created_idx` ON `youtube_assets` (`status`, `createdAt`);