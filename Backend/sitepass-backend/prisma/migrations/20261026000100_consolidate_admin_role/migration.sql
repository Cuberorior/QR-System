-- Preserve every administrator row and password hash while introducing the single ADMIN role.
ALTER TABLE `Administrator`
  MODIFY COLUMN `role` ENUM('SUPER_ADMIN', 'SITE_ADMIN', 'ADMIN') NOT NULL DEFAULT 'ADMIN';

UPDATE `Administrator` SET `role` = 'ADMIN' WHERE `role` IN ('SUPER_ADMIN', 'SITE_ADMIN');

ALTER TABLE `Administrator`
  MODIFY COLUMN `role` ENUM('ADMIN') NOT NULL DEFAULT 'ADMIN';
