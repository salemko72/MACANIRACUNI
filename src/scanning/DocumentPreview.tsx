import { useEffect, useState } from "react";
import { Download, ExternalLink, FileSearch } from "lucide-react";
import { getDocument, type LocalDocument } from "./documents";
import "./scanner.css";
export function DocumentPreview({ documentId }: { documentId: string }) {
  const [document, setDocument] = useState<LocalDocument>();
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setDocument(undefined);
    setLoaded(false);
    setUrl("");
    setBroken(false);
    void getDocument(documentId).then((value) => {
      if (!active) return;
      setDocument(value);
      setLoaded(true);
      if (value) {
        try {
          objectUrl = URL.createObjectURL(value.blob);
          setUrl(objectUrl);
        } catch {
          setBroken(true);
        }
      }
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);
  return (
    <section className="scan-original" aria-label="Original računa">
      <div className="scan-original-heading">
        <FileSearch size={19} />
        <strong>Original računa</strong>
      </div>
      <p className="scan-muted">
        Original je sačuvan samo na ovom uređaju i u ovom pregledniku. Ne
        prenosi se porodičnom sinhronizacijom.
      </p>
      {!loaded ? (
        <p role="status">Učitavanje originala…</p>
      ) : !document || broken ? (
        <p role="status">
          Original nije dostupan ili je oštećen. Otvorite račun na uređaju na
          kojem je skeniran ili ponovo priložite dokument.
        </p>
      ) : (
        <>
          <p className="scan-filename">{document.filename}</p>
          {url && document.mimeType.startsWith("image/") ? (
            <img
              className="scan-original-image"
              src={url}
              alt="Skenirani original računa"
              onError={() => setBroken(true)}
            />
          ) : null}
          {url ? (
            <div className="scan-original-actions">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> Otvori original
              </a>
              <a href={url} download={document.filename}>
                <Download size={16} /> Preuzmi
              </a>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
