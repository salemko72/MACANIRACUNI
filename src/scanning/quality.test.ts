import { expect, it } from "vitest";
import { extractBill } from "./extraction";
import { chooseRecognition, shouldRetryRecognition } from "./quality";

it("retries incomplete invoice recognition even with confident heading text", () => {
  expect(shouldRetryRecognition(extractBill("Elektroprivreda BiH", 95))).toBe(
    true,
  );
});
it("avoids repeating a complete clear invoice", () => {
  expect(
    shouldRetryRecognition(
      extractBill(
        "Elektroprivreda BiH\nMjesto potrosnje: Nisici\nRacun za 09/2026\nZa uplatu: 15,00 KM\nRok placanja: 20.10.2026",
        95,
      ),
    ),
  ).toBe(false);
});
it("prefers recovered invoice fields over a longer header and keeps one coherent reading", () => {
  const header = extractBill(
    "Elektroprivreda BiH\n" + "Opsti uslovi poslovanja ".repeat(60),
    98,
  );
  const recovered = extractBill(
    "Elektroprivreda BiH\nZa uplatu: 45,20 KM\nRok placanja: 20.10.2026",
    86,
  );
  expect(chooseRecognition(header, recovered)).toBe(recovered);
  expect(chooseRecognition(recovered, header)).toBe(recovered);
});
it("never silently chooses between contradictory totals from alternate passes", () => {
  const a = extractBill("Za uplatu: 45,20 KM", 86),
    b = extractBill("Za uplatu: 48,20 KM", 96);
  expect(chooseRecognition(a, b).amount).toBeUndefined();
  expect(chooseRecognition(a, b).warnings.join(" ")).toMatch(/različit/);
});
