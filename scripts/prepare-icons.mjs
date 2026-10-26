import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage();
  const svg = (await readFile("public/icon.svg")).toString();
  for (const [size, name] of [
    [192, "icon-192.png"],
    [512, "icon-512.png"],
    [180, "apple-touch-icon.png"],
  ]) {
    const data = await page.evaluate(
      async ({ svg, size }) => {
        const img = new Image();
        const uri = "data:image/svg+xml;base64," + btoa(svg);
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = uri;
        });
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const c = canvas.getContext("2d");
        c.fillStyle = "#48216D";
        c.fillRect(0, 0, size, size);
        c.drawImage(img, 0, 0, size, size);
        return canvas.toDataURL("image/png").split(",")[1];
      },
      { svg, size },
    );
    await writeFile("public/" + name, Buffer.from(data, "base64"));
  }
} finally {
  await browser.close();
}
