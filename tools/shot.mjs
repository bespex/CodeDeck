// Screenshots of the browser preview (mock data), for checking UI changes without the app.
//
//   npx vite --port 5391 &
//   node tools/shot.mjs <url> <out-prefix> [step...]
//
// Steps run in order:
//   snap:<name>          screenshot to <out-prefix>-<name>.png
//   hover:<selector>     mouse onto the element (e.g. the trail opens)
//   click:<selector>     click the element
//   text:<text>          click the first button or tab whose text starts with <text>
//   ctrl+click:…, ctrl+text:…   the same with Ctrl held
//   wait:<ms>
// Without steps: one screenshot, <out-prefix>-page.png. Needs /usr/bin/chromium; Node 22.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, ...steps] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node tools/shot.mjs <url> <out-prefix> [step...]");
  process.exit(2);
}
const port = 9333;
const profile = mkdtempSync(join(tmpdir(), "codedeck-shot-"));
const chrome = spawn(
  "/usr/bin/chromium",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1500);

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (pending.has(m.id)) pending.get(m.id)(m.result), pending.delete(m.id);
};
const cmd = (method, params = {}) =>
  new Promise((r) => {
    pending.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

await cmd("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
await cmd("Page.navigate", { url });
await sleep(2500);

/** Centre of the element the expression finds, or null. */
async function centre(expr) {
  const r = await cmd("Runtime.evaluate", {
    expression: `(() => { const el = ${expr}; if (!el) return null; const b = el.getBoundingClientRect(); return JSON.stringify([b.x + b.width / 2, b.y + Math.min(b.height / 2, 120)]); })()`,
    returnByValue: true,
  });
  return r.result.value ? JSON.parse(r.result.value) : null;
}
async function mouse(expr, press, modifiers = 0) {
  const at = await centre(expr);
  if (!at) return console.error("not found:", expr);
  const [x, y] = at;
  await cmd("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  if (press) {
    await cmd("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1, modifiers });
    await cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1, modifiers });
  }
  await sleep(700);
}

for (const step of steps.length ? steps : ["snap:page"]) {
  const [head, ...rest] = step.split(":");
  const ctrl = head.startsWith("ctrl+") ? 2 : 0;
  const kind = head.replace(/^ctrl\+/, "");
  const arg = rest.join(":");
  const q = JSON.stringify(arg);
  if (kind === "snap") {
    const r = await cmd("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${out}-${arg}.png`, Buffer.from(r.data, "base64"));
    console.log(`${out}-${arg}.png`);
  } else if (kind === "hover") await mouse(`document.querySelector(${q})`, false);
  else if (kind === "click") await mouse(`document.querySelector(${q})`, true, ctrl);
  else if (kind === "text")
    await mouse(`[...document.querySelectorAll("button,[role=tab]")].find(e => e.textContent.trim().startsWith(${q}))`, true, ctrl);
  else if (kind === "wait") await sleep(Number(arg));
  else console.error("unknown step:", step);
}

ws.close();
// Chromium still writes to its profile while closing: remove it only once it is gone
await new Promise((r) => (chrome.once("exit", r), chrome.kill()));
// Its helper processes may write a moment longer: try a few times, never fail over it
for (let i = 0; i < 10; i++) {
  try {
    rmSync(profile, { recursive: true, force: true });
    break;
  } catch {
    await sleep(200);
  }
}
process.exit(0);
