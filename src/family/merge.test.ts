import { describe, it, expect } from "vitest";
import { mergeBillChanges } from "./merge";
import { ensureMonth } from "../domain";
it("spaja nezavisne izmjene prijema i plaćanja bez gubitka", () => {
  const base = ensureMonth([], "2026-10")[0];
  expect(
    mergeBillChanges(
      base,
      { ...base, receiptStatus: "received" },
      { ...base, paymentStatus: "paid" },
    ),
  ).toMatchObject({ receiptStatus: "received", paymentStatus: "paid" });
});
it("traži odluku kada dva uređaja promijene isti iznos", () => {
  const base = { ...ensureMonth([], "2026-10")[0], amount: 10 };
  expect(
    mergeBillChanges(base, { ...base, amount: 20 }, { ...base, amount: 30 }),
  ).toBeNull();
});
it("isto sačuvano polje nije konflikt", () => {
  const base = ensureMonth([], "2026-10")[0];
  expect(
    mergeBillChanges(base, { ...base, amount: 20 }, { ...base, amount: 20 }),
  ).toMatchObject({ amount: 20 });
});
it("čuva eksplicitno brisanje napomene", () => {
  const base = { ...ensureMonth([], "2026-10")[0], notes: "staro" };
  expect(
    mergeBillChanges(
      base,
      { ...base, notes: undefined },
      { ...base, paymentStatus: "paid" },
    ),
  ).toMatchObject({ notes: undefined, paymentStatus: "paid" });
});
it("does not merge records with different immutable identities", () => {
  const base = { ...ensureMonth([], "2026-10")[0], amount: 10 };
  expect(
    mergeBillChanges(
      base,
      { ...base, amount: 20 },
      { ...base, id: "different-id" },
    ),
  ).toBeNull();
  expect(
    mergeBillChanges(base, { ...base, billingMonth: "2026-11" }, base),
  ).toBeNull();
});
