ALTER TABLE `Employee`
  ADD COLUMN `workerIdExpiresAt` DATETIME(3) NULL;

-- Preserve the existing expiry date from the most recently uploaded Worker ID.
UPDATE `Employee` AS `employee`
SET `workerIdExpiresAt` = (
  SELECT `document`.`expiresAt`
  FROM `EmployeeDocument` AS `document`
  WHERE `document`.`employeeId` = `employee`.`id`
    AND `document`.`documentType` = 'WORKER_ID'
    AND `document`.`expiresAt` IS NOT NULL
  ORDER BY `document`.`createdAt` DESC, `document`.`id` DESC
  LIMIT 1
)
WHERE EXISTS (
  SELECT 1
  FROM `EmployeeDocument` AS `document`
  WHERE `document`.`employeeId` = `employee`.`id`
    AND `document`.`documentType` = 'WORKER_ID'
    AND `document`.`expiresAt` IS NOT NULL
);
