CREATE TABLE `EmployeeDocument` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `documentType` VARCHAR(40) NOT NULL,
  `documentName` VARCHAR(191) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `mimeType` VARCHAR(100) NOT NULL,
  `fileSize` INTEGER NOT NULL,
  `fileData` LONGBLOB NOT NULL,
  `expiresAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  INDEX `EmployeeDocument_employeeId_documentType_idx` (`employeeId`, `documentType`),
  INDEX `EmployeeDocument_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `EmployeeDocument_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
