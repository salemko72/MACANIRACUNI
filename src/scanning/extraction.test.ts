import { describe, expect, it } from "vitest";
import { extractBill } from "./extraction";

describe("real invoice layouts", () => {
  it.each([
    "UKUPNO ZA UPLATU (KM)\n123,45",
    "Ukupno za uplatu\n123,45 KM",
    "Iznos za plaćanje: 123,45",
  ])("reads a labeled total with separated currency: %s", (text) => {
    expect(extractBill(text).amount).toBe(123.45);
  });
  it("reads multiline labels without colon", () => {
    expect(
      extractBill("Obračunski period\n09 / 2026\nRok plaćanja\n20. 10. 2026."),
    ).toMatchObject({ billingMonth: "2026-09", dueDate: "2026-10-20" });
  });
  it("recognizes supplier independently of customer address", () => {
    expect(extractBill("JP Elektroprivreda BiH Sarajevo")).toMatchObject({
      supplierCategory: "electric",
    });
    expect(
      extractBill("JP Elektroprivreda BiH Sarajevo").propertyId,
    ).toBeUndefined();
  });
  it.each([
    "Iznos za uplatu\nPrethodni dug: 900,00 KM",
    "Za uplatu: 1234567890123456",
    "Za uplatu: 20,00 EUR",
    "Ukupno za uplatu: 10,00 20,00",
  ])("keeps ambiguous or unrelated values empty: %s", (text) => {
    expect(extractBill(text).amount).toBeUndefined();
  });
});

describe("extractBill", () => {
  it("prefers total due over old debt and parses explicit billing period", () => {
    const result = extractBill(
      "JP Elektroprivreda BiH\nMjesto potrošnje: Nišići\nObračunski period: 01.09.2026. - 30.09.2026.\nDatum izdavanja: 03.10.2026.\nRok plaćanja: 20.10.2026.\nPrethodni dug: 900,00 KM\nUKUPNO ZA UPLATU: 1.234,56 BAM",
      86,
    );
    expect(result).toMatchObject({
      amount: 1234.56,
      billingMonth: "2026-09",
      dueDate: "2026-10-20",
      issueDate: "2026-10-03",
      propertyId: "nisici",
      templateId: "n-electric",
      confidence: 86,
    });
  });
  it("does not derive billing month or property from issue date or supplier address", () => {
    const result = extractBill(
      "Elektroprivreda BiH Sarajevo\nDatum računa: 03.10.2026\nIznos za uplatu: 32,10 KM",
    );
    expect(result.billingMonth).toBeUndefined();
    expect(result.propertyId).toBeUndefined();
    expect(result.templateId).toBeUndefined();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it("recognizes explicit month names and a customer address", () => {
    expect(
      extractBill(
        "KJKP Vodovod i kanalizacija\nAdresa potrošača: Sarajevo\nRačun za septembar 2026\nZa platiti 23.80 KM",
      ),
    ).toMatchObject({
      amount: 23.8,
      billingMonth: "2026-09",
      templateId: "s-water",
    });
  });
  it.each([
    ["Toplane", "s-heat"],
    ["Telemach", "s-net"],
    ["KJKP RAD", "s-waste"],
    ["Sarajevostan", "s-maintenance"],
  ])(
    "recognizes %s with explicit Sarajevo customer evidence",
    (supplier, templateId) => {
      expect(
        extractBill(`${supplier}\nMjesto potrošnje: Sarajevo`).templateId,
      ).toBe(templateId);
    },
  );
  it("leaves contradictory totals and properties for human review", () => {
    const result = extractBill(
      "Mjesto potrošnje: Sarajevo\nAdresa potrošača: Nišići\nUkupno za uplatu: 10,00 KM\nUkupno za uplatu: 15,00 KM",
    );
    expect(result.amount).toBeUndefined();
    expect(result.propertyId).toBeUndefined();
    expect(result.warnings.join(" ")).toMatch(/više|različit|nejas/i);
  });
  it("does not read a previous balance as the amount or accept impossible dates", () => {
    const result = extractBill(
      "Prethodni dug 90,00 KM\nRok plaćanja: 31.02.2026",
    );
    expect(result.amount).toBeUndefined();
    expect(result.dueDate).toBeUndefined();
  });
  it("warns on low OCR confidence and missing data", () => {
    const result = extractBill("", 30);
    expect(result.warnings.length).toBeGreaterThan(2);
  });
  it("rejects periods spanning billing months and foreign currency", () => {
    const result = extractBill(
      "Obračunski period: 15.09.2026 - 15.10.2026\nZa uplatu: 40,00 EUR",
    );
    expect(result.billingMonth).toBeUndefined();
    expect(result.amount).toBeUndefined();
  });
});

describe("parser quality edge cases", () => {
  it.each([
    "Prethodni dug: 900,00 KM Ukupno za uplatu: 45,20 KM",
    "Ukupno za uplatu: 45,20 KM Prethodni dug: 900,00 KM",
  ])(
    "isolates payable total from a previous-debt column on the same OCR line",
    (text) => {
      expect(extractBill(text).amount).toBe(45.2);
    },
  );
  it("does not turn an impossible full date into a plausible billing month", () => {
    const result = extractBill("Obračunski period: 31.02.2026 - 31.02.2026");
    expect(result.billingMonth).toBeUndefined();
  });
  it.each([
    "Obračunski period: 01.12.2026 - 31.01.2027",
    "Račun za januar 2026 - januar 2027",
    "Obračunski mjesec: 12/2026 - 01/2027",
  ])("leaves a cross-month or cross-year range unselected: %s", (text) => {
    expect(extractBill(text).billingMonth).toBeUndefined();
  });
  it("requires customer evidence even when municipal supplier has Sarajevo in its name", () => {
    const result = extractBill(
      "KJKP Vodovod i kanalizacija Sarajevo\nAdresa dobavljača: Sarajevo\nAdresa potrošača: Nišići\nUkupno za uplatu: 20,00 KM",
    );
    expect(result.propertyId).toBe("nisici");
    expect(result.templateId).toBe("n-water");
  });
  it("accepts repeated evidence for one month and leap-day dates", () => {
    const result = extractBill(
      "Obračunski period: 01.02.2024 - 29.02.2024\nRačun za februar 2024\nRok plaćanja: 29.02.2024",
    );
    expect(result.billingMonth).toBe("2024-02");
    expect(result.dueDate).toBe("2024-02-29");
  });
  it("does not replace an unknown total with only a current charge and previous debt", () => {
    expect(
      extractBill("Tekuće zaduženje: 50,00 KM\nPrethodni dug: 200,00 KM")
        .amount,
    ).toBeUndefined();
  });
});

it("keeps explicit billing month when OCR merges issue date into the same line", () => {
  const result = extractBill(
    "Račun za septembar 2026 Datum izdavanja: 03.10.2026",
  );
  expect(result.billingMonth).toBe("2026-09");
});
