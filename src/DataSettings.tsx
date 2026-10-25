import { useRef, useState } from "react";
import { Download, Upload, Check, X } from "lucide-react";
import { createBackup, readBackup } from "./backup";
import type { Bill } from "./domain";

export function DataSettings({
  bills,
  restore,
}: {
  bills: Bill[];
  restore: (bills: Bill[]) => void;
}) {
  const [pending, setPending] = useState<Bill[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  function download() {
    const url = URL.createObjectURL(
      new Blob([createBackup(bills)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `MacaniRacuni-DEMO-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Sigurnosna kopija je pripremljena za preuzimanje.");
  }
  return (
    <article>
      <h2>Sigurnosna kopija</h2>
      <p>
        Sačuvajte sve mjesece, iznose i napomene u JSON datoteku. Kopija sadrži
        DEMO evidenciju iz ovog preglednika.
      </p>
      <div className="backup-actions">
        <button className="primary" onClick={download}>
          <Download size={17} />
          Preuzmi sigurnosnu kopiju
        </button>
        <button className="secondary" onClick={() => file.current?.click()}>
          <Upload size={17} />
          Uvezi kopiju
        </button>
      </div>
      <input
        className="file-input"
        ref={file}
        aria-label="Datoteka sigurnosne kopije"
        type="file"
        accept=".json,application/json"
        onChange={async (e) => {
          const selected = e.target.files?.[0];
          e.target.value = "";
          setPending(null);
          setError("");
          setMessage("");
          if (!selected) return;
          try {
            if (selected.size > 10 * 1024 * 1024)
              throw new Error("Najveća dozvoljena veličina je 10 MB.");
            setPending(readBackup(await selected.text()));
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Datoteku nije moguće pročitati.",
            );
          }
        }}
      />
      {error && (
        <p className="notice" role="alert">
          Uvoz nije izvršen: {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {pending && (
        <div className="import-preview">
          <h3>Pregled kopije</h3>
          <p>
            {pending.length} računa ·{" "}
            {new Set(pending.map((b) => b.billingMonth)).size} obračunskih
            mjeseci
          </p>
          <p>
            Potvrdom zamjenjujete trenutnu lokalnu evidenciju ({bills.length}{" "}
            računa). Prije zamjene preuzmite trenutnu kopiju ako je želite
            sačuvati.
          </p>
          <div className="backup-actions">
            <button
              className="primary"
              onClick={() => {
                try {
                  restore(pending);
                  setPending(null);
                  setError("");
                  setMessage(
                    "Sigurnosna kopija je vraćena i sačuvana u ovom pregledniku.",
                  );
                } catch {
                  setError(
                    "Preglednik ne dopušta čuvanje kopije. Postojeća evidencija nije zamijenjena.",
                  );
                }
              }}
            >
              <Check size={17} />
              Zamijeni evidenciju
            </button>
            <button className="secondary" onClick={() => setPending(null)}>
              <X size={17} />
              Odustani
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
