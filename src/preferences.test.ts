import { it, expect } from "vitest";
import { currentBillingMonth } from "./preferences";
it("mjesec prati Sarajevo na granici godine", () => {
  expect(currentBillingMonth(new Date("2026-12-31T23:15:00Z"))).toBe("2027-01");
  expect(currentBillingMonth(new Date("2026-12-31T22:15:00Z"))).toBe("2026-12");
});
