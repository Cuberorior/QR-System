import { randomInt } from "node:crypto";

/** Generate an employee access code with exactly six numeric digits. */
export function generateEmployeeAccessCode(): string {
  return String(randomInt(100000, 1000000));
}
