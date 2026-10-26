import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { properties, templates, summarize, type Bill } from "./domain";
const money = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + " KM";
const monthName = (m: string) =>
  [
    "januar",
    "februar",
    "mart",
    "april",
    "maj",
    "juni",
    "juli",
    "august",
    "septembar",
    "oktobar",
    "novembar",
    "decembar",
  ][Number(m.slice(5)) - 1] +
  " " +
  m.slice(0, 4);
export function Stats({
  bills,
  month,
  setMonth,
  property,
  setProperty,
  isFamily = false,
}: {
  bills: Bill[];
  month: string;
  setMonth: (m: string) => void;
  property: string;
  setProperty: (p: string) => void;
  isFamily?: boolean;
}) {
  const filtered = bills.filter(
    (b) =>
      property === "all" ||
      templates.find((t) => t.id === b.templateId)?.propertyId === property,
  );
  const includesDemo =
    !isFamily &&
    filtered.some((b) => b.amount !== undefined && b.isDemo !== false);
  const shift = (n: number) => {
    const d = new Date(month + "-15T12:00:00");
    d.setMonth(d.getMonth() + n);
    setMonth(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  };
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(month + "-15T12:00:00");
    d.setMonth(d.getMonth() - 5 + i);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  });
  const rows = months.map((m) => ({
    m,
    ...summarize(filtered.filter((b) => b.billingMonth === m)),
  }));
  const current = rows[5],
    previous = rows[4];
  const max = Math.max(1, ...rows.map((r) => r.total));
  const selectedTemplates = templates.filter(
    (t) => property === "all" || t.propertyId === property,
  );
  return (
    <section className="stats">
      <p className="eyebrow">
        ŠIRA SLIKA ·{" "}
        {isFamily || bills.some((b) => b.isDemo === false)
          ? "VAŠI PODACI"
          : "DEMO"}
      </p>
      {includesDemo && (
        <p className="notice">
          Pregled uključuje DEMO primjere. DEMO i stvarni iznosi nisu međusobno
          uporedivi; za zajedničku stvarnu evidenciju otvorite porodični dio.
        </p>
      )}
      <div className="title-row">
        <div>
          <h1>Mjesec po mjesec.</h1>
          <p className="muted">
            Poznati iznosi za {monthName(month)}. Bez procjena za račune koji
            nedostaju.
          </p>
        </div>
        <div className="month-picker">
          <button aria-label="Prethodni mjesec" onClick={() => shift(-1)}>
            <ChevronLeft />
          </button>
          <label>
            <CalendarDays size={17} />
            <input
              type="month"
              aria-label="Obračunski mjesec"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </label>
          <button aria-label="Naredni mjesec" onClick={() => shift(1)}>
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="filters stats-filters">
        {[{ id: "all", name: "Sve" }, ...properties].map((p) => (
          <button
            aria-pressed={p.id === property}
            className={p.id === property ? "selected" : ""}
            key={p.id}
            onClick={() => setProperty(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="stats-summary">
        <article>
          <span className="eyebrow">POZNATI IZNOSI</span>
          <strong className="stat-total">
            {current.known ? money(current.total) : "—"}
          </strong>
          <p>
            {current.known} od {selectedTemplates.length} iznosa poznato
          </p>
        </article>
        <article>
          <span className="eyebrow">OZNAČENO KAO PLAĆENO</span>
          <strong>
            {current.paid} / {selectedTemplates.length}
          </strong>
          <p>Poznati plaćeni iznosi: {money(current.total - current.unpaid)}</p>
        </article>
        <article>
          <span className="eyebrow">PREOSTALI POZNATI IZNOSI</span>
          <strong>{current.known ? money(current.unpaid) : "—"}</strong>
          <p>Uključuje neplaćene i nepoznat status.</p>
        </article>
      </div>
      <article>
        <h2>Mjesečni pregled</h2>
        <p className="muted">
          Posljednjih šest obračunskih mjeseci ·{" "}
          {properties.find((p) => p.id === property)?.name || "Obje nekretnine"}
        </p>
        {rows.map((r) => (
          <div className="chart-row" key={r.m}>
            <span>{monthName(r.m)}</span>
            <div
              className="bar-track"
              role="img"
              aria-label={r.known ? money(r.total) : "Nema poznatih iznosa"}
            >
              <div style={{ width: (r.total / max) * 100 + "%" }} />
            </div>
            <strong>{r.known ? money(r.total) : "Nema iznosa"}</strong>
            <small>
              {r.known}/{selectedTemplates.length} poznato
            </small>
          </div>
        ))}
        <p className="notice">
          {current.known && previous.known
            ? `Razlika poznatih zbirova: ${money(current.total - previous.total)} (${current.known} naspram ${previous.known} poznatih iznosa). Različit obuhvat ili potrošnja mogu promijeniti zbir; ovo nije potvrđena promjena cijena.`
            : "Za poređenje s prethodnim mjesecom potrebni su poznati iznosi u oba mjeseca."}
        </p>
      </article>
      <article>
        <h2>Trend po dobavljaču</h2>
        <p className="muted">
          {monthName(previous.m)} → {monthName(month)}. Porast iznosa može
          značiti i veću potrošnju.
        </p>
        {selectedTemplates.map((t) => {
          const a = filtered.find(
            (b) => b.templateId === t.id && b.billingMonth === month,
          );
          const p = filtered.find(
            (b) => b.templateId === t.id && b.billingMonth === previous.m,
          );
          const comparable =
            a?.amount !== undefined &&
            p?.amount !== undefined &&
            (a.isDemo === false) === (p.isDemo === false);
          return (
            <div className="supplier-trend" key={t.id}>
              <span>
                {t.providerName}
                <small>
                  {properties.find((p) => p.id === t.propertyId)?.name} ·{" "}
                  {isFamily || a?.isDemo === false ? "UNOS" : "DEMO"}
                </small>
              </span>
              <strong>
                {comparable
                  ? `${money(p.amount!)} → ${money(a.amount!)}`
                  : "Nedovoljno podataka"}
              </strong>
              {comparable && a.amount! > p.amount! * 1.1 && (
                <span className="status missing">
                  Porast preko 10% · provjeriti račun
                </span>
              )}
            </div>
          );
        })}
      </article>
    </section>
  );
}
