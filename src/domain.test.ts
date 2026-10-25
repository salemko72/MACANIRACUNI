import { describe, it, expect } from "vitest";
import { ensureMonth, updateBill, templates, seed, summarize } from "./domain";
describe("mjesečni računi", () => {
  it("novi mjesec ima sve aktivne stavke bez prenesenih statusa", () => {
    const bills = ensureMonth(seed(), "2027-01");
    const fresh = bills.filter((b) => b.billingMonth === "2027-01");
    expect(fresh).toHaveLength(templates.length);
    expect(
      fresh.every(
        (b) =>
          b.receiptStatus === "missing" &&
          b.paymentStatus === "unpaid" &&
          b.amount === undefined,
      ),
    ).toBe(true);
  });
  it("ponovljeno otvaranje ne pravi duplikate", () => {
    const a = ensureMonth(seed(), "2027-01");
    expect(ensureMonth(a, "2027-01")).toEqual(a);
  });
  it("prijem ne mijenja plaćanje niti obračunski mjesec", () => {
    const bill = seed()[0];
    const changed = updateBill(bill, {
      receiptStatus: "received",
      receivedAt: "2026-10-25",
    });
    expect(changed.paymentStatus).toBe(bill.paymentStatus);
    expect(changed.billingMonth).toBe("2026-08");
  });
  it("plaćanje ne mijenja prijem", () => {
    const bill = ensureMonth([], "2027-01")[0];
    expect(updateBill(bill, { paymentStatus: "paid" }).receiptStatus).toBe(
      "missing",
    );
  });
  it("sažetak zbraja samo poznate iznose", () => {
    const bills = ensureMonth([], "2027-01");
    bills[0].amount = 20;
    expect(summarize(bills).total).toBe(20);
    expect(summarize(bills).known).toBe(1);
  });
});
