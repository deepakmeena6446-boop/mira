// Rasterise public/icon.svg into the PNG sizes the PWA manifest and iOS need.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icon.svg", "utf8");
const targets = [
  ["public/icon-192.png", 192, 0],
  ["public/icon-512.png", 512, 0],
  ["public/apple-icon.png", 180, 0],
  ["public/icon-maskable-512.png", 512, 0.12], // safe-zone padding for maskable icons
];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [out, size, pad] of targets) {
  const inner = Math.round(size * (1 - pad * 2));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:#315bf4;display:grid;place-items:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body>`);
  await page.screenshot({ path: out, omitBackground: pad === 0 });
}
await browser.close();
console.log("icons rendered");
