ALTER TABLE `Visitor`
  ADD COLUMN `visitorCode` VARCHAR(191) NULL,
  ADD COLUMN `organization` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Visitor_visitorCode_key` ON `Visitor`(`visitorCode`);

CREATE TABLE `VisitorIdSequence` (
  `id` INTEGER NOT NULL,
  `nextValue` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `VisitorIdSequence` (`id`, `nextValue`, `updatedAt`)
SELECT 1,
  COALESCE(MAX(CAST(SUBSTRING(`visitorCode`, 5) AS UNSIGNED)), 0) + 1,
  CURRENT_TIMESTAMP(3)
FROM `Visitor`
WHERE `visitorCode` REGEXP '^VIS-[0-9]+$';

ALTER TABLE `VisitorVisit`
  ADD COLUMN `accessCodeHash` VARCHAR(191) NULL,
  ADD COLUMN `credentialExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `emailVerificationTokenHash` VARCHAR(191) NULL,
  ADD COLUMN `emailVerificationExpiresAt` DATETIME(3) NULL,
  ADD COLUMN `revokedAt` DATETIME(3) NULL,
  ADD COLUMN `idempotencyKey` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `VisitorVisit_emailVerificationTokenHash_key` ON `VisitorVisit`(`emailVerificationTokenHash`);
CREATE UNIQUE INDEX `VisitorVisit_idempotencyKey_key` ON `VisitorVisit`(`idempotencyKey`);
CREATE INDEX `VisitorVisit_siteId_visitStatus_idx` ON `VisitorVisit`(`siteId`, `visitStatus`);
CREATE INDEX `VisitorVisit_credentialExpiresAt_idx` ON `VisitorVisit`(`credentialExpiresAt`);

ALTER TABLE `EmailDelivery`
  MODIFY COLUMN `employeeId` VARCHAR(191) NULL,
  ADD COLUMN `visitorVisitId` VARCHAR(191) NULL;

CREATE INDEX `EmailDelivery_visitorVisitId_createdAt_idx` ON `EmailDelivery`(`visitorVisitId`, `createdAt`);

ALTER TABLE `EmailDelivery`
  ADD CONSTRAINT `EmailDelivery_visitorVisitId_fkey` FOREIGN KEY (`visitorVisitId`) REFERENCES `VisitorVisit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
