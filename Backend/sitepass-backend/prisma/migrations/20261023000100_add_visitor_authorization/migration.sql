ALTER TABLE `VisitorVisit`
  ADD COLUMN `authorizationTokenHash` VARCHAR(191) NULL,
  ADD COLUMN `authorizationExpiresAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `VisitorVisit_authorizationTokenHash_key`
  ON `VisitorVisit`(`authorizationTokenHash`);
