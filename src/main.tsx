import React, { useEffect, useState, useRef } from "react";
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
import { useLedger } from "./family/useLedger";
import { FamilyPanel } from "./family/FamilyPanel";
import { Scanner } from "./scanning/Scanner";
import { saveDocument, deleteDocument } from "./scanning/documents";
import { DocumentPreview } from "./scanning/DocumentPreview";
import { currentBillingMonth } from "./preferences";
import { paymentAfterScan } from "./scanning/link";
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
const preferenceKey = "macaniracuni-view-v1";
function readView() {
  const fallbackMonth = currentBillingMonth();
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || "null");
    return {
      month:
        typeof value?.month === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)
          ? value.month
          : fallbackMonth,
      property: properties.some((p) => p.id === value?.property)
        ? value.property
        : "all",
    };
  } catch {
    return { month: fallbackMonth, property: "all" };
  }
}
function App() {
  const [warning, setWarning] = useState("");
  const [month, setMonth] = useState(() => readView().month);
  const [property, setProperty] = useState<string>(() => readView().property);
  const ledger = useLedger(month);
  const { bills, setBills } = ledger;
  const mixedDemo =
    ledger.mode === "local" &&
    bills.some((b) => b.isDemo === false) &&
    bills.some((b) => b.isDemo !== false && b.amount !== undefined);
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
  const change = (id: string, patch: Partial<Bill>) => {
    try {
      ledger.changeBill(id, patch);
      return true;
    } catch (err) {
      setWarning(
        err instanceof Error ? err.message : "Izmjene nije moguće sačuvati.",
      );
      return false;
    }
  };
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
            Vaš dom, na jednom mjestu.
            <small>Skeniranje · lokalno / porodica</small>
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
            {ledger.mode === "family"
              ? "PORODICA"
              : bills.some((b) => b.isDemo === false)
                ? mixedDemo
                  ? "DEMO + UNOSI"
                  : "LOKALNI UNOSI"
                : "DEMO PODACI"}
          </span>
        </header>
        {warning && (
          <p role="alert" className="notice">
            {warning}
          </p>
        )}
        {detail ? (
          <Detail
            key={ledger.mode + ":" + detail.id}
            bill={
              ledger.mode === "family" ? { ...detail, isDemo: false } : detail
            }
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
                  <span>
                    Poznati iznosi ·{" "}
                    {ledger.mode === "family"
                      ? "porodica"
                      : bills.some((b) => b.isDemo === false)
                        ? "vaši unosi"
                        : "DEMO"}
                  </span>
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
                          <span className="tiny-demo">
                            {ledger.mode === "family" || b.isDemo === false
                              ? "UNOS"
                              : "DEMO"}
                          </span>
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
            isFamily={ledger.mode === "family"}
          />
        ) : route === "scan" ? (
          <Scanner
            bills={bills}
            month={month}
            property={property}
            onDone={() => navigate("month")}
            onSave={async (draft, document) => {
              const existing =
                bills.find(
                  (b) =>
                    b.templateId === draft.templateId &&
                    b.billingMonth === draft.billingMonth,
                ) ||
                ensureMonth([], draft.billingMonth).find(
                  (b) => b.templateId === draft.templateId,
                )!;
              const targetId =
                bills.find(
                  (b) =>
                    b.templateId === draft.templateId &&
                    b.billingMonth === draft.billingMonth,
                )?.id || draft.billingMonth + "_" + draft.templateId;
              await saveDocument(document);
              try {
                ledger.setBills((all) => ensureMonth(all, draft.billingMonth));
                ledger.changeBill(targetId, {
                  ...paymentAfterScan(existing),
                  amount: draft.amount,
                  dueDate: draft.dueDate,
                  issueDate: draft.issueDate,
                  receiptStatus: draft.receiptStatus,
                  source: "paper",
                  documentId: document.id,
                  confidence: draft.confidence,
                  receivedAt: new Date().toISOString(),
                  isDemo: false,
                });
                setMonth(draft.billingMonth);
              } catch (err) {
                await deleteDocument(document.id).catch(() => {});
                throw err;
              }
            }}
          />
        ) : (
          <section className="settings">
            <p className="eyebrow">VAŠ MALI KUĆNI SISTEM</p>
            <h1>Postavke</h1>
            <FamilyPanel ledger={ledger} />
            <DataSettings
              bills={bills}
              isFamily={ledger.mode === "family"}
              restore={(data) => {
                const restored = ensureMonth(synchronizeMonths(data), month);
                ledger.replaceBills(restored);
              }}
            />
            <article>
              <h2>Nekretnine</h2>
              {properties.map((p) => (
                <p className="property-line" key={p.id}>
                  <House size={20} />
                  {p.name}
                  <span>
                    {ledger.mode === "family" ? "PORODICA" : "LOKALNO"}
                  </span>
                </p>
              ))}
            </article>
            <article>
              <h2>O ovoj verziji</h2>
              <p>
                Početni računi i iznosi su DEMO. Vlastiti unosi i dokumenti
                čuvaju se u ovom pregledniku kroz localStorage. Brisanje
                podataka preglednika briše lokalnu evidenciju.
              </p>
              <p>
                Kamera i lokalno prepoznavanje fotografija/PDF-a su dostupni.
                Gmail, obavijesti i plaćanje nisu povezani. Prijavom se
                uključuje porodična sinhronizacija podataka; nema provjere
                stanja kod dobavljača.
              </p>
              <p>
                Aplikaciju možete instalirati iz menija preglednika na podržanim
                uređajima. Nakon prve posjete dostupna je i bez interneta.
              </p>
            </article>
          </section>
        )}
        <footer>
          MacaniRacuni <span>Vaši računi. Vaš mir.</span>
        </footer>
      </main>
    </div>
  );
}
function billFormValues(b: Bill): Record<string, string> {
  return {
    amount: b.amount === undefined ? "" : String(b.amount),
    dueDate: b.dueDate || "",
    receivedAt: b.receivedAt?.slice(0, 10) || "",
    paidAt: b.paidAt?.slice(0, 10) || "",
    issueDate: b.issueDate || "",
    balance: b.previousBalance === undefined ? "" : String(b.previousBalance),
    balanceType: b.balanceType || "debt",
    source: b.source || "manual",
    notes: b.notes || "",
    receiptStatus: b.receiptStatus,
    paymentStatus: b.paymentStatus,
  };
}
function Detail({
  bill: b,
  change,
  back,
}: {
  bill: Bill;
  change: (id: string, p: Partial<Bill>) => boolean;
  back: () => void;
}) {
  const t = templates.find((t) => t.id === b.templateId)!;
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = useRef(new Set<string>());
  const base = useRef(billFormValues(b));
  const [changedElsewhere, setChangedElsewhere] = useState<string[]>([]);
  const [acceptNewer, setAcceptNewer] = useState(false);
  const signature = JSON.stringify(b);
  const field = (name: string) =>
    formRef.current?.elements.namedItem(name) as
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  function overlaps() {
    const latest = billFormValues(b);
    return [...dirty.current].filter(
      (name) =>
        base.current[name] !== latest[name] &&
        field(name)?.value !== latest[name],
    );
  }
  function loadLatest() {
    const latest = billFormValues(b);
    for (const name of Object.keys(latest)) {
      const el = field(name);
      if (el) el.value = latest[name];
    }
    dirty.current.clear();
    base.current = latest;
    setChangedElsewhere([]);
    setAcceptNewer(false);
    setSaved(false);
  }
  useEffect(() => {
    const latest = billFormValues(b);
    for (const name of Object.keys(latest)) {
      if (!dirty.current.has(name)) {
        const el = field(name);
        if (el) el.value = latest[name];
        base.current[name] = latest[name];
      }
    }
    setChangedElsewhere(overlaps());
    setAcceptNewer(false);
  }, [signature]);
  return (
    <section className="detail">
      <button className="back" onClick={back}>
        <ChevronLeft size={18} />
        Pregled mjeseca
      </button>
      <p className="eyebrow">
        DETALJI RAČUNA · {b.isDemo === false ? "VAŠ UNOS" : "DEMO"}
      </p>
      <h1>{t.providerName}</h1>
      <p className="muted">
        {properties.find((p) => p.id === t.propertyId)?.name} ·{" "}
        {monthName(b.billingMonth)}
      </p>
      {b.documentId && <DocumentPreview documentId={b.documentId} />}
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
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          const conflicting = overlaps();
          if (conflicting.length && !acceptNewer) {
            setChangedElsewhere(conflicting);
            return;
          }
          const f = new FormData(e.currentTarget);
          const allFields: Partial<Bill> = {
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
          const names: Record<string, keyof Bill> = {
            amount: "amount",
            dueDate: "dueDate",
            receivedAt: "receivedAt",
            paidAt: "paidAt",
            issueDate: "issueDate",
            balance: "previousBalance",
            balanceType: "balanceType",
            source: "source",
            notes: "notes",
            receiptStatus: "receiptStatus",
            paymentStatus: "paymentStatus",
          };
          const patch: Partial<Bill> = {};
          for (const name of dirty.current) {
            const key = names[name];
            if (key) Object.assign(patch, { [key]: allFields[key] });
          }
          const button = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          const now = new Date().toISOString();
          if (button?.value === "receipt") {
            patch.receiptStatus =
              b.receiptStatus === "received" ? "missing" : "received";
            patch.receivedAt =
              patch.receiptStatus === "received"
                ? (dirty.current.has("receivedAt")
                    ? patch.receivedAt
                    : b.receivedAt) || now
                : undefined;
          }
          if (button?.value === "payment") {
            patch.paymentStatus =
              b.paymentStatus === "paid" ? "unpaid" : "paid";
            patch.paidAt =
              patch.paymentStatus === "paid"
                ? (dirty.current.has("paidAt") ? patch.paidAt : b.paidAt) || now
                : undefined;
          }
          const ok = change(b.id, patch);
          setSaved(ok);
          if (ok) {
            dirty.current.clear();
            base.current = billFormValues({ ...b, ...patch });
            setChangedElsewhere([]);
            setAcceptNewer(false);
          }
        }}
        onChange={(event) => {
          const el: EventTarget = event.target;
          if (!(
            el instanceof HTMLInputElement ||
            el instanceof HTMLSelectElement ||
            el instanceof HTMLTextAreaElement
          ))
            return;
          if (!el.name || !(el.name in billFormValues(b))) return;
          if (!dirty.current.has(el.name))
            base.current[el.name] = billFormValues(b)[el.name];
          dirty.current.add(el.name);
          setSaved(false);
          setChangedElsewhere(overlaps());
          setAcceptNewer(false);
        }}
      >
        {changedElsewhere.length > 0 && (
          <div className="notice" role="alert">
            <strong>Podaci su promijenjeni na drugom uređaju.</strong>
            <p>
              Sačuvani su i tvoji unosi. Pregledaj novije podatke prije zamjene.
            </p>
            <ul>
              {changedElsewhere.map((name) => (
                <li key={name}>
                  {(
                    {
                      amount: "Iznos",
                      notes: "Napomena",
                      dueDate: "Rok",
                      receiptStatus: "Prijem",
                      paymentStatus: "Plaćanje",
                    } as Record<string, string>
                  )[name] || name}
                  : novije {billFormValues(b)[name] || "prazno"}
                </li>
              ))}
            </ul>
            <label className="draft-conflict-choice">
              <input
                type="checkbox"
                checked={acceptNewer}
                onChange={(e) => setAcceptNewer(e.target.checked)}
              />
              Zadrži moje izmjene preko novijih vrijednosti
            </label>
            <button className="secondary" type="button" onClick={loadLatest}>
              Učitaj novije vrijednosti
            </button>
          </div>
        )}
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
              name="paidAt"
              type="date"
              defaultValue={b.paidAt?.slice(0, 10)}
            />
          </label>
          <label>
            Izvor
            <select name="source" defaultValue={b.source || "manual"}>
              <option value="manual">Ručni unos</option>
              <option value="paper">
                {b.documentId
                  ? "Sken / fotografija / PDF"
                  : "Papir (ručno uneseno)"}
              </option>
              <option value="email">Stiglo na mail (ručno)</option>
            </select>
          </label>
          <label>
            Status prijema
            <select name="receiptStatus" defaultValue={b.receiptStatus}>
              <option value="missing">Nedostaje</option>
              <option value="received">Stigao</option>
              <option value="needs_review">Potrebna provjera</option>
            </select>
          </label>
          <label>
            Status plaćanja
            <select name="paymentStatus" defaultValue={b.paymentStatus}>
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
          {b.documentId
            ? `Original je priložen. OCR pouzdanost: ${Math.round(b.confidence ?? 0)}%. Provjerite prepoznate podatke.`
            : "Dokument nije priložen. Podaci su ručno uneseni."}
        </p>
        <button className="primary" type="submit">
          Sačuvaj izmjene <Check size={18} />
        </button>
        {saved && (
          <span role="status" className="saved">
            Izmjene su sačuvane na uređaju.
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
