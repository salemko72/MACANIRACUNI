import { templates, type Bill } from "../domain";
import type { ScanSuggestion } from "./extraction";
import type { ScanDraft } from "./Scanner";

export function validateBatchFiles(files: File[]) {
  if (!files.length) throw new Error("Odaberi račune za skeniranje.");
  if (files.length > 20)
    throw new Error("Odaberi najviše 20 datoteka odjednom.");
  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024)
    throw new Error("Ukupna veličina računa može biti najviše 100 MB.");
}
export function hasRecordedData(bill?: Bill): boolean {
  return Boolean(
    bill &&
    (bill.documentId ||
      (bill.isDemo !== true &&
        (bill.receiptStatus !== "missing" ||
          bill.amount !== undefined ||
          bill.dueDate ||
          bill.issueDate))),
  );
}
export function billFingerprint(bill?: Bill): string {
  return bill
    ? JSON.stringify(
        Object.entries(bill).sort(([a], [b]) => a.localeCompare(b)),
      )
    : "";
}
export function toBatchDraft(
  suggestion: ScanSuggestion,
  month: string,
  property: string,
): { draft: ScanDraft; needsMonthReview: boolean } {
  const inferred =
    templates.find((t) => t.id === suggestion.templateId) ??
    (property !== "all" && !suggestion.propertyId
      ? templates.find(
          (t) =>
            t.propertyId === property &&
            t.category === suggestion.supplierCategory,
        )
      : undefined);
  return {
    draft: {
      engine: suggestion.engine === "ai" ? "ai" : "local",
      templateId: inferred?.id ?? "",
      billingMonth: suggestion.billingMonth ?? month,
      amount: suggestion.amount,
      dueDate: suggestion.dueDate,
      issueDate: suggestion.issueDate,
      receiptStatus:
        suggestion.engine !== "ai" && suggestion.confidence < 75
          ? "needs_review"
          : "received",
      text: suggestion.text,
      confidence: suggestion.confidence,
    },
    needsMonthReview: !suggestion.billingMonth,
  };
}
export function duplicateTargets(
  entries: {
    id: string;
    selected: boolean;
    draft?: Pick<ScanDraft, "templateId" | "billingMonth">;
  }[],
): Set<string> {
  const targets = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.selected || !entry.draft?.templateId) continue;
    const key = entry.draft.templateId + "|" + entry.draft.billingMonth;
    targets.set(key, [...(targets.get(key) ?? []), entry.id]);
  }
  return new Set([...targets.values()].filter((ids) => ids.length > 1).flat());
}
