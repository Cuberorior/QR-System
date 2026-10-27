ALTER TABLE `VerificationSession`
  ADD COLUMN `intendedAction` VARCHAR(191) NOT NULL DEFAULT 'LEGACY';
