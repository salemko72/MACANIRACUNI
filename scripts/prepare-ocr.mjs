// Same-origin runtime files, deliberately loaded on demand rather than PWA precached.
// npm versions must match package-lock.json; language data is pinned to an official commit.
import { mkdir, copyFile, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/ocr');
const pinned = { 'tesseract.js': '7.0.0', 'tesseract.js-core': '7.0.0', 'pdfjs-dist': '6.4.299' };
const tessdataCommit = '87416418657359cb625c412a48b6e1d6d41c29bd';
for (const [name, version] of Object.entries(pinned)) {
  const info = JSON.parse(await readFile(resolve(root, 'node_modules', name, 'package.json'), 'utf8'));
  if (info.version !== version) throw new Error(`Expected ${name}@${version}; found ${info.version}. Review OCR assets before updating versions.`);
}
await mkdir(resolve(target, 'core'), { recursive: true });
await mkdir(resolve(target, 'lang'), { recursive: true });
await copyFile(resolve(root, 'node_modules/tesseract.js/dist/worker.min.js'), resolve(target, 'worker.min.js'));
await copyFile(resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), resolve(target, 'pdf.worker.min.mjs'));
for (const name of await readdir(resolve(root, 'node_modules/tesseract.js-core'))) {
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(name)) await copyFile(resolve(root, 'node_modules/tesseract.js-core', name), resolve(target, 'core', name));
}
const languages = {};
for (const language of ['bos', 'eng']) {
  const destination = resolve(target, 'lang', `${language}.traineddata.gz`);
  const source = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${tessdataCommit}/${language}.traineddata`;
  let exists = false;
  try { await access(destination); exists = true; } catch {}
  if (!exists) {
    const response = await fetch(source, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`${language}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100000) throw new Error(`Unexpected language file: ${language}`);
    await writeFile(destination, gzipSync(bytes));
  }
  const bytes = await readFile(destination);
  languages[language] = { source, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
await copyFile(resolve(root, 'node_modules/tesseract.js/LICENSE.md'), resolve(target, 'LICENSE-tesseract.txt')).catch(async () => {
  await copyFile(resolve(root, 'node_modules/tesseract.js/LICENSE'), resolve(target, 'LICENSE-tesseract.txt'));
});
await copyFile(resolve(root, 'node_modules/tesseract.js-core/LICENSE'), resolve(target, 'LICENSE-core.txt'));
await copyFile(resolve(root, 'node_modules/pdfjs-dist/LICENSE'), resolve(target, 'LICENSE-pdfjs.txt'));
const tessLicense = await fetch(`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${tessdataCommit}/LICENSE`, { signal: AbortSignal.timeout(30000) });
if (!tessLicense.ok) throw new Error('Could not fetch tessdata license');
await writeFile(resolve(target, 'LICENSE-tessdata.txt'), await tessLicense.text());
await writeFile(resolve(target, 'manifest.json'), JSON.stringify({ packages: pinned, tessdataCommit, languages }, null, 2) + '\n');
console.log(`OCR runtime prepared in ${target}. Do not include ocr/** in the PWA precache.`);
