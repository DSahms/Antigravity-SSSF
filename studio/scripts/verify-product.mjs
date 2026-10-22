/** Actual browser/application acceptance. --live-intake uses the owner-approved free router. */
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const studio = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = resolve(studio, "..");
const target = resolve(root, ".sssf/acceptance/product-20261021");
const out = resolve(root, ".sssf/verification/product-ui");
mkdirSync(out, { recursive: true });
const port = 4749, origin = `http://127.0.0.1:${port}`;
const server = spawn("bun", ["run", "server/index.ts"], { cwd: studio, env: { ...process.env, STUDIO_PORT: String(port), TARGET_DIR: target }, stdio: "ignore", windowsHide: true });
writeFileSync(resolve(out, "server.json"), JSON.stringify({ pid: server.pid, command: "bun run server/index.ts", target }));
let browser;
const checks = [], errors = [];
try {
  let ready = false;
  for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + "/api/health")).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  if (!ready) throw new Error("Owned acceptance server did not start");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(origin);
  await page.locator(".app-shell").waitFor();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  checks.push("first-run welcome can be skipped");
  await page.locator('[data-tour="nav-new-job"]').click();
  if (process.argv.includes("--live-intake")) {
    await page.locator("textarea").first().fill(readFileSync(resolve(target, "requests/build-acceptance.md"), "utf8"));
    const analyzed = page.waitForResponse(r => r.url().endsWith("/api/studio/discovery/analyze"), { timeout: 150000 });
    await page.getByRole("button", { name: /Read it back/ }).click();
    const response = await analyzed;
    if (!response.ok()) throw new Error("Live intake rejected: " + (await response.text()).slice(0, 1000));
    await page.locator("#interview-followup").waitFor();
    await page.locator("#interview-followup").fill("Keep the supplied requirements and boundaries exactly. Summarize the tiny normalization app for review; ask only if a required acceptance detail is missing.");
    const chatted = page.waitForResponse(r => r.url().endsWith("/api/studio/discovery/chat"), { timeout: 150000 });
    await page.getByRole("button", { name: "Send follow-up", exact: true }).click();
    if (!(await chatted).ok()) throw new Error("Live follow-up failed");
    checks.push("real model intake and button-driven free-form follow-up");
    await page.getByRole("button", { name: "Re-check edited spec", exact: true }).waitFor();
    await page.screenshot({ path: resolve(out, "intake-desktop.png"), fullPage: true });
    await page.reload();
    await page.locator('[data-tour="nav-new-job"]').click();
    await page.locator("#interview-followup").waitFor();
    checks.push("conversation survives browser reload");
  }
  if (process.argv.includes("--recheck-intake")) {
    await page.locator("#interview-followup").waitFor();
    const rechecked = page.waitForResponse(r => r.url().endsWith("/api/studio/discovery/chat"), { timeout: 150000 });
    await page.getByRole("button", { name: "Re-check edited spec", exact: true }).click();
    const response = await rechecked;
    if (!response.ok() || !(await response.json()).ready) throw new Error("Live edited specification is not ready; inspect saved interview");
    await page.locator('[data-tour="new-job-continue"]').waitFor();
    if (!(await page.locator('[data-tour="new-job-continue"]').isEnabled())) throw new Error("Ready intake cannot reach Review");
    checks.push("real model re-check restores readiness without weakening required sections");
    await page.reload();
    await page.locator('[data-tour="nav-new-job"]').click();
    await page.locator("#interview-followup").waitFor();
    checks.push("real conversation survives browser reload");
    await page.screenshot({ path: resolve(out, "intake-desktop.png"), fullPage: true });
  }
  await page.locator('[data-tour="nav-settings"]').click();
  await page.getByRole("button", { name: "Project checks", exact: false }).click();
  await page.locator("#quality-test").waitFor();
  if (!(await page.locator("#quality-test").inputValue()).includes("node")) throw new Error("Project-specific checks not rendered");
  checks.push("saved project-specific quality commands render");
  await page.locator('[data-tour="nav-sessions"]').click();
  const card = page.locator(".sessions .card, .card[href^='#/']").first();
  await card.waitFor();
  {
    await card.click();
    await page.locator(".trace").waitFor();
    checks.push("real persisted session card opens its trace");
    const phase = page.locator(".block").first();
    await phase.waitFor(); await phase.click(); await page.locator(".detail").waitFor(); checks.push("phase opens evidence detail");
  }
  await page.screenshot({ path: resolve(out, "sessions-desktop.png"), fullPage: true });
  await page.locator('[data-tour="nav-results"]').click();
  await page.getByText("Deliverables", { exact: true }).waitFor();
  checks.push("results exposes persisted deliverables");
  await page.screenshot({ path: resolve(out, "results-desktop.png"), fullPage: true });
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(resolve(out, "result.json"), JSON.stringify({ checks, browserErrors: errors }, null, 2));
  console.log(JSON.stringify({ passed: checks }));
} finally {
  await browser?.close();
  if (server.exitCode === null && server.pid) {
    if (process.platform === "win32") {
      const command = execFileSync("powershell", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${server.pid}").CommandLine`], { windowsHide: true, encoding: "utf8" });
      if (!command.includes("server/index.ts")) throw new Error("Owned server PID command line changed; leave it untouched");
    }
    server.kill();
  }
}
