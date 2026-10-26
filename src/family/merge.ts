import type { Bill } from "../domain";
export function mergeBillChanges(
  base: Bill,
  local: Bill,
  remote: Bill,
): Bill | null {
  for (const field of ["id", "templateId", "billingMonth"] as const) {
    if (base[field] !== local[field] || base[field] !== remote[field])
      return null;
  }
  const result = { ...remote };
  for (const key of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const k = key as keyof Bill;
    if (JSON.stringify(base[k]) === JSON.stringify(local[k])) continue;
    if (
      JSON.stringify(base[k]) !== JSON.stringify(remote[k]) &&
      JSON.stringify(local[k]) !== JSON.stringify(remote[k])
    )
      return null;
    Object.assign(result, { [k]: local[k] });
  }
  return result;
}
