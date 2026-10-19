import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const studio = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = resolve(studio, "..");
const output = resolve(root, ".sssf/verification/ui");
mkdirSync(output, { recursive: true });
const port = 4748;
const server = spawn("bun", ["run", "server/index.ts"], { cwd: studio, env: { ...process.env, STUDIO_PORT: String(port), TARGET_DIR: root }, stdio: "ignore", windowsHide: true });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); }
  if (!ready) throw new Error("UI test server did not start");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.locator(".app-shell").waitFor();
  await page.screenshot({ path: resolve(output, "home-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: /1\. New Job/ }).click();
  await page.getByRole("button", { name: "Use microphone", exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, "new-job-desktop.png"), fullPage: true });
  for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    for (const manual of ["users-manual", "learners-manual"]) {
      await page.goto(`http://127.0.0.1:${port}/manuals/${manual}/index.html`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) throw new Error(`${manual} overflows at ${size.width}`);
      await page.locator("#search").fill("router");
      if (!(await page.locator("main>section:not(.hidden)").count())) throw new Error("Manual search returned no sections");
      await page.locator("#search").fill("");
      await page.locator(".walk button").first().click();
      if ((await page.locator(".walk-detail").first().innerText()).startsWith("Choose") || (await page.locator(".walk-detail").first().innerText()).startsWith("Pick")) throw new Error("Walkthrough did not respond");
      if (manual === "learners-manual") {
        for (const id of ["q1", "q2", "q3", "q4", "q5"]) {
          const quiz = page.locator(`#${id}`);
          const answer = await quiz.getAttribute("data-answer");
          await quiz.locator(`input[value="${answer}"]`).check();
          await quiz.getByRole("button", { name: "Check answer" }).click();
          if (!(await quiz.locator(".feedback").innerText()).startsWith("Yes.")) throw new Error(`Quiz ${id} failed`);
        }
      }
      const broken = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].filter(a => !document.getElementById(a.getAttribute("href").slice(1))).length);
      if (broken) throw new Error("Broken manual anchor");
      await page.screenshot({ path: resolve(output, `${manual}-${size.width}.png`), fullPage: true });
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("UI and manuals passed: desktop/mobile layout, search, walkthroughs, five quizzes, anchors, and browser errors. Screenshots saved privately.");
} finally { await browser?.close(); server.kill(); }
