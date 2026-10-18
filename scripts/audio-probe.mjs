import { chromium } from "playwright";

async function run(label, opts) {
  const browser = await chromium.launch({ headless: true, args: opts.args || [] });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const logs = [];
  page.on("pageerror", (err) => logs.push("pageerror " + err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") logs.push("console " + msg.text());
  });
  await page.addInitScript(() => {
    const Orig = window.AudioContext || window.webkitAudioContext;
    window.__audioLog = [];
    window.__starts = 0;
    const proto = Orig.prototype;
    const origOsc = window.OscillatorNode.prototype.start;
    window.OscillatorNode.prototype.start = function (...a) {
      window.__starts++;
      return origOsc.apply(this, a);
    };
    function Wrap(...args) {
      const ctx = new Orig(...args);
      window.__ctx = ctx;
      window.__audioLog.push("create " + ctx.state);
      const r = ctx.resume.bind(ctx);
      ctx.resume = () => {
        window.__audioLog.push("resume()");
        return r().then((v) => {
          window.__audioLog.push("resumed " + ctx.state);
          return v;
        }).catch((e) => {
          window.__audioLog.push("resume ERR " + e.message);
          throw e;
        });
      };
      return ctx;
    }
    Wrap.prototype = proto;
    window.AudioContext = Wrap;
    window.webkitAudioContext = Wrap;
  });
  if (opts.iframe) {
    await page.setContent(`<iframe id=f src="http://127.0.0.1:8080/" style="width:390px;height:800px;border:0"></iframe>`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const frame = page.frames().find((f) => f.url().includes("8080"));
    await frame.waitForTimeout(500);
    await page.mouse.click(180, 500);
    await page.waitForTimeout(1200);
    const state = await frame.evaluate(() => ({
      log: window.__audioLog,
      starts: window.__starts,
      state: window.__ctx && window.__ctx.state,
      time: window.__ctx && window.__ctx.currentTime,
      text: document.body.innerText.slice(0, 180),
    }));
    console.log(label, JSON.stringify({ state, logs }, null, 2));
  } else {
    await page.goto("http://127.0.0.1:8080/", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(600);
    const before = await page.evaluate(() => ({ log: window.__audioLog, starts: window.__starts, state: window.__ctx && window.__ctx.state }));
    await page.mouse.click(180, 520);
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({
      log: window.__audioLog,
      starts: window.__starts,
      state: window.__ctx && window.__ctx.state,
      time: window.__ctx && window.__ctx.currentTime,
      text: document.body.innerText.slice(0, 180),
    }));
    console.log(label, JSON.stringify({ before, after, logs }, null, 2));
  }
  await browser.close();
}

await run("top-level-default", {});
await run("iframe-no-allow", { iframe: true });
