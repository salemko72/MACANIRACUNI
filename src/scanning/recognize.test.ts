import { describe, expect, it } from "vitest";
import { recognizeDocument } from "./recognize";
const noop = () => {};
const file = (type: string, size = 10) =>
  ({ type, size, name: "test" }) as File;
describe("document input validation", () => {
  it("rejects unsupported files with a Bosnian message before loading engines", async () => {
    await expect(recognizeDocument(file("text/html"), noop)).rejects.toThrow(
      /JPEG.*PNG.*WebP.*PDF/,
    );
  });
  it("rejects photos larger than 20MB", async () => {
    await expect(
      recognizeDocument(file("image/jpeg", 20 * 1024 * 1024 + 1), noop),
    ).rejects.toThrow(/20 MB/);
  });
  it("rejects an empty document", async () => {
    await expect(
      recognizeDocument(file("application/pdf", 0), noop),
    ).rejects.toThrow(/praz/);
  });
  it("stops an already aborted scan", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      recognizeDocument(file("image/png"), noop, abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
