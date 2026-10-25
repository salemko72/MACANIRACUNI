import { describe, it, expect } from "vitest";
import {
  ensureMonth,
  updateBill,
  templates,
  seed,
  summarize,
  synchronizeMonths,
} from "./domain";
describe("mjesečni računi", () => {
  it("uključuje Sarajevostan u Sarajevu i vodu u Nišićima", () => {
    expect(templates.find((t) => t.id === "s-maintenance")).toMatchObject({
      providerName: "Sarajevostan (održavanje zgrade)",
      propertyId: "sarajevo",
    });
    expect(templates.find((t) => t.id === "n-water")).toMatchObject({
      providerName: "Voda",
      propertyId: "nisici",
    });
  });
  it("dopunjava staru historiju bez promjene postojećih podataka ili duplikata", () => {
    const old = seed().filter(
      (b) => !["s-maintenance", "n-water"].includes(b.templateId),
    );
    old[0] = {
      ...old[0],
      amount: 123.45,
      notes: "Sačuvano",
      paymentStatus: "paid",
    };
    const migrated = synchronizeMonths(old);
    for (const month of ["2026-08", "2026-09", "2026-10"]) {
      expect(migrated.filter((b) => b.billingMonth === month)).toHaveLength(9);
      for (const id of ["s-maintenance", "n-water"])
        expect(
          migrated.find((b) => b.billingMonth === month && b.templateId === id),
        ).toMatchObject({
          receiptStatus: "missing",
          paymentStatus: "unpaid",
          currency: "BAM",
        });
    }
    expect(migrated.find((b) => b.id === old[0].id)).toEqual(old[0]);
    expect(synchronizeMonths(migrated)).toEqual(migrated);
  });
  it("nove stavke u DEMO historiji nemaju izmišljene iznose", () => {
    const bills = seed();
    expect(
      bills
        .filter((b) => ["s-maintenance", "n-water"].includes(b.templateId))
        .every(
          (b) =>
            b.amount === undefined &&
            b.receiptStatus === "missing" &&
            b.paymentStatus === "unpaid",
        ),
    ).toBe(true);
    expect(
      bills.find(
        (b) => b.templateId === "s-electric" && b.billingMonth === "2026-09",
      )?.amount,
    ).toBe(71.4);
  });
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
