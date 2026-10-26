import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getPdfPageCount, recognizeDocument } from "./recognize";
import { extractBill } from "./extraction";
import { readWithAi } from "./ai";

const pdfRuntime = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));
vi.mock("pdfjs-dist", () => pdfRuntime);
vi.mock("./ai", () => ({ readWithAi: vi.fn() }));
const noop = () => {};
const text = (amount: string) =>
  `JP Elektroprivreda BiH\nObracunski period: 09/2026\nUKUPNO ZA UPLATU: ${amount} BAM`;
const pdfFile = (arrayBuffer = async () => new ArrayBuffer(1)) =>
  ({ type: "application/pdf", size: 1, name: "bill.pdf", arrayBuffer }) as File;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture() {
  const destroy = vi.fn(async () => {});
  const getPage = vi.fn(async (number: number) => ({
    getTextContent: async () => ({
      items: [
        {
          str: text(number === 2 ? "456,78" : "123,45"),
          transform: [1, 0, 0, 1, 0, 20],
          hasEOL: true,
        },
      ],
    }),
  }));
  pdfRuntime.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 3, getPage }),
    destroy,
  });
  return { destroy, getPage };
}
beforeEach(() => {
  vi.stubGlobal("window", { location: { origin: "https://bills.example" } });
  vi.stubGlobal("navigator", { onLine: false });
  pdfRuntime.getDocument.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("PDF page selection", () => {
  it("renders the selected page for AI recognition even when the PDF contains text", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const canvas = { width: 0, height: 0 };
    vi.stubGlobal("document", { createElement: () => canvas });
    const destroy = vi.fn(async () => {});
    pdfRuntime.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async (number: number) => ({
          getTextContent: async () => ({
            items: [{ str: text("123,45"), transform: [1, 0, 0, 1, 0, 20] }],
          }),
          getViewport: () => ({ width: number * 100, height: 200 }),
          render: () => ({ promise: Promise.resolve(), cancel: noop }),
        }),
      }),
      destroy,
    });
    vi.mocked(readWithAi).mockImplementation(async (image) =>
      extractBill(text(image.width === 200 ? "456,78" : "123,45"), 100),
    );
    const result = await recognizeDocument(pdfFile(), noop, undefined, "ai", 2);
    expect(result.amount).toBe(456.78);
    expect(result.warnings.join(" ")).not.toMatch(/samo prva/);
    expect(canvas).toEqual({ width: 1, height: 1 });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it("does not start rendering after cancellation while reading PDF text", async () => {
    const controller = new AbortController();
    const content = deferred<{ items: [] }>();
    const started = deferred<void>();
    const render = vi.fn();
    const destroy = vi.fn(async () => {});
    const createElement = vi.fn(() => ({ width: 0, height: 0 }));
    vi.stubGlobal("document", { createElement });
    pdfRuntime.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: async () => ({
          getTextContent: () => {
            started.resolve();
            return content.promise;
          },
          getViewport: () => ({ width: 100, height: 200 }),
          render,
        }),
      }),
      destroy,
    });
    const result = recognizeDocument(
      pdfFile(),
      noop,
      controller.signal,
      "local",
      2,
    );
    const rejection = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await started.promise;
    controller.abort();
    await rejection;
    content.resolve({ items: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(render).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it("extracts the requested page without claiming the remaining pages were ignored", async () => {
    const { destroy } = fixture();
    const result = await recognizeDocument(
      pdfFile(),
      noop,
      undefined,
      "local",
      2,
    );
    expect(result.amount).toBe(456.78);
    expect(result.warnings.join(" ")).not.toMatch(/samo prva/);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it("preserves first-page behavior and the multi-page warning for old callers", async () => {
    fixture();
    const result = await recognizeDocument(pdfFile(), noop, undefined, "local");
    expect(result.amount).toBe(123.45);
    expect(result.warnings.join(" ")).toMatch(/samo prva/);
  });
  it.each([0, -1, 1.5, 4, NaN])(
    "rejects an invalid page %s and cleans up",
    async (pageNumber) => {
      const { destroy, getPage } = fixture();
      await expect(
        recognizeDocument(pdfFile(), noop, undefined, "local", pageNumber),
      ).rejects.toThrow();
      expect(getPage).not.toHaveBeenCalled();
      expect(destroy).toHaveBeenCalledTimes(1);
    },
  );
});

describe("PDF page counting", () => {
  it("returns the page count using the same-origin worker and releases the document", async () => {
    const { destroy, getPage } = fixture();
    expect(await getPdfPageCount(pdfFile())).toBe(3);
    expect(pdfRuntime.GlobalWorkerOptions.workerSrc).toMatch(
      /^https:\/\/bills\.example\/.*ocr\/pdf\.worker\.min\.mjs$/,
    );
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it("releases a failed PDF loading task", async () => {
    const destroy = vi.fn(async () => {});
    pdfRuntime.getDocument.mockReturnValue({
      promise: Promise.reject(new Error("invalid PDF")),
      destroy,
    });
    await expect(getPdfPageCount(pdfFile())).rejects.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it("aborts a pending PDF load immediately and destroys the loading task once", async () => {
    const controller = new AbortController();
    const loading = deferred<never>();
    const started = deferred<void>();
    const destroy = vi.fn(async () => {});
    pdfRuntime.getDocument.mockImplementation(() => {
      started.resolve();
      return { promise: loading.promise, destroy };
    });
    const result = getPdfPageCount(pdfFile(), controller.signal);
    const rejection = expect(result).rejects.toMatchObject({
      name: "AbortError",
    });
    await started.promise;
    controller.abort();
    await rejection;
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it.each(["count", "recognize"])(
    "does not create a late loading task when %s is cancelled during file reading",
    async (operation) => {
      fixture();
      const bytes = deferred<ArrayBuffer>();
      const started = deferred<void>();
      const controller = new AbortController();
      const file = pdfFile(() => {
        started.resolve();
        return bytes.promise;
      });
      const result =
        operation === "count"
          ? getPdfPageCount(file, controller.signal)
          : recognizeDocument(file, noop, controller.signal, "local", 2);
      const rejection = expect(result).rejects.toMatchObject({
        name: "AbortError",
      });
      await started.promise;
      controller.abort();
      await rejection;
      bytes.resolve(new ArrayBuffer(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(pdfRuntime.getDocument).not.toHaveBeenCalled();
    },
  );
});
