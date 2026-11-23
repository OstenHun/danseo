import { createHash } from 'node:crypto';

// Code-unit order, so the result does not depend on the locale.
function compareKeys(a: string, b: string) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => compareKeys(a, b))
      .map(([k, entry]) => `${JSON.stringify(k)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
// Conditions, limits and extension fields are part of a claim's reviewed meaning.
export function claimFingerprint(claim: { id: string; statement: string; locators: unknown[] }) {
  return createHash('sha256')
    .update(canonical({ ...claim, locators: claim.locators.map(canonical).sort() }))
    .digest('hex');
}
