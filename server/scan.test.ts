import { expect, it } from "vitest";
import { parseAiInvoice } from "./scan";

const response = (value: unknown) => ({
  response: "```json\n" + JSON.stringify(value) + "\n```",
});
it("reads AI fields independently of layout and ignores any payment claim", () => {
  const result = parseAiInvoice(
    response({
      supplier: "EP BiH",
      category: "electric",
      property: "nisici",
      amount: 123.45,
      currency: "KM",
      billingMonth: "2026-09",
      dueDate: "2026-10-20",
      issueDate: null,
      text: "Visible text",
      paymentStatus: "paid",
    }),
  );
  expect(result).toMatchObject({
    templateId: "n-electric",
    amount: 123.45,
    billingMonth: "2026-09",
    dueDate: "2026-10-20",
    engine: "ai",
  });
  expect(result).not.toHaveProperty("paymentStatus");
});
it("rejects invented dates, foreign currency and invalid numbers", () => {
  const result = parseAiInvoice(
    response({
      category: "water",
      property: "sarajevo",
      amount: -20,
      currency: "EUR",
      dueDate: "2026-02-31",
      billingMonth: "2026-13",
      text: "Invoice",
    }),
  );
  expect(result.amount).toBeUndefined();
  expect(result.dueDate).toBeUndefined();
  expect(result.billingMonth).toBeUndefined();
  expect(result.warnings.length).toBeGreaterThan(0);
});
it.each([{}, { response: "not JSON" }, response([]), response({})])(
  "rejects missing or malformed model output",
  (value) => {
    expect(() => parseAiInvoice(value)).toThrow();
  },
);
it("accepts the alternative chat response envelope", () => {
  expect(
    parseAiInvoice({
      choices: [
        {
          message: {
            content: JSON.stringify({
              text: "Invoice",
              amount: 0,
              currency: "BAM",
            }),
          },
        },
      ],
    }).amount,
  ).toBe(0);
});
