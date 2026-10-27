CREATE TABLE `SafetyDeclaration` (
  `id` VARCHAR(191) NOT NULL,
  `siteId` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NULL,
  `attendanceRecordId` VARCHAR(191) NULL,
  `checklistVersion` VARCHAR(191) NOT NULL,
  `responseSnapshot` JSON NOT NULL,
  `submittedAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `tokenExpiresAt` DATETIME(3) NOT NULL,
  `status` ENUM('DECLARED', 'CONSUMED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'DECLARED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SafetyDeclaration_attendanceRecordId_key`(`attendanceRecordId`),
  UNIQUE INDEX `SafetyDeclaration_tokenHash_key`(`tokenHash`),
  INDEX `SafetyDeclaration_siteId_status_idx`(`siteId`, `status`),
  INDEX `SafetyDeclaration_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
  INDEX `SafetyDeclaration_tokenExpiresAt_idx`(`tokenExpiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SafetyDeclaration`
  ADD CONSTRAINT `SafetyDeclaration_siteId_fkey` FOREIGN KEY (`siteId`) REFERENCES `ConstructionSite`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `SafetyDeclaration_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `SafetyDeclaration_attendanceRecordId_fkey` FOREIGN KEY (`attendanceRecordId`) REFERENCES `AttendanceRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
