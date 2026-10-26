import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  Upload,
  ScanLine,
  X,
  ArrowLeft,
  Check,
  ShieldCheck,
  AlertTriangle,
  FileText,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import { properties, templates, type Bill } from "../domain";
import { findDocumentByHash, type LocalDocument } from "./documents";
import { recognizeDocument } from "./recognize";
import "./scanner.css";
export type { LocalDocument } from "./documents";
export interface ScanDraft {
  templateId: string;
  billingMonth: string;
  amount?: number;
  dueDate?: string;
  issueDate?: string;
  receiptStatus: "received" | "needs_review";
  text: string;
  confidence: number;
}
interface Props {
  bills: Bill[];
  month: string;
  property: string;
  onSave: (draft: ScanDraft, document: LocalDocument) => Promise<void>;
  onDone: () => void;
}
export function Scanner({ bills, month, property, onSave, onDone }: Props) {
  const [step, setStep] = useState<"choose" | "reading" | "review">("choose");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Priprema dokumenta…");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [document, setDocument] = useState<LocalDocument>();
  const [preview, setPreview] = useState("");
  const [imageBroken, setImageBroken] = useState(false);
  const [draft, setDraft] = useState<ScanDraft>({
    templateId: "",
    billingMonth: month,
    receiptStatus: "needs_review",
    text: "",
    confidence: 0,
  });
  const [selectedProperty, setSelectedProperty] = useState(
    property === "all" ? "sarajevo" : property,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setImageBroken(false);
    if (!document) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(document.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [document]);
  const matchingBill = bills.find(
    (b) =>
      b.templateId === draft.templateId &&
      b.billingMonth === draft.billingMonth,
  );
  const hasExisting = Boolean(
    matchingBill &&
    ((matchingBill as Bill & { documentId?: string }).documentId ||
      (matchingBill.isDemo !== true &&
        (matchingBill.receiptStatus !== "missing" ||
          matchingBill.amount !== undefined ||
          matchingBill.dueDate ||
          matchingBill.issueDate))),
  );
  const supplier = templates.find((t) => t.id === draft.templateId);
  const needsReview =
    draft.confidence < 75 ||
    warnings.length > 0 ||
    !draft.templateId ||
    draft.amount === undefined ||
    !draft.dueDate;
  const updateDraft = (patch: Partial<ScanDraft>) => {
    setDraft((value) => ({ ...value, ...patch }));
    setReplaceConfirmed(false);
  };
  function reset() {
    controller.current?.abort();
    setStep("choose");
    setDocument(undefined);
    setError("");
    setReplaceConfirmed(false);
  }
  async function selectFile(file?: File) {
    if (!file) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setProgress(0);
    setLabel("Priprema dokumenta…");
    setStep("reading");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
          file.type,
        )
      )
        throw new Error("Odaberite JPEG, PNG, WebP sliku ili PDF dokument.");
      if (!file.size || file.size > 20 * 1024 * 1024)
        throw new Error(
          "Dokument mora biti manji od 20 MB i ne smije biti prazan.",
        );
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const sha256 = Array.from(new Uint8Array(digest), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
      const duplicate = await findDocumentByHash(sha256);
      if (abort.signal.aborted) return;
      if (duplicate)
        throw new Error(
          "Ovaj dokument je već sačuvan na uređaju. Otvorite postojeći račun; isti original nije ponovo dodan.",
        );
      const suggestion = await recognizeDocument(
        file,
        (value, message) => {
          if (!abort.signal.aborted) {
            setProgress(Math.min(100, Math.max(0, value)));
            setLabel(message);
          }
        },
        abort.signal,
      );
      if (abort.signal.aborted) return;
      const inferred =
        templates.find((t) => t.id === suggestion.templateId) ??
        (property !== "all" && !suggestion.propertyId
          ? templates.find(
              (t) =>
                t.propertyId === property &&
                t.category === suggestion.supplierCategory,
            )
          : undefined);
      const location =
        inferred?.propertyId ??
        suggestion.propertyId ??
        (property === "all" ? "sarajevo" : property);
      setSelectedProperty(
        properties.some((p) => p.id === location) ? location : "sarajevo",
      );
      setDraft({
        templateId: inferred?.id ?? "",
        billingMonth: suggestion.billingMonth ?? month,
        amount: suggestion.amount,
        dueDate: suggestion.dueDate,
        issueDate: suggestion.issueDate,
        receiptStatus: suggestion.confidence < 75 ? "needs_review" : "received",
        text: suggestion.text,
        confidence: suggestion.confidence,
      });
      setWarnings(suggestion.warnings);
      setDetailsOpen(
        !inferred ||
          suggestion.confidence < 75 ||
          suggestion.amount === undefined ||
          !suggestion.dueDate,
      );
      setReplaceConfirmed(false);
      setDocument({
        id: crypto.randomUUID(),
        filename: file.name,
        mimeType: file.type,
        blob: file,
        sha256,
        uploadedAt: new Date().toISOString(),
        text: suggestion.text,
        confidence: suggestion.confidence,
      });
      setStep("review");
    } catch (cause) {
      if (abort.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Dokument nije moguće pročitati. Pokušajte ponovo.",
      );
      setStep("choose");
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (
      !document ||
      !draft.templateId ||
      (hasExisting && !replaceConfirmed) ||
      saving
    )
      return;
    setSaving(true);
    setError("");
    try {
      await onSave(
        {
          ...draft,
          receiptStatus:
            draft.receiptStatus === "needs_review"
              ? "needs_review"
              : "received",
        },
        document,
      );
      onDone();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Čuvanje nije uspjelo. Dokument je još ovdje; pokušajte ponovo.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="scanner" aria-label="Skeniranje računa">
      <header className="scan-header">
        <div>
          <span className="scan-eyebrow">PAPIR U REDU</span>
          <h2>{step === "review" ? "Još samo provjera." : "Dodaj račun."}</h2>
        </div>
        <button
          type="button"
          className="scan-close"
          aria-label="Zatvori skeniranje"
          disabled={saving}
          onClick={onDone}
        >
          <X size={21} />
        </button>
      </header>
      {error ? (
        <div className="scan-notice scan-error" role="alert">
          <AlertTriangle size={19} />
          <span>{error}</span>
        </div>
      ) : null}
      {step === "choose" ? (
        <>
          <div className="scan-intro-icon">
            <ScanLine size={42} strokeWidth={1.4} />
          </div>
          <p className="scan-lead">
            Od papira do pregleda,
            <br />
            <strong>u nekoliko trenutaka.</strong>
          </p>
          <p className="scan-muted scan-centered">
            Fotografiši račun ili priloži dokument.
            <br />
            Prepoznate podatke potvrđuješ prije čuvanja.
          </p>
          <input
            ref={camera}
            hidden
            className="scan-file-input"
            aria-label="Fotografiši račun"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(event) => {
              void selectFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={upload}
            hidden
            className="scan-file-input"
            aria-label="Priloži sliku ili PDF"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => {
              void selectFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="scan-entry-actions">
            <button
              type="button"
              className="scan-primary"
              onClick={() => camera.current?.click()}
            >
              <Camera size={21} /> Fotografiši račun
            </button>
            <button
              type="button"
              className="scan-secondary"
              onClick={() => upload.current?.click()}
            >
              <Upload size={20} /> Priloži sliku ili PDF
            </button>
          </div>
          <p className="scan-small scan-centered">
            JPEG, PNG, WebP ili PDF · do 20 MB
            <br />
            Savjet: cijeli račun, ravna podloga i dobro svjetlo.
          </p>
          <div className="scan-privacy">
            <ShieldCheck size={19} />
            <span>
              Prepoznavanje i original ostaju na ovom uređaju. Prvo korištenje
              preuzima alat za čitanje teksta.
            </span>
          </div>
        </>
      ) : step === "reading" ? (
        <div className="scan-progress-panel" aria-live="polite">
          <div className="scan-reading-icon">
            <ScanLine size={44} />
          </div>
          <h3>Čitamo tvoj račun…</h3>
          <p>{label}</p>
          <progress
            max="100"
            value={progress}
            aria-label="Napredak prepoznavanja"
          />
          <p className="scan-small">
            {Math.round(progress)}% · Može potrajati pri prvom korištenju.
          </p>
          <button type="button" className="scan-secondary" onClick={reset}>
            Otkaži
          </button>
        </div>
      ) : document ? (
        <form onSubmit={save}>
          <div className="scan-review-grid">
            <div className="scan-paper-preview">
              {document.mimeType.startsWith("image/") &&
              preview &&
              !imageBroken ? (
                <img
                  src={preview}
                  alt="Pregled priloženog računa"
                  onError={() => setImageBroken(true)}
                />
              ) : (
                <div className="scan-pdf-placeholder">
                  <FileText size={42} />
                  <span>
                    {document.mimeType === "application/pdf"
                      ? "PDF dokument"
                      : "Pregled nije dostupan"}
                  </span>
                </div>
              )}
              <span className="scan-paper-name">{document.filename}</span>
              {preview ? (
                <a href={preview} target="_blank" rel="noopener noreferrer">
                  Otvori cijeli original ↗
                </a>
              ) : null}
            </div>
            <div className="scan-review-content">
              <div className="scan-detected">
                <Check size={16} /> Dokument je pročitan{" "}
                <span>{Math.round(draft.confidence)}%</span>
              </div>
              <h3>{supplier?.providerName ?? "Odaberi vrstu računa"}</h3>
              <p className="scan-muted">
                {properties.find((p) => p.id === selectedProperty)?.name} ·{" "}
                {draft.billingMonth}
              </p>
              <div className="scan-amount">
                {draft.amount !== undefined
                  ? new Intl.NumberFormat("de-DE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }).format(draft.amount)
                  : "—"}
                <small> KM</small>
              </div>
              <p className="scan-due">
                Rok plaćanja:{" "}
                <strong>
                  {draft.dueDate
                    ? draft.dueDate.split("-").reverse().join(".")
                    : "nije prepoznat"}
                </strong>
              </p>
              {needsReview ? (
                <div className="scan-notice">
                  <AlertTriangle size={18} />
                  <span>
                    Provjeri podatke prije čuvanja. Prepoznavanje može
                    pogriješiti.
                    {warnings.length > 0 ? (
                      <ul>
                        {warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <details
            className="scan-details"
            open={detailsOpen}
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
          >
            <summary>
              Provjeri ili izmijeni podatke <ChevronDown size={17} />
            </summary>
            <div className="scan-fields">
              <label>
                Objekat
                <select
                  value={selectedProperty}
                  onChange={(event) => {
                    setSelectedProperty(event.target.value);
                    updateDraft({ templateId: "" });
                  }}
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vrsta računa
                <select
                  required
                  value={draft.templateId}
                  onChange={(event) =>
                    updateDraft({ templateId: event.target.value })
                  }
                >
                  <option value="">Odaberi vrstu računa</option>
                  {templates
                    .filter((t) => t.propertyId === selectedProperty)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.providerName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Obračunski mjesec
                <input
                  required
                  type="month"
                  value={draft.billingMonth}
                  onChange={(event) =>
                    updateDraft({ billingMonth: event.target.value })
                  }
                />
              </label>
              <label>
                Iznos (KM)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Nije prepoznat"
                  value={draft.amount ?? ""}
                  onChange={(event) =>
                    updateDraft({
                      amount:
                        event.target.value === ""
                          ? undefined
                          : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Rok plaćanja
                <input
                  type="date"
                  value={draft.dueDate ?? ""}
                  onChange={(event) =>
                    updateDraft({ dueDate: event.target.value || undefined })
                  }
                />
              </label>
              <label>
                Datum izdavanja
                <input
                  type="date"
                  value={draft.issueDate ?? ""}
                  onChange={(event) =>
                    updateDraft({ issueDate: event.target.value || undefined })
                  }
                />
              </label>
            </div>
            <details className="scan-raw">
              <summary>Prepoznati tekst</summary>
              <pre>
                {draft.text ||
                  "Tekst nije prepoznat. Podatke možete unijeti ručno."}
              </pre>
            </details>
          </details>
          {hasExisting ? (
            <label className="scan-replace">
              <input
                type="checkbox"
                checked={replaceConfirmed}
                onChange={(event) => setReplaceConfirmed(event.target.checked)}
              />
              <span>
                Za ovu vrstu računa i mjesec već postoje podaci. Potvrđujem
                zamjenu podataka i priloženog originala. Status plaćanja ostaje
                sačuvan.
              </span>
            </label>
          ) : null}
          <label className="scan-review-option">
            <input
              type="checkbox"
              checked={draft.receiptStatus === "needs_review"}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  receiptStatus: event.target.checked
                    ? "needs_review"
                    : "received",
                }))
              }
            />
            <span>Ostavi oznaku „Za provjeru”</span>
          </label>
          <div className="scan-footer-actions">
            <button
              type="button"
              className="scan-back"
              disabled={saving}
              onClick={reset}
            >
              <ArrowLeft size={17} /> Drugi dokument
            </button>
            <button
              type="submit"
              className="scan-primary"
              disabled={
                saving ||
                !draft.templateId ||
                (hasExisting && !replaceConfirmed)
              }
            >
              {saving ? (
                <LoaderCircle size={18} className="scan-spin" />
              ) : (
                <Check size={19} />
              )}
              {saving ? "Čuvanje…" : "Potvrdi i sačuvaj"}
            </button>
          </div>
          <p className="scan-small scan-centered">
            Čuva se original na ovom uređaju. Račun se ne označava kao plaćen.
          </p>
        </form>
      ) : null}
    </section>
  );
}
