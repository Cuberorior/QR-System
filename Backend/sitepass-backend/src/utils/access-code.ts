import { randomInt } from "node:crypto";

/** Generate an access code with exactly six numeric digits. */
export function generateAccessCode(): string {
  return String(randomInt(100000, 1000000));
}

export const generateEmployeeAccessCode = generateAccessCode;
