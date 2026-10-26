import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  saveDocument,
  getDocument,
  deleteDocument,
  findDocumentByHash,
  type LocalDocument,
} from "./documents";
const document: LocalDocument = {
  id: "test-original",
  filename: "example.txt",
  mimeType: "text/plain",
  blob: new Blob(["synthetic example"]),
  sha256: "synthetic-hash",
  uploadedAt: "2026-10-26T00:00:00Z",
  text: "synthetic example",
  confidence: 85,
};
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});
describe("local original storage", () => {
  it("persists the original blob and metadata and finds it by content hash", async () => {
    await saveDocument(document);
    const saved = await getDocument(document.id);
    expect(saved?.filename).toBe("example.txt");
    expect(await saved?.blob.text()).toBe("synthetic example");
    expect((await findDocumentByHash("synthetic-hash"))?.id).toBe(
      "test-original",
    );
    expect(await findDocumentByHash("different-content")).toBeUndefined();
  });
  it("deletes originals without leaving a duplicate hash result", async () => {
    await saveDocument(document);
    await deleteDocument(document.id);
    expect(await getDocument(document.id)).toBeUndefined();
    expect(await findDocumentByHash(document.sha256)).toBeUndefined();
  });
  it("keeps reads safe and reports failed writes when browser storage is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await getDocument(document.id)).toBeUndefined();
    expect(await findDocumentByHash(document.sha256)).toBeUndefined();
    await expect(saveDocument(document)).rejects.toThrow();
  });
});

it("does not expose a broken original as an available document", async () => {
  await saveDocument(document);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("macaniracuni-documents", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("documents", "readwrite");
    transaction.objectStore("documents").put({ ...document, blob: "broken" });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  expect(await getDocument(document.id)).toBeUndefined();
  expect(await findDocumentByHash(document.sha256)).toBeUndefined();
});
