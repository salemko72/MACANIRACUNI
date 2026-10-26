export type ScanSuggestion = {
  text: string;
  confidence: number;
  amount?: number;
  billingMonth?: string;
  dueDate?: string;
  issueDate?: string;
  templateId?: string;
  propertyId?: string;
  supplierCategory?: string;
  warnings: string[];
};

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
const datePattern = /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g;
function dates(value: string): string[] {
  return [...value.matchAll(datePattern)].flatMap((match) => {
    const [, d, m, y] = match;
    const date = new Date(Date.UTC(+y, +m - 1, +d));
    return date.getUTCFullYear() === +y &&
      date.getUTCMonth() === +m - 1 &&
      date.getUTCDate() === +d
      ? [`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`]
      : [];
  });
}
const monthNames = [
  "januar|sijecanj",
  "februar|veljaca",
  "mart|ozujak",
  "april|travanj",
  "maj|svibanj",
  "juni|jun|lipanj",
  "juli|jul|srpanj",
  "august|avgust|kolovoz",
  "septembar|rujan",
  "oktobar|listopad",
  "novembar|studeni",
  "decembar|prosinac",
];
function months(value: string): string[] {
  const fullDateTokens = [...value.matchAll(datePattern)];
  const fullDates = dates(value);
  // Never reinterpret an impossible full date as the month/year substring inside it.
  if (fullDateTokens.length !== fullDates.length) return [];
  const values = fullDates.map((date) => date.slice(0, 7));
  value = value.replace(datePattern, " ");
  values.push(
    ...[...value.matchAll(/\b(0?[1-9]|1[0-2])[./-](20\d{2})\b/g)].map(
      (m) => `${m[2]}-${m[1].padStart(2, "0")}`,
    ),
  );
  for (const m of value.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g))
    values.push(`${m[1]}-${m[2]}`);
  monthNames.forEach((name, index) => {
    for (const match of value.matchAll(
      new RegExp(`\\b(?:${name})\\s*[,./-]?\\s*(20\\d{2})\\b`, "g"),
    )) {
      values.push(`${match[1]}-${String(index + 1).padStart(2, "0")}`);
    }
  });
  return values;
}

