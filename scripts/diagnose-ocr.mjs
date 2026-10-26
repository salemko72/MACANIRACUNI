// Synthetic invoice reproduction; never reads personal invoices.
import { chromium } from "@playwright/test";
import { createWorker, PSM } from "tesseract.js";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge" });
const worker = await createWorker(["bos", "eng"], 1, {
  langPath: "public/ocr/lang",
  corePath: "public/ocr/core",
  cacheMethod: "none",
});
try {
  const page = await browser.newPage();
  await page.setContent('<canvas width="1800" height="2400"></canvas>');
  await page.evaluate(() => {
    const c = document.querySelector("canvas"),
      x = c.getContext("2d");
    x.fillStyle = "#eeeeeb";
    x.fillRect(0, 0, c.width, c.height);
    x.translate(900, 1200);
    x.rotate((3 * Math.PI) / 180);
    x.translate(-900, -1200);
    x.fillStyle = "#fff";
    x.fillRect(160, 130, 1480, 2100);
    x.fillStyle = "#222";
    x.font = "30px Arial";
    [
      "JP Elektroprivreda BiH",
      "Mjesto potrosnje: Nisici",
      "Obracunski period",
      "09 / 2026",
      "Rok placanja",
      "20. 10. 2026.",
    ].forEach((s, i) => x.fillText(s, 220, 250 + i * 100));
    x.strokeStyle = "#444";
    for (let i = 0; i < 8; i++) {
      x.strokeRect(210, 1000 + i * 90, 1380, 90);
      x.fillText("Obracunska stavka " + (i + 1), 235, 1060 + i * 90);
      x.fillText("12,34", 1400, 1060 + i * 90);
    }
    x.fillText("UKUPNO ZA UPLATU (KM)", 220, 1950);
    x.fillText("123,45", 1300, 2070);
  });
  const image = await page.locator("canvas").screenshot();
  await mkdir("artifacts/ocr", { recursive: true });
  await writeFile("artifacts/ocr/layout-reproduction.png", image);
  for (const mode of [PSM.AUTO, PSM.SPARSE_TEXT]) {
    await worker.setParameters({
      tessedit_pageseg_mode: mode,
      user_defined_dpi: "300",
    });
    const { data } = await worker.recognize(image, { rotateAuto: true });
    console.log(
      JSON.stringify({ mode, confidence: data.confidence, text: data.text }),
    );
  }
} finally {
  await worker.terminate();
  await browser.close();
}
