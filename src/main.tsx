import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Plus,
  Settings,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Check,
  Clock3,
  House,
  Zap,
  Droplets,
  Wifi,
  Flame,
  Trash2,
  ScanLine,
  FileText,
} from "lucide-react";
import {
  ensureMonth,
  seed,
  templates,
  properties,
  summarize,
  updateBill,
  synchronizeMonths,
  type Bill,
} from "./domain";
import "./style.css";
import { DataSettings } from "./DataSettings";
import { Stats } from "./Stats";
import { validateBills } from "./backup";
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
const icons = [Zap, Droplets, Flame, Wifi, Trash2, Zap, Wifi, House, Droplets];
const storageKey = "macaniracuni-demo-v1";
const preferenceKey = "macaniracuni-view-v1";
function readView() {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || "null");
    return {
      month:
        typeof value?.month === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)
          ? value.month
          : "2026-10",
      property: properties.some((p) => p.id === value?.property)
        ? value.property
        : "all",
    };
  } catch {
    return { month: "2026-10", property: "all" };
  }
}
function App() {
  const [warning, setWarning] = useState("");
  const [bills, setBills] = useState<Bill[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const value = JSON.parse(raw);
        return synchronizeMonths(validateBills(value));
      }
    } catch {}
    return seed();
  });
  const [month, setMonth] = useState(() => readView().month);
  const [property, setProperty] = useState<string>(() => readView().property);
  const [route, setRoute] = useState(location.hash.slice(1) || "month");
  useEffect(() => {
    const fn = () => setRoute(location.hash.slice(1) || "month");
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    setBills((b) => ensureMonth(b, month));
  }, [month]);
  useEffect(() => {
    try {
      localStorage.setItem(preferenceKey, JSON.stringify({ month, property }));
    } catch {
      setWarning(
        "Preglednik ne dopušta čuvanje izabranog mjeseca i nekretnine.",
      );
    }
  }, [month, property]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(bills));
    } catch {
      setWarning(
        "Preglednik ne dopušta lokalno čuvanje. Izmjene traju samo dok je aplikacija otvorena.",
      );
    }
  }, [bills]);
  const current = bills.filter(
    (b) =>
      b.billingMonth === month &&
      (property === "all" ||
        templates.find((t) => t.id === b.templateId)?.propertyId === property),
  );
  const summary = summarize(current);
  const navigate = (r: string) => {
    location.hash = r;
  };
  const change = (id: string, patch: Partial<Bill>) =>
    setBills((all) => all.map((b) => (b.id === id ? updateBill(b, patch) : b)));
  const shift = (n: number) => {
    const d = new Date(month + "-15T12:00:00");
    d.setMonth(d.getMonth() + n);
    setMonth(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  };
  const detail = route.startsWith("bill/")
    ? bills.find((b) => b.id === decodeURIComponent(route.slice(5)))
    : undefined;
  return (
    <div className="app">
      <aside>
        <a className="brand" href="#month">
          <span className="brand-symbol">m.</span>MacaniRacuni
        </a>
        <div className="sidebar-note">
          MALO REDA.
          <br />
          VIŠE MIRA.
        </div>
        <nav>
          {[
            ["month", "Mjesec", CalendarDays],
            ["stats", "Statistika", ChartNoAxesCombined],
            ["scan", "Skeniraj", Plus],
            ["settings", "Postavke", Settings],
          ].map(([r, label, Icon]) => (
            <button
              key={String(r)}
              className={route === r ? "active" : ""}
              onClick={() => navigate(String(r))}
            >
              <Icon size={21} />
              <span>{String(label)}</span>
            </button>
          ))}
        </nav>
        <div className="aside-bottom">
          <House size={22} />
          <p>
            Vaš dom, na jednom mjestu.<small>Lokalna DEMO verzija · v0.1</small>
          </p>
        </div>
      </aside>
      <main className={route === "month" ? "month-page" : undefined}>
        <header>
          <span className="mobile-brand">MacaniRacuni</span>
          <span className="eyebrow desktop-label">
            PORODIČNI PREGLED RAČUNA
          </span>
          <span className="demo">
            <i />
            DEMO PODACI
          </span>
        </header>
        {warning && (
          <p role="alert" className="notice">
            {warning}
          </p>
        )}
        {detail ? (
          <Detail
            key={detail.id}
            bill={detail}
            change={change}
            back={() => navigate("month")}
          />
        ) : route.startsWith("bill/") ? (
          <section className="empty">
            <h1>Račun nije pronađen</h1>
            <button onClick={() => navigate("month")}>Nazad na mjesec</button>
          </section>
        ) : route === "month" ? (
          <>
            <div className="title-row">
              <div>
                <p className="eyebrow">SVE NA SVOM MJESTU</p>
                <h1>
                  Računi za
                  <br />
                  <span>{monthName(month)}.</span>
                </h1>
                <p className="muted">
                  Jedan pregled. Bez zaboravljenih računa.
                </p>
              </div>
              <div className="month-picker">
                <button aria-label="Prethodni mjesec" onClick={() => shift(-1)}>
                  <ChevronLeft />
                </button>
                <label>
                  <CalendarDays size={17} />
                  <input
                    aria-label="Obračunski mjesec"
                    type="month"
                    value={month}
                    onChange={(e) => e.target.value && setMonth(e.target.value)}
                  />
                </label>
                <button aria-label="Naredni mjesec" onClick={() => shift(1)}>
                  <ChevronRight />
                </button>
              </div>
            </div>
            <div className="overview">
              <section className="total-card">
                <div className="card-top">
                  <span>Poznati iznosi · DEMO</span>
                  <ArrowUpRight size={24} />
                </div>
                <div className="large-money">{money(summary.total)}</div>
                <div className="total-foot">
                  <span>
                    {summary.known} od {current.length} iznosa poznato
                  </span>
                  <span>Preostalo {money(summary.unpaid)}</span>
                </div>
              </section>
              <section className="progress-card">
                <div>
                  <span className="metric-icon">
                    <FileText size={19} />
                  </span>
                  <b>
                    {summary.received}
                    <small> / {current.length}</small>
                  </b>
                  <span>Primljeno</span>
                </div>
                <div>
                  <span className="metric-icon yellow">
                    <Check size={19} />
                  </span>
                  <b>
                    {summary.paid}
                    <small> / {current.length}</small>
                  </b>
                  <span>Plaćeno</span>
                </div>
                <div>
                  <span className="metric-icon blue">
                    <Clock3 size={19} />
                  </span>
                  <b>{summary.missing}</b>
                  <span>Nedostaje</span>
                </div>
              </section>
            </div>
            <div className="list-heading">
              <div>
                <h2>
                  Očekivani računi <span>{current.length}</span>
                </h2>
                <p className="muted">
                  Obračunski mjesec određuje gdje račun pripada.
                </p>
              </div>
              <div className="filters" aria-label="Filter nekretnine">
                {[{ id: "all", name: "Sve" }, ...properties].map((p) => (
                  <button
                    key={p.id}
                    aria-pressed={property === p.id}
                    className={property === p.id ? "selected" : ""}
                    onClick={() => setProperty(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <section className="bill-list">
              <div className="table-head">
                <span>DOBAVLJAČ / NEKRETNINA</span>
                <span>PRIJEM</span>
                <span>PLAĆANJE</span>
                <span>IZNOS</span>
                <span />
              </div>
              {current.map((b) => {
                const t = templates.find((t) => t.id === b.templateId)!;
                const Icon = icons[templates.indexOf(t)];
                return (
                  <button
                    className="bill-row"
                    key={b.id}
                    onClick={() => navigate("bill/" + encodeURIComponent(b.id))}
                  >
                    <span className="provider">
                      <span className={"provider-icon tone-" + t.category}>
                        <Icon size={23} />
                      </span>
                      <span>
                        <strong>{t.providerName}</strong>
                        <small>
                          {properties.find((p) => p.id === t.propertyId)?.name}{" "}
                          <span className="tiny-demo">DEMO</span>
                        </small>
                      </span>
                    </span>
                    <span className={"status " + b.receiptStatus}>
                      {b.receiptStatus === "missing" ? (
                        <Clock3 size={13} />
                      ) : (
                        <FileText size={13} />
                      )}{" "}
                      {b.receiptStatus === "received"
                        ? "Stigao"
                        : b.receiptStatus === "needs_review"
                          ? "Provjeriti"
                          : "Nedostaje"}
                    </span>
                    <span className={"status " + b.paymentStatus}>
                      {b.paymentStatus === "paid" ? (
                        <Check size={13} />
                      ) : (
                        <Clock3 size={13} />
                      )}{" "}
                      {b.paymentStatus === "paid"
                        ? "Plaćen"
                        : b.paymentStatus === "unknown"
                          ? "Nepoznato"
                          : "Nije plaćen"}
                    </span>
                    <span className="amount">
                      <strong>
                        {b.amount === undefined ? "—" : money(b.amount)}
                      </strong>
                      <small>
                        {b.dueDate
                          ? "Rok " +
                            b.dueDate.split("-").reverse().join(".") +
                            "."
                          : "Rok nije unesen"}
                      </small>
                    </span>
                    <ChevronRight size={18} className="row-arrow" />
                  </button>
                );
              })}
            </section>
            <div className="bottom-note">
              <span>✳</span>
              <p>
                Stigao račun ne znači i plaćen račun.
                <br />
                <strong>Prijem i plaćanje uvijek pratimo odvojeno.</strong>
              </p>
              <span className="note-right">Mirniji mjesec počinje ovdje.</span>
            </div>
          </>
        ) : route === "stats" ? (
          <Stats
            bills={bills}
            month={month}
            setMonth={setMonth}
            property={property}
            setProperty={setProperty}
          />
        ) : route === "scan" ? (
          <section className="empty">
            <div className="scan-icon">
              <ScanLine size={52} />
            </div>
            <p className="eyebrow">MANJE PREPISIVANJA, USKORO</p>
            <h1>Račun na dohvat ruke.</h1>
            <p>Skeniranje i prepoznavanje dokumenata dolaze u narednoj fazi.</p>
            <p className="muted">
              U ovoj DEMO verziji unesite podatke ručno kroz detalj očekivanog
              računa.
            </p>
            <button className="primary" onClick={() => navigate("month")}>
              Otvori očekivane račune <ArrowUpRight size={18} />
            </button>
          </section>
        ) : (
          <section className="settings">
            <p className="eyebrow">VAŠ MALI KUĆNI SISTEM</p>
            <h1>Postavke</h1>
            <DataSettings
              bills={bills}
              restore={(data) => {
                const restored = ensureMonth(synchronizeMonths(data), month);
                localStorage.setItem(storageKey, JSON.stringify(restored));
                setBills(restored);
              }}
            />
            <article>
              <h2>Nekretnine</h2>
              {properties.map((p) => (
                <p className="property-line" key={p.id}>
                  <House size={20} />
                  {p.name}
                  <span>DEMO</span>
                </p>
              ))}
            </article>
            <article>
              <h2>O ovoj verziji</h2>
              <p>
                Svi računi i iznosi su demonstracijski. Izmjene se čuvaju u ovom
                pregledniku kroz localStorage. Brisanje podataka preglednika
                briše lokalnu evidenciju.
              </p>
              <p>
                Gmail, kamera, OCR, obavijesti i plaćanje nisu povezani. Nema
                porodične sinhronizacije ni provjere stanja kod dobavljača.
              </p>
              <p>
                Aplikaciju možete instalirati iz menija preglednika na podržanim
                uređajima. Nakon prve posjete dostupna je i bez interneta.
              </p>
            </article>
          </section>
        )}
        <footer>
          MacaniRacuni <span>Vaši računi. Vaš mir. · DEMO</span>
        </footer>
      </main>
    </div>
  );
}
function Detail({
  bill: b,
  change,
  back,
}: {
  bill: Bill;
  change: (id: string, p: Partial<Bill>) => void;
  back: () => void;
}) {
  const t = templates.find((t) => t.id === b.templateId)!;
  const [saved, setSaved] = useState(false);
  return (
    <section className="detail">
      <button className="back" onClick={back}>
        <ChevronLeft size={18} />
        Pregled mjeseca
      </button>
      <p className="eyebrow">DETALJI RAČUNA · DEMO</p>
      <h1>{t.providerName}</h1>
      <p className="muted">
        {properties.find((p) => p.id === t.propertyId)?.name} ·{" "}
        {monthName(b.billingMonth)}
      </p>
      <div className="detail-status">
        <button
          className={b.receiptStatus === "received" ? "primary" : "secondary"}
          type="submit"
          form="bill-details"
          name="quickAction"
          value="receipt"
        >
          <FileText size={18} />
          {b.receiptStatus === "received"
            ? "Primljen · poništi"
            : "Označi kao primljen"}
        </button>
        <button
          className={b.paymentStatus === "paid" ? "primary" : "secondary"}
          type="submit"
          form="bill-details"
          name="quickAction"
          value="payment"
        >
          <Check size={18} />
          {b.paymentStatus === "paid"
            ? "Plaćen · poništi"
            : "Označi kao plaćen"}
        </button>
      </div>
      <form
        id="bill-details"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const patch: Partial<Bill> = {
            amount:
              f.get("amount") === "" ? undefined : Number(f.get("amount")),
            dueDate: String(f.get("dueDate")) || undefined,
            receivedAt: String(f.get("receivedAt")) || undefined,
            paidAt: String(f.get("paidAt")) || undefined,
            issueDate: String(f.get("issueDate")) || undefined,
            previousBalance:
              f.get("balance") === "" ? undefined : Number(f.get("balance")),
            balanceType: String(f.get("balanceType")) as Bill["balanceType"],
            source: String(f.get("source")) as Bill["source"],
            notes: String(f.get("notes")),
            receiptStatus: String(
              f.get("receiptStatus"),
            ) as Bill["receiptStatus"],
            paymentStatus: String(
              f.get("paymentStatus"),
            ) as Bill["paymentStatus"],
          };
          const button = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          const now = new Date().toISOString();
          if (button?.value === "receipt") {
            patch.receiptStatus =
              b.receiptStatus === "received" ? "missing" : "received";
            patch.receivedAt =
              patch.receiptStatus === "received"
                ? patch.receivedAt || now
                : undefined;
          }
          if (button?.value === "payment") {
            patch.paymentStatus =
              b.paymentStatus === "paid" ? "unpaid" : "paid";
            patch.paidAt =
              patch.paymentStatus === "paid" ? patch.paidAt || now : undefined;
          }
          change(b.id, patch);
          setSaved(true);
        }}
        onChange={() => setSaved(false)}
      >
        <div className="form-grid">
          <label>
            Iznos (KM)
            <input
              name="amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={b.amount}
            />
          </label>
          <label>
            Datum dospijeća
            <input name="dueDate" type="date" defaultValue={b.dueDate} />
          </label>
          <label>
            Datum prijema
            <input
              key={b.receivedAt}
              name="receivedAt"
              type="date"
              defaultValue={b.receivedAt?.slice(0, 10)}
            />
          </label>
          <label>
            Datum izdavanja
            <input name="issueDate" type="date" defaultValue={b.issueDate} />
          </label>
          <label>
            Datum plaćanja
            <input
              key={b.paidAt}
              name="paidAt"
              type="date"
              defaultValue={b.paidAt?.slice(0, 10)}
            />
          </label>
          <label>
            Izvor
            <select name="source" defaultValue={b.source || "manual"}>
              <option value="manual">Ručni unos</option>
              <option value="paper">Papir (ručno uneseno)</option>
              <option value="email">Stiglo na mail (ručno)</option>
            </select>
          </label>
          <label>
            Status prijema
            <select
              key={b.receiptStatus}
              name="receiptStatus"
              defaultValue={b.receiptStatus}
            >
              <option value="missing">Nedostaje</option>
              <option value="received">Stigao</option>
              <option value="needs_review">Potrebna provjera</option>
            </select>
          </label>
          <label>
            Status plaćanja
            <select
              key={b.paymentStatus}
              name="paymentStatus"
              defaultValue={b.paymentStatus}
            >
              <option value="unpaid">Nije plaćen</option>
              <option value="paid">Plaćen</option>
              <option value="unknown">Nepoznato</option>
            </select>
          </label>
          <label>
            Prethodni dug / preplata (KM)
            <input
              type="number"
              min="0"
              step="0.01"
              name="balance"
              defaultValue={b.previousBalance}
            />
          </label>
          <label>
            Vrsta prethodnog stanja
            <select name="balanceType" defaultValue={b.balanceType || "debt"}>
              <option value="debt">Dug iz dokumenta</option>
              <option value="credit">Preplata iz dokumenta</option>
            </select>
          </label>
        </div>
        <label>
          Napomena
          <textarea name="notes" rows={3} defaultValue={b.notes} />
        </label>
        <p className="muted">
          Prethodno stanje je podatak iz dokumenta, bez provjere kod dobavljača.
          Dokument nije priložen. Podaci su ručno uneseni; automatska procjena
          pouzdanosti nije dostupna.
        </p>
        <button className="primary" type="submit">
          Sačuvaj izmjene <Check size={18} />
        </button>
        {saved && (
          <span role="status" className="saved">
            Izmjene sačuvane u DEMO evidenciji.
          </span>
        )}
      </form>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
