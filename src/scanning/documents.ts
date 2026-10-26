export interface LocalDocument {
  id: string;
  filename: string;
  mimeType: string;
  blob: Blob;
  sha256: string;
  uploadedAt: string;
  text: string;
  confidence: number;
}
const storageError = () =>
  new Error(
    "Original nije moguće sačuvati na ovom uređaju. Provjerite slobodan prostor i dozvole preglednika.",
  );
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(storageError());
      return;
    }
    const request = indexedDB.open("macaniracuni-documents", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("documents", {
        keyPath: "id",
      });
      store.createIndex("sha256", "sha256");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError());
    request.onblocked = () => reject(storageError());
  });
}
async function operation<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("documents", mode);
      const request = action(transaction.objectStore("documents"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(storageError());
      transaction.onabort = () => reject(storageError());
    });
  } finally {
    db.close();
  }
}
function validOriginal(value: unknown): value is LocalDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<LocalDocument>;
  return (
    typeof doc.id === "string" &&
    typeof doc.filename === "string" &&
    doc.blob instanceof Blob &&
    doc.blob.size > 0
  );
}
export async function saveDocument(document: LocalDocument): Promise<void> {
  if (!validOriginal(document))
    throw new Error("Original dokumenta nedostaje ili je oštećen.");
  await operation("readwrite", (store) => store.put(document));
}
export async function getDocument(
  id: string,
): Promise<LocalDocument | undefined> {
  try {
    const value: unknown = await operation("readonly", (store) =>
      store.get(id),
    );
    return validOriginal(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
export async function findDocumentByHash(
  hash: string,
): Promise<LocalDocument | undefined> {
  try {
    const value: unknown = await operation("readonly", (store) =>
      store.index("sha256").get(hash),
    );
    return validOriginal(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
export async function deleteDocument(id: string): Promise<void> {
  await operation("readwrite", (store) => store.delete(id));
}
