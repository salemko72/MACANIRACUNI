import { expect, it } from "vitest";
import { parseFamilyCache } from "./useLedger";
import type { Bill } from "../domain";
const bill: Bill = {
  id: "2026-10_s-water",
  templateId: "s-water",
  billingMonth: "2026-10",
  currency: "BAM",
  receiptStatus: "received",
  paymentStatus: "unpaid",
  amount: 20,
  isDemo: false,
};
const version = { bill, revision: 1 };
function fixture() {
  return {
    email: "member@example.test",
    bills: [bill],
    versions: { [bill.id]: version },
    pending: { [bill.id]: { bill, revision: 1, base: bill } },
    conflicts: {},
  };
}
it("restores validated pending edits without losing their revision and baseline", () => {
  const parsed = parseFamilyCache(JSON.stringify(fixture()));
  expect(parsed?.pending[bill.id]).toEqual({ bill, revision: 1, base: bill });
  expect(Object.getPrototypeOf(parsed!.pending)).toBeNull();
});
it("rejects malformed nested pending and server revisions before they can upload", () => {
  for (const replacement of [
    { bill, revision: -1, base: bill },
    { bill, revision: 1.5, base: bill },
    { bill: { ...bill, id: "another-id" }, revision: 1, base: bill },
    { bill: { ...bill, isDemo: true }, revision: 1, base: bill },
    { bill, revision: 1, base: { ...bill, templateId: "s-heat" } },
  ]) {
    const value = fixture();
    value.pending[bill.id] = replacement as (typeof value.pending)[string];
    expect(parseFamilyCache(JSON.stringify(value))).toBeNull();
  }
  const value = fixture();
  value.versions[bill.id].revision = 0;
  expect(parseFamilyCache(JSON.stringify(value))).toBeNull();
});
it("rejects array dictionaries and prototype-sensitive imported IDs", () => {
  expect(
    parseFamilyCache(JSON.stringify({ ...fixture(), pending: [] })),
  ).toBeNull();
  const raw = JSON.stringify(fixture()).replaceAll(
    "2026-10_s-water",
    "__proto__",
  );
  expect(parseFamilyCache(raw)).toBeNull();
});
it("rejects pending records absent from the displayed durable bill copy", () => {
  expect(
    parseFamilyCache(JSON.stringify({ ...fixture(), bills: [] })),
  ).toBeNull();
});
it("rejects unknown family bill fields and overlong notes from untrusted cache data", () => {
  for (const patch of [{ html: "unexpected" }, { notes: "x".repeat(8001) }]) {
    const value = fixture();
    value.bills = [{ ...bill, ...patch }];
    value.pending = {};
    value.versions = {};
    expect(parseFamilyCache(JSON.stringify(value))).toBeNull();
  }
});
