ALTER TABLE `VisitorVisit`
  ADD COLUMN `safetyResponses` JSON NULL,
  ADD COLUMN `safetySubmittedAt` DATETIME(3) NULL;
