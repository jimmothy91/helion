import { chromium } from "playwright";

async function run(policy) {
  const browser = await chromium.launch({
    headless: true,
    args: [`--autoplay-policy=${policy}`],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.addInitScript(() => {
    const Orig = window.AudioContext || window.webkitAudioContext;
    window.__log = [];
    function Wrap(...args) {
      const ctx = new Orig(...args);
      window.__ctx = ctx;
      window.__log.push("create " + ctx.state);
      const r = ctx.resume.bind(ctx);
      ctx.resume = () => r().then(() => { window.__log.push("resumed " + ctx.state); }).catch((e) => { window.__log.push("ERR " + e.name + " " + e.message); });
      return ctx;
    }
    Wrap.prototype = Orig.prototype;
    window.AudioContext = Wrap;
  });
  await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.__log.slice());
  await page.mouse.click(40, 40);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ log: window.__log, state: window.__ctx && window.__ctx.state }));
  console.log(policy, JSON.stringify({ before, after }));
  await browser.close();
}
for (const p of ["user-gesture-required", "document-user-activation-required"]) {
  await run(p);
}
