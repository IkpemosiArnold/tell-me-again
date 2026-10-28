// Phone-size checks against a URL: no sideways scroll, 17 px body text, visible words above
// the fold, tap targets under 44 px, cross-origin isolation, and screenshots in dark and light.
//   node tools/phone-check.mjs [url] [out dir]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const [base = "https://tellmeagain.onrender.com/", out = "/tmp/tma-phone"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const report = [];
for (const [w, h, name] of [[375, 667, "se"], [393, 852, "15"]]) {
  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, userAgent: IPHONE, colorScheme: scheme, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const visible = (e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.top < innerHeight && !e.closest("details:not([open]) > :not(summary)");
      };
      const words = [...document.querySelectorAll("h1,h2,p,button,a,summary,label,span")]
        .filter((e) => e.children.length === 0 && visible(e))
        .map((e) => e.textContent.trim())
        .join(" ")
        .split(/\s+/)
        .filter(Boolean).length;
      const small = [...document.querySelectorAll("button,a,summary,input:not(.visually-hidden)")]
        .filter((e) => visible(e) && e.getBoundingClientRect().height < 44)
        .map((e) => `${e.textContent.trim().slice(0, 20)}:${Math.round(e.getBoundingClientRect().height)}`);
      return { sideways: document.documentElement.scrollWidth > innerWidth, bodyPx: getComputedStyle(document.body).fontSize, words, small, isolated: crossOriginIsolated };
    });
    report.push({ name, scheme, ...m });
    await page.screenshot({ path: `${out}/${name}-${scheme}-home.png` });
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify(report));
