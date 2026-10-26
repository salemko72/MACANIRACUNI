import { it, expect } from "vitest";
import { ensureMonth } from "../domain";
import { paymentAfterScan } from "./link";
it("DEMO plaćanje nije dokaz da je stvarni skenirani račun plaćen", () => {
  const b = {
    ...ensureMonth([], "2026-09")[0],
    isDemo: true,
    paymentStatus: "paid" as const,
    paidAt: "2026-10-01",
  };
  expect(paymentAfterScan(b)).toEqual({
    paymentStatus: "unpaid",
    paidAt: undefined,
  });
});
it("postojeće stvarno plaćanje ostaje nezavisno od novog dokumenta", () => {
  const b = {
    ...ensureMonth([], "2026-09")[0],
    isDemo: false,
    paymentStatus: "paid" as const,
    paidAt: "2026-10-01",
  };
  expect(paymentAfterScan(b)).toEqual({
    paymentStatus: "paid",
    paidAt: "2026-10-01",
  });
});
