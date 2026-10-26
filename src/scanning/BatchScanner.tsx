import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Files, LoaderCircle, Upload, X } from "lucide-react";
import { properties, templates, type Bill } from "../domain";
import { findDocumentByHash, type LocalDocument } from "./documents";
import { getPdfPageCount, recognizeDocument } from "./recognize";
import {
  billFingerprint,
  duplicateTargets,
  hasRecordedData,
  toBatchDraft,
  validateBatchFiles,
} from "./batch";
import type { ScanDraft } from "./Scanner";
import "./batch.css";

interface Entry {
  id: string;
  source: LocalDocument;
  page?: number;
  label: string;
  status: "pending" | "reading" | "ready" | "error" | "duplicate" | "saved";
  selected: boolean;
  draft?: ScanDraft;
  warnings: string[];
  error?: string;
  replacement?: string;
  needsMonthReview?: boolean;
  retryable?: boolean;
}
interface Props {
  bills: Bill[];
  month: string;
  property: string;
  localOnly: boolean;
  onSave: (draft: ScanDraft, document: LocalDocument) => Promise<void>;
  onDone: () => void;
  onBack: () => void;
}
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Čitanje nije uspjelo. Pokušaj ponovo.";
const target = (entry: Entry, bills: Bill[]) =>
  bills.find(
    (b) =>
      b.templateId === entry.draft?.templateId &&
      b.billingMonth === entry.draft?.billingMonth,
  );
