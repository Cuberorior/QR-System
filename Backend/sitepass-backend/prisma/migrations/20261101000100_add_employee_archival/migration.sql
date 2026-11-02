-- Archive employees without deleting the attendance, safety, email, and audit history linked to them.
ALTER TABLE `Employee`
  ADD COLUMN `archivedAt` DATETIME(3) NULL;

CREATE INDEX `Employee_siteId_archivedAt_idx` ON `Employee`(`siteId`, `archivedAt`);
