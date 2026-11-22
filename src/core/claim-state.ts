import { createHash } from 'node:crypto';

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
// Conditions, limits and extension fields are part of a claim's reviewed meaning.
export function claimFingerprint(claim: { id: string; statement: string; locators: unknown[] }) {
  return createHash('sha256')
    .update(canonical({ ...claim, locators: claim.locators.map(canonical).sort() }))
    .digest('hex');
}
