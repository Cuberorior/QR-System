-- Worker ID expiry is stored on the uploaded Worker ID document, not on Employee.
ALTER TABLE `Employee`
  DROP COLUMN `workerIdExpiresAt`;
