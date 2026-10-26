import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "msedge" });
test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL),
  "Dev harness boundary tests run locally.",
);

async function openScanner(
  page: Page,
  options: {
    failure?: boolean;
    slow?: boolean;
    existing?: boolean;
    lowConfidence?: boolean;
    demo?: boolean;
    supplierOnly?: boolean;
  } = {},
) {
  await page.route("**/src/scanning/recognize.ts*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `export async function recognizeDocument(file, progress, signal) { progress(45,'Čitanje…'); ${options.slow ? "await new Promise(resolve => { window.finishRecognition = resolve; });" : ""} return { text:'Synthetic example', confidence:${options.lowConfidence ? 35 : 95}, ${options.supplierOnly ? "supplierCategory:'maintenance'" : "templateId:'s-maintenance'"}, amount:123.45, billingMonth:'2026-10', dueDate:'2026-11-10', warnings:[] }; }`,
    }),
  );
  await page.route("**/__scanner-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#f4e9ef"><div id="test-root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js'; const {createRoot}=ReactDOM;
import { Scanner } from '/src/scanning/Scanner.tsx';
import { saveDocument } from '/src/scanning/documents.ts';
import '/src/style.css';
window.saved = [];
window.previewOriginal = async (id, pdf) => { if(pdf) await saveDocument({id,filename:'synthetic.pdf',mimeType:'application/pdf',blob:new Blob(['%PDF-1.4 synthetic example'],{type:'application/pdf'}),sha256:'synthetic-pdf-hash',uploadedAt:new Date().toISOString(),text:'Synthetic example',confidence:95}); const {DocumentPreview}=await import('/src/scanning/DocumentPreview.tsx'); document.getElementById('test-root').style.display='none'; const mount=document.createElement('div'); document.body.appendChild(mount); createRoot(mount).render(React.createElement(DocumentPreview,{documentId:id})); };
window.seedDuplicate = async () => { const blob = new Blob(['synthetic-file'], {type:'image/png'}); const digest = await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()); const sha256 = Array.from(new Uint8Array(digest), n=>n.toString(16).padStart(2,'0')).join(''); await saveDocument({id:'duplicate',filename:'existing.png',mimeType:'image/png',blob,sha256,uploadedAt:new Date().toISOString(),text:'Synthetic example',confidence:95}); };
createRoot(document.getElementById('test-root')).render(React.createElement(Scanner,{bills:${options.demo ? "[{id:'demo',templateId:'s-maintenance',billingMonth:'2026-10',receiptStatus:'received',paymentStatus:'unpaid',currency:'BAM',amount:50,isDemo:true}]" : options.existing ? "[{id:'existing',templateId:'s-maintenance',billingMonth:'2026-10',receiptStatus:'received',paymentStatus:'paid',currency:'BAM',amount:50,documentId:'old',isDemo:false}]" : "[]"},month:'2026-10',property:'sarajevo',onSave:async(draft,document)=>{${options.failure ? "throw new Error('Synthetic storage failure')" : "window.saved.push(draft)"}},onDone:()=>{window.done=true;}}));
</script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5175/__scanner-test");
  await expect(
    page.getByRole("button", { name: "Fotografiši račun", exact: true }),
  ).toBeVisible();
}
async function selectImage(page: Page) {
  await page
    .getByLabel("Priloži sliku ili PDF", { exact: true })
    .setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from("synthetic-file"),
    });
}
test("uses the selected property to suggest a recognized supplier without a customer address", async ({
  page,
}) => {
  await openScanner(page, { supplierOnly: true });
  await selectImage(page);
  await expect(
    page.getByRole("heading", { name: "Sarajevostan (održavanje zgrade)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toBeEnabled();
});
test("weak recognition is marked for review by default", async ({ page }) => {
  await openScanner(page, { lowConfidence: true });
  await selectImage(page);
  await expect(
    page.getByRole("checkbox", { name: "Ostavi oznaku „Za provjeru”" }),
  ).toBeChecked();
});
test("rejects unsupported files before recognition", async ({ page }) => {
  await openScanner(page);
  await page
    .getByLabel("Priloži sliku ili PDF", { exact: true })
    .setInputFiles({
      name: "example.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("synthetic"),
    });
  await expect(page.getByRole("alert")).toContainText("Odaberite JPEG");
  await expect(
    page.getByRole("button", { name: "Fotografiši račun", exact: true }),
  ).toBeVisible();
});
test("cancel prevents a late recognition result from reopening review", async ({
  page,
}) => {
  await openScanner(page, { slow: true });
  await selectImage(page);
  await expect(page.getByText("Čitanje…", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Otkaži", exact: true }).click();
  await page.evaluate(() =>
    (
      window as unknown as { finishRecognition: () => void }
    ).finishRecognition(),
  );
  await expect(
    page.getByRole("button", { name: "Fotografiši račun", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toHaveCount(0);
});
test("blocks original duplicates before review", async ({ page }) => {
  await openScanner(page);
  await page.evaluate(() =>
    (
      window as unknown as { seedDuplicate: () => Promise<void> }
    ).seedDuplicate(),
  );
  await selectImage(page);
  await expect(page.getByRole("alert")).toContainText("već sačuvan");
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toHaveCount(0);
});
test("failed save retains the editable review and permits retry", async ({
  page,
}) => {
  await openScanner(page, { failure: true });
  await selectImage(page);
  await page.getByRole("button", { name: "Potvrdi i sačuvaj" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Synthetic storage failure",
  );
  await page.getByText("Provjeri ili izmijeni podatke").click();
  await expect(page.getByLabel("Iznos (KM)", { exact: true })).toHaveValue(
    "123.45",
  );
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toBeEnabled();
});
test("requires replacement confirmation and wraps the longest supplier on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openScanner(page, { existing: true });
  await selectImage(page);
  await expect(
    page.getByRole("heading", { name: "Sarajevostan (održavanje zgrade)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /Potvrđujem zamjenu/ }).check();
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "C:/MacaniRacuni/test-results/scanner-mobile.png",
    fullPage: true,
  });
});

test("missing originals explain device locality without broken links", async ({
  page,
}) => {
  await openScanner(page);
  await page.evaluate(() =>
    (
      window as unknown as {
        previewOriginal: (id: string, pdf: boolean) => Promise<void>;
      }
    ).previewOriginal("missing", false),
  );
  await expect(page.getByRole("status")).toContainText(
    "Original nije dostupan",
  );
  await expect(
    page.getByRole("link", { name: "Otvori original", exact: true }),
  ).toHaveCount(0);
});
test("PDF originals open separately and download without embedded active content", async ({
  page,
}) => {
  await openScanner(page);
  await page.evaluate(() =>
    (
      window as unknown as {
        previewOriginal: (id: string, pdf: boolean) => Promise<void>;
      }
    ).previewOriginal("synthetic-pdf", true),
  );
  const open = page.getByRole("link", { name: "Otvori original", exact: true });
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(open).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    page.getByRole("link", { name: "Preuzmi", exact: true }),
  ).toHaveAttribute("download", "synthetic.pdf");
  await expect(
    page.locator(
      ".scan-original iframe,.scan-original embed,.scan-original object",
    ),
  ).toHaveCount(0);
});

test("demo placeholders can be replaced without an unnecessary confirmation", async ({
  page,
}) => {
  await openScanner(page, { demo: true });
  await selectImage(page);
  await expect(
    page.getByRole("button", { name: "Potvrdi i sačuvaj" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", { name: /Potvrđujem zamjenu/ }),
  ).toHaveCount(0);
});
