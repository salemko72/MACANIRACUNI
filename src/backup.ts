import { templates, type Bill } from "./domain";

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

export function validateBills(value: unknown): Bill[] {
  if (!Array.isArray(value) || value.length > 100000)
    throw new Error("Neispravna lista računa.");
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object")
      throw new Error("Neispravan zapis računa.");
    const b = item as Record<string, unknown>;
    if (
      typeof b.id !== "string" ||
      !b.id ||
      typeof b.templateId !== "string" ||
      !templates.some((t) => t.id === b.templateId) ||
      typeof b.billingMonth !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.billingMonth) ||
      b.currency !== "BAM" ||
      !["missing", "received", "needs_review"].includes(
        String(b.receiptStatus),
      ) ||
      !["unpaid", "paid", "unknown"].includes(String(b.paymentStatus))
    )
      throw new Error("Nepoznat račun ili status.");
    for (const field of ["amount", "previousBalance"]) {
      const n = b[field];
      if (
        n !== undefined &&
        (typeof n !== "number" || !Number.isFinite(n) || n < 0)
      )
        throw new Error("Iznos mora biti nenegativan broj.");
    }
    for (const field of ["dueDate", "issueDate"])
      if (b[field] !== undefined && !validDate(b[field]))
        throw new Error("Neispravan datum.");
    for (const field of ["receivedAt", "paidAt"]) {
      const date = b[field];
      if (
        date !== undefined &&
        (typeof date !== "string" ||
          !validDate(date.slice(0, 10)) ||
          !Number.isFinite(Date.parse(date)))
      )
        throw new Error("Neispravan datum statusa.");
    }
    if (b.notes !== undefined && typeof b.notes !== "string")
      throw new Error("Neispravna napomena.");
    if (
      b.documentId !== undefined &&
      (typeof b.documentId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(b.documentId))
    )
      throw new Error("Neispravan dokument.");
    if (
      b.confidence !== undefined &&
      (typeof b.confidence !== "number" ||
        !Number.isFinite(b.confidence) ||
        b.confidence < 0 ||
        b.confidence > 100)
    )
      throw new Error("Neispravna OCR pouzdanost.");
    if (b.isDemo !== undefined && typeof b.isDemo !== "boolean")
      throw new Error("Neispravna oznaka DEMO podataka.");
    if (
      b.source !== undefined &&
      !["manual", "paper", "email"].includes(String(b.source))
    )
      throw new Error("Nepoznat izvor.");
    if (
      b.balanceType !== undefined &&
      !["debt", "credit"].includes(String(b.balanceType))
    )
      throw new Error("Nepoznata vrsta stanja.");
    const key = `${b.billingMonth}:${b.templateId}`;
    if (ids.has(b.id) || keys.has(key))
      throw new Error("Kopija sadrži duplikate računa.");
    ids.add(b.id);
    keys.add(key);
  }
  return value as Bill[];
}

export function createBackup(bills: Bill[]): string {
  return JSON.stringify(
    {
      app: "MacaniRacuni",
      version: 1,
      exportedAt: new Date().toISOString(),
      demo: bills.every((b) => b.isDemo !== false),
      bills: validateBills(bills),
    },
    null,
    2,
  );
}

export function readBackup(raw: string): Bill[] {
  const value = JSON.parse(raw);
  if (!value || value.app !== "MacaniRacuni" || value.version !== 1)
    throw new Error("Odaberite MacaniRacuni sigurnosnu kopiju verzije 1.");
  return validateBills(value.bills);
}