/** Conservative suggestions only: no receipt-date month or supplier-headquarters property inference. */
export function extractBill(text: string, confidence = 100): ScanSuggestion {
  const result: ScanSuggestion = {
    text,
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(100, confidence))
      : 0,
    warnings: [],
  };
  const lines = fold(text)
    .replace(/(\d)\s*([./-])\s*(?=\d)/g, "$1$2")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const unique = <T>(values: T[]) => [...new Set(values)];
  const context = (index: number) =>
    lines[index] +
    (!/\d/.test(lines[index]) &&
    /^(?:\d|sarajevo\b|nisici\b)/.test(lines[index + 1] ?? "")
      ? " " + lines[index + 1]
      : "");
  const labeledDates = (label: RegExp) =>
    unique(
      lines.flatMap((line, i) => (label.test(line) ? dates(context(i)) : [])),
    );
  const due = labeledDates(
    /rok\s*(?:za\s*)?placanja|valuta\s*placanja|datum\s*dospijeca|dospijece/,
  );
  const issued = labeledDates(
    /datum\s*(?:izdavanja|racuna|izdavanja racuna)|izdato/,
  );
  if (due.length === 1) result.dueDate = due[0];
  if (issued.length === 1) result.issueDate = issued[0];
  if (due.length > 1 || issued.length > 1)
    result.warnings.push(
      "Pronađeno je više različitih datuma. Provjerite datume na računu.",
    );
  const periodLabel =
    /obracunski\s*(?:period|mjesec)|period\s*obracuna|racun\s*za\b|za\s*mjesec\b/;
  const period = unique(
    lines.flatMap((line, i) => {
      const label = periodLabel.exec(line);
      if (!label) return [];
      const section = context(i)
        .slice(label.index + label[0].length)
        .split(
          /datum\s*(?:izdavanja|racuna)|izdato|rok\s*(?:za\s*)?placanja|dospijece|valuta\s*placanja/,
        )[0];
      return months(section);
    }),
  );
  if (period.length === 1) result.billingMonth = period[0];
  else
    result.warnings.push(
      period.length > 1
        ? "Obračunski period obuhvata više mjeseci ili je nejasan. Odaberite mjesec ručno."
        : "Obračunski mjesec nije prepoznat. Datum izdavanja nije obračunski mjesec.",
    );

  const amounts: { value: number; score: number }[] = [];
  lines.forEach((line, i) => {
    const strongLabel =
      /ukupno\s*(?:za\s*)?(?:uplatu|placanje|platiti)|svega\s*za\s*(?:uplatu|placanje)/;
    const otherLabel =
      /(?:iznos\s*)?za\s*(?:uplatu|placanje|platiti)|iznos\s*racuna/;
    const score = strongLabel.test(line) ? 3 : otherLabel.test(line) ? 2 : 0;
    if (!score) return;
    const label = (score === 3 ? strongLabel : otherLabel).exec(context(i))!;
    // PDF/OCR can merge neighbouring columns. Restrict numeric candidates to the
    // payable section, stopping when a previous-balance section begins.
    const value = context(i)
      .slice(label.index + label[0].length)
      .split(
        /prethodni\s*(?:dug|saldo)|raniji\s*dug|stanje\s*(?:duga|prethodnog)/,
      )[0];
    if (/\b(?:eur|usd|rsd)\b/.test(value)) {
      result.warnings.push(
        "Pronađena je druga valuta. Aplikacija vodi iznose u BAM.",
      );
      return;
    }
    // Only decimal amounts after an explicit payable label qualify. Currency may
    // be in the column header, rather than repeated beside the printed amount.
    for (const match of value.matchAll(
      /(?:^|[^\d.,-])((?:\d{1,3}(?:[.\s]\d{3})+|\d+)[,.]\d{2})(?![\d.,])/g,
    )) {
      const normalized = match[1].replace(/\s/g, "");
      const decimalIndex = Math.max(
        normalized.lastIndexOf(","),
        normalized.lastIndexOf("."),
      );
      const amount = Number(
        normalized.slice(0, decimalIndex).replace(/[.,]/g, "") +
          "." +
          normalized.slice(decimalIndex + 1),
      );
      if (Number.isFinite(amount)) amounts.push({ value: amount, score });
    }
  });
  const bestScore = Math.max(...amounts.map((a) => a.score), 0);
  const totals = unique(
    amounts.filter((a) => a.score === bestScore).map((a) => a.value),
  );
  if (totals.length === 1) result.amount = totals[0];
  else
    result.warnings.push(
      totals.length > 1
        ? "Pronađeno je više različitih iznosa za uplatu. Provjerite ukupan iznos."
        : "Ukupan iznos za uplatu u KM/BAM nije pouzdano prepoznat.",
    );

  const locations = unique(
    lines.flatMap((line, i) => {
      if (
        !/mjesto\s*potrosnje|adresa\s*(?:potrosaca|kupca|korisnika|objekta)|mjerno\s*mjesto|lokacija\s*objekta/.test(
          line,
        )
      )
        return [];
      const value = context(i);
      return [
        ...(/\bsarajevo\b/.test(value) ? ["sarajevo"] : []),
        ...(/\bnisici\b/.test(value) ? ["nisici"] : []),
      ];
    }),
  );
  if (locations.length === 1) result.propertyId = locations[0];
  else
    result.warnings.push(
      locations.length > 1
        ? "Pronađeno je više različitih lokacija potrošnje. Odaberite objekat ručno."
        : "Objekat nije pouzdano prepoznat. Adresa dobavljača nije adresa potrošnje.",
    );
  const supplierText = lines.join("\n");
  const suppliers = unique(
    [
      /elektroprivreda|elektrodistribucija|elektricna\s*energija/.test(
        supplierText,
      )
        ? "electric"
        : "",
      /vodovod|vod(o)?snabdijevanje/.test(supplierText) ? "water" : "",
      /toplane|centralno\s*grijanje/.test(supplierText) ? "heat" : "",
      /telemach|bh\s*telecom|moj(a)?\s*tv|logosoft|internet/.test(supplierText)
        ? "net"
        : "",
      /kjkp\s*["'“]?rad\b|odvoz\s*(?:otpada|smeca)/.test(supplierText)
        ? "waste"
        : "",
      /sarajevostan/.test(supplierText) ? "maintenance" : "",
    ].filter(Boolean),
  );
  if (suppliers.length === 1) result.supplierCategory = suppliers[0];
  if (suppliers.length === 1 && result.propertyId) {
    const category = suppliers[0];
    if (
      result.propertyId === "sarajevo" ||
      ["electric", "water", "net"].includes(category)
    )
      result.templateId = `${result.propertyId === "sarajevo" ? "s" : "n"}-${category}`;
  }
  if (!result.templateId)
    result.warnings.push("Dobavljača i vrstu računa treba potvrditi ručno.");
  if (result.confidence < 75)
    result.warnings.push(
      "Tekst je slabo prepoznat. Pažljivo provjerite sva predložena polja.",
    );
  if (!result.dueDate)
    result.warnings.push("Rok plaćanja nije pouzdano prepoznat.");
  return result;
}
