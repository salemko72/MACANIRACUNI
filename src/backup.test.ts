import { describe, it, expect } from "vitest";
import { createBackup, readBackup } from "./backup";
import { seed } from "./domain";
describe("sigurnosna kopija", () => {
  it("čuva sve mjesece, statuse i bilješke bez promjena", () => {
    const bills = seed();
    expect(readBackup(createBackup(bills))).toEqual(bills);
  });
  it.each([
    null,
    {},
    { app: "MacaniRacuni", version: 2, bills: seed() },
    { app: "Other", version: 1, bills: seed() },
  ])("odbija nepoznat format %j", (value) => {
    expect(() => readBackup(JSON.stringify(value))).toThrow();
  });
  it.each([
    { amount: -1 },
    { amount: "22" },
    { billingMonth: "2026-99" },
    { dueDate: "2026-02-31" },
    { templateId: "unknown" },
    { receiptStatus: "yes" },
    { paymentStatus: "yes" },
    { notes: 42 },
    { receivedAt: "yesterday" },
    { currency: "EUR" },
    { previousBalance: -2 },
  ])("odbija neispravna polja %j", (patch) => {
    const bills = seed();
    Object.assign(bills[0], patch);
    expect(() =>
      readBackup(JSON.stringify({ app: "MacaniRacuni", version: 1, bills })),
    ).toThrow();
  });
  it("odbija duplikate očekivanog računa", () => {
    const bills = seed();
    bills.push({ ...bills[0], id: "other" });
    expect(() =>
      readBackup(JSON.stringify({ app: "MacaniRacuni", version: 1, bills })),
    ).toThrow();
  });
  it("odbija null zapis i oštećen JSON", () => {
    expect(() => readBackup("{")).toThrow();
    expect(() =>
      readBackup(
        JSON.stringify({ app: "MacaniRacuni", version: 1, bills: [null] }),
      ),
    ).toThrow();
  });
});
