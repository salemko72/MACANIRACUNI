import type { ScanSuggestion } from "./extraction";

const fields = [
  "amount",
  "dueDate",
  "billingMonth",
  "issueDate",
  "propertyId",
  "supplierCategory",
] as const;
const score = (result: ScanSuggestion) =>
  fields.filter((key) => result[key] !== undefined).length * 100 +
  result.confidence * 0.5 +
  Math.min(result.text.trim().length, 500) / 100;

export function shouldRetryRecognition(result: ScanSuggestion): boolean {
  return (
    result.confidence < 80 ||
    result.text.trim().length < 80 ||
    result.amount === undefined ||
    !result.dueDate ||
    !result.billingMonth
  );
}

/** Pick a whole reading, never assemble a silently contradictory invoice. */
export function chooseRecognition(
  first: ScanSuggestion,
  second: ScanSuggestion,
): ScanSuggestion {
  const best = score(second) > score(first) ? second : first;
  const conflicts = fields.filter(
    (key) =>
      first[key] !== undefined &&
      second[key] !== undefined &&
      first[key] !== second[key],
  );
  if (!conflicts.length) return best;
  const result = { ...best, warnings: [...best.warnings] };
  for (const key of conflicts) delete result[key];
  if (
    conflicts.includes("supplierCategory") ||
    conflicts.includes("propertyId")
  )
    delete result.templateId;
  result.warnings.push(
    "Dva pokušaja čitanja daju različite podatke. Nejasna polja su ostavljena prazna; provjerite original.",
  );
  return result;
}
