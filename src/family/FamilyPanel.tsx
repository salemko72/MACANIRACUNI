import { Cloud, LogIn, RefreshCw, Check, AlertTriangle } from "lucide-react";
import { templates, properties } from "../domain";
import type { useLedger } from "./useLedger";
import "./family.css";
export function FamilyPanel({
  ledger: l,
}: {
  ledger: ReturnType<typeof useLedger>;
}) {
  const labels: Record<string, string> = {
    checking: "Provjera prijave…",
    anonymous: "Lokalna evidencija",
    unavailable: "Prijava se priprema",
    syncing: "Sinhronizacija…",
    synced: "Sve izmjene su sinhronizovane",
    pending: "Izmjene čekaju slanje",
    offline: "Rad bez veze",
    login_required: "Potrebna ponovna prijava",
    conflict: "Potrebna provjera izmjena",
  };
  return (
    <article className="family-panel">
      <div className="family-title">
        <Cloud size={23} />
        <div>
          <h2>Porodična evidencija</h2>
          <p>{labels[l.status] || l.status}</p>
        </div>
      </div>
      {l.mode === "family" ? (
        <>
          <p>
            Prijavljen/a kao <strong>{l.email}</strong>. Podaci računa se
            automatski usklađuju između prijavljenih uređaja. Originalne slike i
            PDF dokumenti ostaju na uređaju na kojem su skenirani.
          </p>
          <div className="family-status">
            <Check size={17} />
            {l.pendingCount
              ? `${l.pendingCount} izmjena čeka slanje`
              : "Lokalna kopija je sačuvana"}
          </div>
          <div className="backup-actions">
            <button className="secondary" onClick={() => void l.sync()}>
              <RefreshCw size={16} />
              Uskladi sada
            </button>
            {l.status === "login_required" && (
              <a className="primary" href="/api/login">
                Nastavi prijavu
              </a>
            )}
            <button className="secondary" onClick={l.useLocal}>
              Otvori lokalni DEMO
            </button>
            <button
              className="secondary"
              disabled={
                l.pendingCount > 0 || Object.keys(l.conflicts).length > 0
              }
              onClick={l.logout}
            >
              Odjavi se
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Prijavite se jednokratnim kodom na odobrenu email adresu. Porodični
            dio počinje praznim očekivanim računima; DEMO iznosi se ne prenose
            automatski.
          </p>
          <a className="primary" href="/api/login">
            <LogIn size={17} />
            Prijavi porodicu
          </a>
          <p className="muted">
            Bez nove lozinke. Postojeći lokalni unosi ostaju sačuvani odvojeno.
          </p>
        </>
      )}
      {l.error && (
        <p className="notice" role="status">
          {l.error}
        </p>
      )}
      {Object.entries(l.conflicts).map(([id, remote]) => {
        const t = templates.find((t) => t.id === remote.bill.templateId);
        const local = l.bills.find((b) => b.id === id);
        const fmt = (amount?: number) =>
          amount === undefined
            ? "—"
            : new Intl.NumberFormat("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }).format(amount) + " KM";
        return (
          <div key={id} className="family-conflict">
            <h3>
              <AlertTriangle size={17} />
              Račun je promijenjen na drugom uređaju
            </h3>
            <p>
              {t?.providerName} ·{" "}
              {properties.find((p) => p.id === t?.propertyId)?.name} ·{" "}
              {remote.bill.billingMonth}
            </p>
            <p>
              Tvoja izmjena je sačuvana. Izaberi koju verziju želite zadržati.
            </p>
            <table className="conflict-compare">
              <thead>
                <tr>
                  <th>Podatak</th>
                  <th>Moja verzija</th>
                  <th>Porodica</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Iznos</td>
                  <td>{fmt(local?.amount)}</td>
                  <td>{fmt(remote.bill.amount)}</td>
                </tr>
                <tr>
                  <td>Plaćanje</td>
                  <td>
                    {local?.paymentStatus === "paid"
                      ? "Plaćen"
                      : local?.paymentStatus === "unknown"
                        ? "Nepoznato"
                        : "Nije plaćen"}
                  </td>
                  <td>
                    {remote.bill.paymentStatus === "paid"
                      ? "Plaćen"
                      : remote.bill.paymentStatus === "unknown"
                        ? "Nepoznato"
                        : "Nije plaćen"}
                  </td>
                </tr>
                <tr>
                  <td>Napomena</td>
                  <td>{local?.notes || "—"}</td>
                  <td>{remote.bill.notes || "—"}</td>
                </tr>
              </tbody>
            </table>
            <div className="backup-actions">
              <button
                className="primary"
                onClick={() => l.resolve(id, "local")}
              >
                Zadrži moju izmjenu
              </button>
              <button
                className="secondary"
                onClick={() => l.resolve(id, "remote")}
              >
                Uzmi porodičnu verziju
              </button>
            </div>
          </div>
        );
      })}
    </article>
  );
}
