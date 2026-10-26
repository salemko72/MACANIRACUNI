// Actual OCR smoke check using only the prepared local language/core files.
import { chromium } from '@playwright/test';
import { createWorker, PSM } from 'tesseract.js';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
let worker;
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.setContent('<canvas width="1500" height="1000"></canvas>');
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas'); const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black'; ctx.font = '38px Arial';
    ['JP Elektroprivreda BiH', 'Mjesto potrosnje: Nisici', 'Obracunski period: 09/2026', 'Datum izdavanja: 03.10.2026', 'Rok placanja: 20.10.2026', 'Prethodni dug: 900,00 KM', 'UKUPNO ZA UPLATU: 123,45 BAM'].forEach((line, i) => ctx.fillText(line, 60, 100 + i * 95));
  });
  const png = await page.locator('canvas').screenshot();
  await mkdir('artifacts/ocr', { recursive: true });
  await writeFile('artifacts/ocr/synthetic-bill.png', png);
  worker = await createWorker(['bos', 'eng'], 1, { langPath: 'public/ocr/lang', corePath: 'public/ocr/core', cacheMethod: 'none' });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
  const { data } = await worker.recognize(png);
  const output = await build({ entryPoints: ['src/scanning/extraction.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
  const { extractBill } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
  const result = extractBill(data.text, data.confidence);
  assert.equal(result.amount, 123.45);
  assert.equal(result.billingMonth, '2026-09');
  assert.equal(result.templateId, 'n-electric');
  assert.equal(result.dueDate, '2026-10-20');
  assert.ok(result.confidence > 75);
  await writeFile('artifacts/ocr/result.json', JSON.stringify(result, null, 2));
  console.log(`Synthetic bill OCR passed (${Math.round(result.confidence)}% confidence).`);
} finally {
  if (worker) await worker.terminate();
  await browser.close();
}