function OriginalLink({ entry }: { entry: Entry }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(entry.source.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [entry.source.blob]);
  return url ? (
    <a
      href={url + (entry.page ? "#page=" + entry.page : "")}
      target="_blank"
      rel="noopener noreferrer"
    >
      Otvori original ↗
    </a>
  ) : null;
}
export function BatchScanner({
  bills,
  month,
  property,
  localOnly,
  onSave,
  onDone,
  onBack,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reading, setReading] = useState(false),
    [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0),
    [label, setLabel] = useState("");
  const [error, setError] = useState(""),
    [summary, setSummary] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null),
    mounted = useRef(true);
  const entriesRef = useRef(entries),
    billsRef = useRef(bills),
    saveRef = useRef(onSave);
  entriesRef.current = entries;
  billsRef.current = bills;
  saveRef.current = onSave;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  function publish(next: Entry[]) {
    entriesRef.current = next;
    if (mounted.current) setEntries(next);
  }
  function change(id: string, patch: Partial<Entry>) {
    publish(
      entriesRef.current.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  }
  function edit(id: string, patch: Partial<ScanDraft>) {
    publish(
      entriesRef.current.map((e) =>
        e.id === id
          ? {
              ...e,
              draft: { ...e.draft!, ...patch },
              replacement: undefined,
              error: undefined,
              needsMonthReview:
                patch.billingMonth !== undefined ? false : e.needsMonthReview,
            }
          : e,
      ),
    );
  }
  async function choose(files: File[]) {
    setError("");
    setSummary("");
    try {
      validateBatchFiles(files);
    } catch (cause) {
      setError(message(cause));
      return;
    }
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setReading(true);
    setProgress(0);
    setLabel("Priprema odabranih računa…");
    let staged: Entry[] = [];
    const seen = new Set<string>();
    try {
      for (const file of files) {
        if (abort.signal.aborted) break;
        const source: LocalDocument = {
          id: crypto.randomUUID(),
          filename: file.name,
          mimeType: file.type,
          blob: file,
          sha256: "",
          uploadedAt: new Date().toISOString(),
          text: "",
          confidence: 0,
        };
        const base: Entry = {
          id: crypto.randomUUID(),
          source,
          label: file.name,
          status: "pending",
          selected: false,
          warnings: [],
        };
        try {
          if (
            ![
              "image/jpeg",
              "image/png",
              "image/webp",
              "application/pdf",
            ].includes(file.type)
          )
            throw new Error(
              "Podržane su JPEG, PNG, WebP slike i PDF dokumenti.",
            );
          if (!file.size || file.size > 20 * 1024 * 1024)
            throw new Error("Datoteka mora biti neprazna i manja od 20 MB.");
          const digest = await crypto.subtle.digest(
            "SHA-256",
            await file.arrayBuffer(),
          );
          if (abort.signal.aborted) break;
          source.sha256 = Array.from(new Uint8Array(digest), (n) =>
            n.toString(16).padStart(2, "0"),
          ).join("");
          const repeatedSelection = seen.has(source.sha256);
          const stored = await findDocumentByHash(source.sha256);
          if (abort.signal.aborted) break;
          if (
            repeatedSelection ||
            (stored && file.type !== "application/pdf")
          ) {
            staged.push({
              ...base,
              status: "duplicate",
              error:
                "Isti original je već sačuvan ili odabran. Preskočen bez novog AI čitanja.",
            });
            continue;
          }
          // A saved PDF may still contain unsaved invoice pages. Re-read it,
          // reuse its original, and let per-invoice replacement checks protect saved pages.
          if (stored) source.id = stored.id;
          seen.add(source.sha256);
          const pages =
            file.type === "application/pdf"
              ? await getPdfPageCount(file, abort.signal)
              : 1;
          if (staged.length + pages > 20)
            throw new Error(
              "Odabrani PDF-ovi i slike imaju više od 20 stranica. Podijeli ih u manje grupe.",
            );
          for (let page = 1; page <= pages; page++)
            staged.push({
              ...base,
              id: crypto.randomUUID(),
              page: file.type === "application/pdf" ? page : undefined,
              label:
                pages > 1
                  ? `${file.name} · stranica ${page}/${pages}`
                  : file.name,
            });
        } catch (cause) {
          if (abort.signal.aborted) break;
          staged.push({ ...base, status: "error", error: message(cause) });
        }
      }
      if (abort.signal.aborted) {
        publish(staged);
        return;
      }
      publish(staged);
      await read(staged, abort);
    } finally {
      if (mounted.current) setReading(false);
    }
  }
  async function read(initial: Entry[], abort: AbortController) {
    let next = initial.map((e) =>
      e.status === "error" && e.retryable
        ? { ...e, status: "pending" as const, error: undefined }
        : e,
    );
    const jobs = next.filter((e) => e.status === "pending");
    let completed = 0;
    publish(next);
    for (const job of jobs) {
      if (abort.signal.aborted) break;
      next = next.map((e) =>
        e.id === job.id ? { ...e, status: "reading", error: undefined } : e,
      );
      publish(next);
      setLabel(`${completed + 1}/${jobs.length} · ${job.label}`);
      try {
        const suggestion = await recognizeDocument(
          job.source.blob as File,
          (value, text) => {
            if (!abort.signal.aborted && mounted.current) {
              setProgress(
                Math.round(((completed + value / 100) / jobs.length) * 100),
              );
              setLabel(
                `${completed + 1}/${jobs.length} · ${job.label} — ${text}`,
              );
            }
          },
          abort.signal,
          localOnly ? "local" : "ai",
          job.page,
        );
        if (abort.signal.aborted) break;
        const mapped = toBatchDraft(suggestion, month, property);
        const existing = billsRef.current.find(
          (b) =>
            b.templateId === mapped.draft.templateId &&
            b.billingMonth === mapped.draft.billingMonth,
        );
        job.source.text += [
          job.source.text ? "\n\n" : "",
          job.page ? `Stranica ${job.page}\n` : "",
          suggestion.text,
        ].join("");
        job.source.confidence = suggestion.confidence;
        next = next.map((e) =>
          e.id === job.id
            ? {
                ...e,
                status: "ready",
                draft: mapped.draft,
                needsMonthReview: mapped.needsMonthReview,
                warnings: suggestion.warnings,
                selected: Boolean(
                  mapped.draft.templateId &&
                  mapped.draft.amount !== undefined &&
                  !mapped.needsMonthReview &&
                  !hasRecordedData(existing),
                ),
              }
            : e,
        );
      } catch (cause) {
        if (abort.signal.aborted) break;
        const text = message(cause);
        next = next.map((e) =>
          e.id === job.id
            ? { ...e, status: "error", error: text, retryable: true }
            : e,
        );
        if (/prijavi|limit|potrošen/i.test(text)) {
          setError(text);
          publish(next);
          break;
        }
      }
      completed++;
      publish(next);
      setProgress(Math.round((completed / jobs.length) * 100));
    }
    next = next.map((e) =>
      e.status === "reading" ? { ...e, status: "pending" } : e,
    );
    publish(next);
  }
  async function retry() {
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setReading(true);
    setSummary("");
    try {
      await read(entriesRef.current, abort);
    } finally {
      if (mounted.current) setReading(false);
    }
  }
  const candidates = entries.filter((e) => e.status === "ready" && e.selected);
  const collisions = duplicateTargets(candidates);
  const missingConfirmation = candidates.some(
    (entry) =>
      entry.needsMonthReview ||
      (hasRecordedData(target(entry, bills)) &&
        entry.replacement !== billFingerprint(target(entry, bills))),
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || reading) return;
    const chosen = entriesRef.current.filter(
      (e) => e.status === "ready" && e.selected,
    );
    if (!chosen.length) return;
    if (duplicateTargets(chosen).size) {
      setError(
        "Dva računa imaju istog dobavljača i mjesec. Odaberi samo jedan za čuvanje.",
      );
      return;
    }
    setSaving(true);
    setError("");
    setSummary("");
    let saved = 0,
      failed = 0;
    try {
      for (const entry of chosen) {
        if (!mounted.current) break;
        const draft = entry.draft!;
        const existing = target(entry, billsRef.current);
        if (
          !draft.templateId ||
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.billingMonth) ||
          draft.amount === undefined ||
          !Number.isFinite(draft.amount) ||
          draft.amount < 0 ||
          entry.needsMonthReview
        ) {
          change(entry.id, {
            error:
              "Dopuni vrstu računa, obračunski mjesec i iznos prije čuvanja.",
          });
          failed++;
          continue;
        }
        if (
          hasRecordedData(existing) &&
          entry.replacement !== billFingerprint(existing)
        ) {
          change(entry.id, {
            replacement: undefined,
            error:
              "Provjeri i potvrdi zamjenu postojećih podataka. Ako je račun promijenjen na drugom uređaju, potvrdi noviju verziju.",
          });
          failed++;
          continue;
        }
        try {
          await saveRef.current(draft, entry.source);
          change(entry.id, {
            status: "saved",
            selected: false,
            error: undefined,
          });
          saved++;
        } catch (cause) {
          change(entry.id, { error: message(cause) });
          failed++;
        }
      }
    } finally {
      if (mounted.current) {
        setSaving(false);
        setSummary(
          `Sačuvano: ${saved}.${failed ? ` Nije sačuvano: ${failed}. Uspješni računi ostaju sačuvani; neuspjele možeš pokušati ponovo.` : ""}`,
        );
      }
    }
  }
  const retryable = entries.some(
    (e) => e.status === "pending" || (e.status === "error" && e.retryable),
  );
  return (
    <section
      className="scanner batch-scanner"
      aria-label="Grupno skeniranje računa"
    >
      <header className="scan-header">
        <div>
          <span className="scan-eyebrow">SVI RAČUNI, JEDAN PREGLED</span>
          <h2>Skeniraj sve račune.</h2>
        </div>
        <button
          className="scan-close"
          aria-label="Zatvori grupno skeniranje"
          disabled={saving}
          onClick={onDone}
        >
          <X size={21} />
        </button>
      </header>
      {!entries.length && !reading ? (
        <>
          <div className="scan-intro-icon">
            <Files size={42} />
          </div>
          <p className="scan-muted scan-centered">
            Odaberi sve fotografije i PDF-ove odjednom. Svaka PDF stranica čita
            se zasebno; na kraju provjeri i sačuvaj odabrane račune.
          </p>
          <button
            className="scan-primary batch-select"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={20} />
            Odaberi sve račune
          </button>
          <p className="scan-small scan-centered">
            Do 20 slika/PDF stranica · 20 MB po datoteci · 100 MB ukupno.
            <br />
            {localOnly
              ? "Koristi se čitanje na uređaju."
              : "Mistral obrađuje račune redom; svaka stranica troši jedno AI čitanje."}
          </p>
        </>
      ) : null}
      <input
        ref={fileInput}
        hidden
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        aria-label="Odaberi više računa"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void choose(files);
        }}
      />
      {error ? (
        <div className="scan-notice scan-error" role="alert">
          <span>
            {error}
            {/prijavi/i.test(error) ? (
              <>
                <br />
                <a href="/api/login?next=scan">Prijavi se za AI čitanje →</a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {reading ? (
        <div className="batch-progress" aria-live="polite">
          <p>
            <LoaderCircle size={17} className="scan-spin" />
            {label}
          </p>
          <progress
            max={100}
            value={progress}
            aria-label="Napredak grupnog skeniranja"
          />
          <button
            className="scan-secondary"
            onClick={() => controller.current?.abort()}
          >
            Zaustavi čitanje
          </button>
        </div>
      ) : null}
      {entries.length ? (
        <form onSubmit={save}>
          <p className="batch-count" aria-live="polite">
            {entries.filter((e) => e.status === "ready").length} pročitano ·{" "}
            {entries.filter((e) => e.status === "saved").length} sačuvano ·{" "}
            {
              entries.filter(
                (e) => e.status === "error" || e.status === "duplicate",
              ).length
            }{" "}
            preskočeno / greška
          </p>
          <fieldset disabled={reading || saving} className="batch-list">
            {entries.map((entry, index) => {
              const existing = target(entry, bills),
                needsReplace = hasRecordedData(existing);
              return (
                <article
                  className={"batch-item batch-item-" + entry.status}
                  key={entry.id}
                >
                  <div className="batch-item-top">
                    <strong>
                      {index + 1}. {entry.label}
                    </strong>
                    <span>
                      {entry.status === "saved"
                        ? "Sačuvano ✓"
                        : entry.status === "pending"
                          ? "Čeka čitanje"
                          : entry.status === "reading"
                            ? "Čitanje…"
                            : entry.status === "duplicate"
                              ? "Duplikat"
                              : entry.status === "error"
                                ? "Nije pročitano"
                                : "Za pregled"}
                    </span>
                  </div>
                  {entry.error ? (
                    <p className="batch-error" role="alert">
                      {entry.error}
                    </p>
                  ) : null}
                  {entry.draft ? (
                    <>
                      <div className="batch-fields">
                        <label>
                          Vrsta računa
                          <select
                            value={entry.draft.templateId}
                            required={entry.selected}
                            disabled={entry.status === "saved"}
                            onChange={(event) =>
                              edit(entry.id, { templateId: event.target.value })
                            }
                          >
                            <option value="">
                              Odaberi dobavljača i objekat
                            </option>
                            {properties.map((p) => (
                              <optgroup key={p.id} label={p.name}>
                                {templates
                                  .filter((t) => t.propertyId === p.id)
                                  .map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {p.name} · {t.providerName}
                                    </option>
                                  ))}
                              </optgroup>
                            ))}
                          </select>
                        </label>
                        <label>
                          Obračunski mjesec
                          <input
                            type="month"
                            required={entry.selected}
                            value={entry.draft.billingMonth}
                            disabled={entry.status === "saved"}
                            onChange={(event) =>
                              edit(entry.id, {
                                billingMonth: event.target.value,
                              })
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
                            required={entry.selected}
                            value={entry.draft.amount ?? ""}
                            disabled={entry.status === "saved"}
                            onChange={(event) =>
                              edit(entry.id, {
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
                            value={entry.draft.dueDate ?? ""}
                            disabled={entry.status === "saved"}
                            onChange={(event) =>
                              edit(entry.id, {
                                dueDate: event.target.value || undefined,
                              })
                            }
                          />
                        </label>
                      </div>
                      {entry.needsMonthReview && entry.status !== "saved" ? (
                        <label className="scan-review-option">
                          <input
                            type="checkbox"
                            onChange={(event) =>
                              change(entry.id, {
                                needsMonthReview: !event.target.checked,
                              })
                            }
                          />
                          <span>
                            Mjesec nije prepoznat. Potvrđujem odabrani
                            obračunski mjesec.
                          </span>
                        </label>
                      ) : null}
                      {entry.warnings.length && entry.status !== "saved" ? (
                        <details className="batch-warnings">
                          <summary>
                            {entry.warnings.length} napomena za provjeru
                          </summary>
                          <ul>
                            {entry.warnings.map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      {needsReplace && entry.status !== "saved" ? (
                        <label className="scan-replace">
                          <input
                            type="checkbox"
                            checked={
                              entry.replacement === billFingerprint(existing)
                            }
                            onChange={(event) =>
                              change(entry.id, {
                                replacement: event.target.checked
                                  ? billFingerprint(existing)
                                  : undefined,
                                selected: event.target.checked,
                              })
                            }
                          />
                          <span>
                            Potvrđujem zamjenu postojećih podataka. Stvarni
                            status plaćanja ostaje sačuvan.
                          </span>
                        </label>
                      ) : null}
                      {collisions.has(entry.id) ? (
                        <p className="batch-error">
                          Još jedna odabrana stavka ima istog dobavljača i
                          mjesec. Odaberi samo jednu.
                        </p>
                      ) : null}
                      {entry.status !== "saved" ? (
                        <label className="batch-save-choice">
                          <input
                            type="checkbox"
                            checked={entry.selected}
                            onChange={(event) =>
                              change(entry.id, {
                                selected: event.target.checked,
                              })
                            }
                          />
                          <span>Sačuvaj ovaj račun</span>
                        </label>
                      ) : null}
                      <OriginalLink entry={entry} />
                    </>
                  ) : null}
                </article>
              );
            })}
          </fieldset>
          {!reading ? (
            <div className="batch-actions">
              <button
                type="submit"
                className="scan-primary"
                disabled={
                  saving ||
                  !candidates.length ||
                  collisions.size > 0 ||
                  missingConfirmation
                }
              >
                {saving ? (
                  <LoaderCircle size={18} className="scan-spin" />
                ) : (
                  <Check size={18} />
                )}{" "}
                {saving
                  ? "Čuvanje…"
                  : `Sačuvaj odabrane (${candidates.length})`}
              </button>
              {retryable ? (
                <button
                  type="button"
                  className="scan-secondary"
                  disabled={saving}
                  onClick={() => void retry()}
                >
                  Pokušaj preostale ponovo
                </button>
              ) : null}
              <button
                type="button"
                className="scan-secondary"
                disabled={saving}
                onClick={onDone}
              >
                Završi
              </button>
              <button
                type="button"
                className="scan-back"
                disabled={saving}
                onClick={() => {
                  publish([]);
                  setError("");
                  setSummary("");
                }}
              >
                Odaberi drugu grupu
              </button>
            </div>
          ) : null}
          {summary ? (
            <p className="batch-summary" role="status">
              {summary}
            </p>
          ) : null}
          <p className="scan-small">
            Originali se čuvaju na ovom uređaju tek nakon potvrde. Skeniranje ne
            označava račune kao plaćene.
          </p>
        </form>
      ) : null}
      {!reading && !saving && !entries.length ? (
        <button className="scan-back" onClick={onBack}>
          <ArrowLeft size={17} />
          Jedan račun
        </button>
      ) : null}
    </section>
  );
}
