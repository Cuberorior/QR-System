export function employeeCodeCandidates(value: string): string[] {
  const raw = value.trim().toUpperCase();
  const match = raw.match(/^(?:EMP-)?(\d+)$/);
  if (!match) return [raw];

  const number = String(Number(match[1]));
  return [...new Set([raw, `EMP-${number.padStart(3, "0")}`, `EMP-${number.padStart(6, "0")}`])];
}
