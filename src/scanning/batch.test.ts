import { expect, it } from "vitest";
import {
  hasRecordedData,
  toBatchDraft,
  duplicateTargets,
  validateBatchFiles,
} from "./batch";
import type { Bill } from "../domain";
const bill: Bill = {
  id: "a",
  templateId: "s-water",
  billingMonth: "2026-10",
  currency: "BAM",
  receiptStatus: "received",
  paymentStatus: "unpaid",
  amount: 20,
};
it("requires confirmation for real entries but not demo placeholders", () => {
  expect(hasRecordedData(bill)).toBe(true);
  expect(hasRecordedData({ ...bill, isDemo: true })).toBe(false);
  expect(
    hasRecordedData({ ...bill, isDemo: true, documentId: "original" }),
  ).toBe(true);
});
it("maps an unambiguous supplier within the selected property and keeps missing month review visible", () => {
  const result = toBatchDraft(
    {
      supplierCategory: "water",
      text: "Example",
      confidence: 0,
      engine: "ai",
      amount: 23.4,
      warnings: [],
    },
    "2026-10",
    "nisici",
  );
  expect(result.draft).toMatchObject({
    templateId: "n-water",
    billingMonth: "2026-10",
    amount: 23.4,
    receiptStatus: "received",
  });
  expect(result.needsMonthReview).toBe(true);
});
it("detects same supplier/month collisions across different selected pages only", () => {
  const draft = { templateId: "s-water", billingMonth: "2026-10" };
  expect(
    duplicateTargets([
      { id: "one", selected: true, draft },
      { id: "two", selected: true, draft },
      { id: "three", selected: false, draft },
    ]),
  ).toEqual(new Set(["one", "two"]));
});
it("rejects oversized batches before any recognition starts", () => {
  expect(() =>
    validateBatchFiles(Array.from({ length: 21 }, () => ({ size: 1 }) as File)),
  ).toThrow(/20/);
  expect(() =>
    validateBatchFiles(
      Array.from({ length: 6 }, () => ({ size: 20 * 1024 * 1024 }) as File),
    ),
  ).toThrow(/100 MB/);
});
