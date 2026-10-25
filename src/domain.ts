export type Bill = {
  id: string;
  templateId: string;
  billingMonth: string;
  receiptStatus: "missing" | "received" | "needs_review";
  paymentStatus: "unpaid" | "paid" | "unknown";
  amount?: number;
  currency: "BAM";
  dueDate?: string;
  issueDate?: string;
  receivedAt?: string;
  paidAt?: string;
  previousBalance?: number;
  balanceType?: "debt" | "credit";
  source?: "manual" | "paper" | "email";
  notes?: string;
};
export const properties = [
  { id: "sarajevo", name: "Sarajevo" },
  { id: "nisici", name: "Nišići" },
];
export const templates = [
  {
    id: "s-electric",
    propertyId: "sarajevo",
    providerName: "Električna energija",
    category: "electric",
    active: true,
  },
  {
    id: "s-water",
    propertyId: "sarajevo",
    providerName: "Vodovod i kanalizacija",
    category: "water",
    active: true,
  },
  {
    id: "s-heat",
    propertyId: "sarajevo",
    providerName: "Grijanje",
    category: "heat",
    active: true,
  },
  {
    id: "s-net",
    propertyId: "sarajevo",
    providerName: "Internet i televizija",
    category: "net",
    active: true,
  },
  {
    id: "s-waste",
    propertyId: "sarajevo",
    providerName: "Odvoz otpada",
    category: "waste",
    active: true,
  },
  {
    id: "n-electric",
    propertyId: "nisici",
    providerName: "Električna energija",
    category: "electric",
    active: true,
  },
  {
    id: "n-net",
    propertyId: "nisici",
    providerName: "Internet",
    category: "net",
    active: true,
  },
];
export function ensureMonth(bills: Bill[], month: string): Bill[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Neispravan obračunski mjesec");
  const extra = templates
    .filter(
      (t) =>
        t.active &&
        !bills.some((b) => b.templateId === t.id && b.billingMonth === month),
    )
    .map((t) => ({
      id: month + "_" + t.id,
      templateId: t.id,
      billingMonth: month,
      receiptStatus: "missing" as const,
      paymentStatus: "unpaid" as const,
      currency: "BAM" as const,
    }));
  return extra.length ? [...bills, ...extra] : bills;
}
export function updateBill(bill: Bill, patch: Partial<Bill>): Bill {
  return {
    ...bill,
    ...patch,
    id: bill.id,
    templateId: bill.templateId,
    billingMonth: bill.billingMonth,
  };
}
export function summarize(bills: Bill[]) {
  return {
    total: bills.reduce((s, b) => s + (b.amount ?? 0), 0),
    unpaid: bills
      .filter((b) => b.paymentStatus !== "paid")
      .reduce((s, b) => s + (b.amount ?? 0), 0),
    known: bills.filter((b) => b.amount !== undefined).length,
    received: bills.filter((b) => b.receiptStatus === "received").length,
    paid: bills.filter((b) => b.paymentStatus === "paid").length,
    missing: bills.filter((b) => b.receiptStatus === "missing").length,
  };
}
export function seed(): Bill[] {
  let all: Bill[] = [];
  for (const m of ["2026-08", "2026-09", "2026-10"]) all = ensureMonth(all, m);
  return all.map((b, i) => {
    const idx = i % 7;
    if (b.billingMonth === "2026-10" && idx > 3) return b;
    const amount =
      [72.4, 23.8, 98, 49.9, 12.5, 31.2, 25][idx] +
      (b.billingMonth === "2026-08"
        ? -2
        : b.billingMonth === "2026-09"
          ? -1
          : 0);
    return {
      ...b,
      amount,
      receiptStatus:
        b.billingMonth === "2026-10" && idx === 2 ? "needs_review" : "received",
      paymentStatus:
        b.billingMonth !== "2026-10" || idx === 0 ? "paid" : "unpaid",
      dueDate: b.billingMonth + "-28",
      issueDate: b.billingMonth + "-15",
      receivedAt:
        b.billingMonth === "2026-09" ? "2026-10-03" : b.billingMonth + "-17",
      source: "manual",
      notes: "DEMO — ilustrativni podaci, nisu stvarni računi.",
    };
  });
}
