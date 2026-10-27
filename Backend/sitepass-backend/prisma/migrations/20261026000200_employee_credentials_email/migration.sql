CREATE TABLE `EmployeeIdSequence` (
  `id` INTEGER NOT NULL,
  `nextValue` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `EmployeeIdSequence` (`id`, `nextValue`, `updatedAt`)
SELECT 1,
  COALESCE(MAX(CAST(SUBSTRING(`employeeCode`, 5) AS UNSIGNED)), 0) + 1,
  CURRENT_TIMESTAMP(3)
FROM `Employee`
WHERE `employeeCode` REGEXP '^EMP-[0-9]+$';

CREATE TABLE `EmailDelivery` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `recipientEmail` VARCHAR(191) NOT NULL,
  `emailType` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'SENT', 'FAILED', 'DELIVERED', 'BOUNCED') NOT NULL DEFAULT 'PENDING',
  `brevoMessageId` VARCHAR(191) NULL,
  `attemptCount` INTEGER NOT NULL DEFAULT 0,
  `nextRetryAt` DATETIME(3) NULL,
  `lastError` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `EmailDelivery_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
  INDEX `EmailDelivery_status_nextRetryAt_idx`(`status`, `nextRetryAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmployeeCreationRequest` (
  `idempotencyKey` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `EmployeeCreationRequest_employeeId_key`(`employeeId`),
  PRIMARY KEY (`idempotencyKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EmailDelivery`
  ADD CONSTRAINT `EmailDelivery_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `EmployeeCreationRequest`
  ADD CONSTRAINT `EmployeeCreationRequest_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
