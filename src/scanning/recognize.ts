import { extractBill, type ScanSuggestion } from "./extraction";
import type { Worker as OcrWorker } from "tesseract.js";
import { chooseRecognition, shouldRetryRecognition } from "./quality";

type Progress = (value: number, label: string) => void;
const aborted = () =>
  new DOMException("Skeniranje je prekinuto.", "AbortError");
const checkAbort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw aborted();
};
const asset = (path: string) =>
  new URL(`${import.meta.env.BASE_URL}ocr/${path}`, window.location.origin)
    .href;

async function photoCanvas(file: File): Promise<HTMLCanvasElement> {
  // from-image applies EXIF orientation before dimensions and scaling are calculated.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const scale = Math.min(
      1,
      3200 / Math.max(bitmap.width, bitmap.height),
      Math.sqrt(8_000_000 / (bitmap.width * bitmap.height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Ne može se pripremiti fotografija.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/** Runs entirely on this device. OCR assets are downloaded from this application's origin on demand. */
export async function recognizeDocument(
  file: File,
  onProgress: Progress,
  signal?: AbortSignal,
): Promise<ScanSuggestion> {
  checkAbort(signal);
  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    )
  )
    throw new Error("Odaberite JPEG, PNG, WebP fotografiju ili PDF račun.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error(
      "Datoteka je prevelika. Najveća dozvoljena veličina je 20 MB.",
    );
  if (!file.size) throw new Error("Datoteka je prazna. Odaberite drugi račun.");
  let worker: OcrWorker | undefined;
  let destroyPdf: (() => Promise<void>) | undefined;
  let cancelRender: (() => void) | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let stopped = false;
  let retrying = false;
  let rejectAbort: (reason: unknown) => void = () => {};
  const abortPromise = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const stop = () => {
    stopped = true;
    if (worker) void worker.terminate().catch(() => {});
    cancelRender?.();
    if (destroyPdf) void destroyPdf().catch(() => {});
    rejectAbort(aborted());
  };
  signal?.addEventListener("abort", stop, { once: true });
  const progress: Progress = (value, label) => {
    if (!stopped) onProgress(Math.max(0, Math.min(100, value)), label);
  };
  async function ocr(image: HTMLCanvasElement): Promise<ScanSuggestion> {
    progress(
      15,
      "Priprema lokalnog OCR-a. Prvo pokretanje preuzima jezičke datoteke.",
    );
    const { createWorker, PSM } = await import("tesseract.js");
    checkAbort(signal);
    const pending = createWorker(["bos", "eng"], 1, {
      workerPath: asset("worker.min.js"),
      corePath: asset("core"),
      langPath: asset("lang"),
      workerBlobURL: false,
      gzip: true,
      logger: (message) =>
        progress(
          message.status === "recognizing text"
            ? retrying
              ? 70 + message.progress * 25
              : 35 + message.progress * 33
            : 15 + message.progress * 18,
          message.status === "recognizing text"
            ? retrying
              ? "Dodatno čitanje rasporeda računa…"
              : "Prepoznavanje teksta na uređaju…"
            : "Učitavanje lokalnog OCR-a…",
        ),
      errorHandler: () => {},
    });
    // Tesseract exposes terminate only after initialization. If cancelled during startup,
    // terminate the worker immediately when the library makes it available.
    pending
      .then((created) => {
        if (stopped) void created.terminate().catch(() => {});
      })
      .catch(() => {});
    worker = await pending;
    checkAbort(signal);
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      user_defined_dpi: "300",
    });
    const { data } = await worker.recognize(image, { rotateAuto: true });
    checkAbort(signal);
    const first = extractBill(data.text, data.confidence);
    if (!shouldRetryRecognition(first)) return first;
    retrying = true;
    progress(70, "Tražimo preostale podatke u kolonama računa…");
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const retry = await worker.recognize(image, { rotateAuto: true });
    checkAbort(signal);
    return chooseRecognition(
      first,
      extractBill(retry.data.text, retry.data.confidence),
    );
  }
  const work = async (): Promise<ScanSuggestion> => {
    progress(2, "Priprema računa…");
    let result: ScanSuggestion;
    if (file.type === "application/pdf") {
      const pdfjs = await import("pdfjs-dist");
      checkAbort(signal);
      pdfjs.GlobalWorkerOptions.workerSrc = asset("pdf.worker.min.mjs");
      const loading = pdfjs.getDocument({
        data: await file.arrayBuffer(),
        useSystemFonts: true,
      });
      destroyPdf = () => loading.destroy();
      checkAbort(signal);
      const pdf = await loading.promise;
      const page = await pdf.getPage(1);
      checkAbort(signal);
      progress(10, "Čitanje teksta prve PDF stranice…");
      const content = await page.getTextContent();
      let text = "";
      let lastY: number | undefined;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = item.transform[5] as number;
        if (
          lastY !== undefined &&
          Math.abs(y - lastY) > 3 &&
          !text.endsWith("\n")
        )
          text += "\n";
        text += item.str + (item.hasEOL ? "\n" : " ");
        lastY = y;
      }
      if (text.replace(/\s/g, "").length >= 30) {
        result = extractBill(text, 100);
        result.warnings.push(
          "Tekst je pročitan iz PDF-a. I dalje provjerite sva predložena polja.",
        );
      } else {
        progress(12, "PDF nema dovoljno teksta. Priprema slike za OCR…");
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(3, 2400 / Math.max(original.width, original.height)),
        });
        canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const render = page.render({
          canvas,
          viewport,
          background: "rgb(255,255,255)",
        });
        cancelRender = () => render.cancel();
        await render.promise;
        cancelRender = undefined;
        checkAbort(signal);
        result = await ocr(canvas);
      }
      if (pdf.numPages > 1)
        result.warnings.unshift(
          `PDF ima ${pdf.numPages} stranica. Obrađena je samo prva stranica; ostale stranice provjerite ručno.`,
        );
    } else {
      canvas = await photoCanvas(file);
      checkAbort(signal);
      result = await ocr(canvas);
    }
    checkAbort(signal);
    if (!result.text.trim())
      result.warnings.unshift(
        "Tekst nije pronađen. Pokušajte jasniju fotografiju uz ravnomjerno svjetlo.",
      );
    progress(100, "Skeniranje završeno. Provjerite prijedloge.");
    return result;
  };
  try {
    return await Promise.race([work(), abortPromise]);
  } catch (error) {
    if (
      signal?.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw aborted();
    throw new Error(
      "Račun nije moguće pročitati. Provjerite da PDF nije zaštićen i da je fotografija jasna. Za prvo skeniranje potrebna je veza za preuzimanje OCR datoteka.",
    );
  } finally {
    stopped = true;
    signal?.removeEventListener("abort", stop);
    if (worker) await worker.terminate().catch(() => {});
    cancelRender?.();
    if (destroyPdf) await destroyPdf().catch(() => {});
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}
