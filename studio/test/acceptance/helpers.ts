// Shared harness for packaged-app acceptance tests (runs the REAL installed bits).
//
// Usage (from studio/):
//   CREW_ACCEPTANCE=1 bunx vitest run test/acceptance --hookTimeout=180000 --testTimeout=600000
// Full release run (adds the real agent build):
//   CREW_ACCEPTANCE=1 CREW_ACCEPTANCE_FULL=1 bunx vitest ...
//
// Conventions:
// - The packaged app is driven via Playwright _electron against
//   release/win-unpacked (the exact electron-builder output).
// - Each file uses its own STUDIO_PORT (4631-4637) so files stay parallel-safe
//   and can never touch a live install on 4620.
// - Router-dependent tests (interview/analyze, agent builds) require the local
//   router at 127.0.0.1:31415 plus seeded profiles; otherwise they skip with a
//   clear reason instead of failing.
import { type Page, type Browser, chromium } from "playwright";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, writeFileSync, unlinkSync, renameSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const STUDIO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const REPO_ROOT = resolve(STUDIO_ROOT, "..");
export const PACKED_ROOT = join(REPO_ROOT, "release", "win-unpacked");
export const PACKED_EXE = join(PACKED_ROOT, "CREW Software.exe");
export const PACKED_RESOURCES = join(PACKED_ROOT, "resources");
export const RESULTS_DIR = join(STUDIO_ROOT, "test-results", "acceptance");

export const ROUTER_URL = "http://127.0.0.1:31415";

/** Deterministic intake fixture used by the UI acceptance tests. */
export const MINI_TODO_TEXT =
  "Mini To-Do List: a single-page web app. Add tasks with a text box and an Add button, " +
  "check tasks off by clicking them, delete tasks with a small button. " +
  "Persist tasks in localStorage so they survive reload. Single HTML file, no frameworks, plain styling.";

export function acceptanceEnabled(): boolean {
  return process.env.CREW_ACCEPTANCE === "1";
}

export function fullEnabled(): boolean {
  return process.env.CREW_ACCEPTANCE_FULL === "1";
}

export interface Collected {
  consoleErrors: string[];
  failedRequests: string[];
  dialogs: string[];
}

export interface Launched {
  browser: Browser;
  page: Page;
  port: number;
  exePid: number;
  exeProc: ChildProcess;
  collected: Collected;
  extraProcs: ChildProcess[];
}

function apiBase(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export async function api<T>(port: number, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase(port)}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Origin: apiBase(port), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} → HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** True when the local model router answers. */
export function routerReachable(): boolean {
  try {
    execSync(`curl.exe -s -m 5 ${ROUTER_URL}/v1/models`, { stdio: "pipe", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** True when the local model router answers and saved profiles exist to seed. */
export function modelReady(): boolean {
  return routerReachable() && existsSync(join(REPO_ROOT, ".sssf", "profiles.json"));
}

/** Seed the packaged target with the developer's saved router profiles so
 * interview/analyze and agent runs work. Same-machine file copy only — the
 * key is never read, printed, or committed. Atomic + race-safe: parallel
 * workers may seed at once. Returns true when a usable file is in place. */
export function seedProfiles(): boolean {
  const src = join(REPO_ROOT, ".sssf", "profiles.json");
  if (!existsSync(src)) return false;
  const dir = join(PACKED_RESOURCES, ".sssf");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const dest = join(dir, "profiles.json");
    const tmp = join(dir, `profiles.json.tmp.${process.pid}`);
    copyFileSync(src, tmp);
    try {
      // Windows rename does not overwrite: unlink first, tolerate races.
      if (existsSync(dest)) unlinkSync(dest);
      renameSync(tmp, dest);
    } catch {
      if (existsSync(dest)) {
        try { unlinkSync(dest); } catch {}
      }
      try { renameSync(tmp, dest); } catch {}
    }
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch {}
    return existsSync(dest) && statSync(dest).size > 0;
  } catch {
    return existsSync(join(dir, "profiles.json"));
  }
}

export function portInUse(port: number): boolean {
  try {
    // Only LISTEN counts: TIME_WAIT leftovers from a previous run must not
    // block rebinding the same port.
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1"`,
      { stdio: "pipe", windowsHide: true },
    ).toString();
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export async function launchPackaged(port: number): Promise<Launched> {
  if (!existsSync(PACKED_EXE)) {
    throw new Error(
      `Packaged app missing at ${PACKED_EXE}. Build it first: cd studio && bun run electron:dist`,
    );
  }
  if (portInUse(port)) {
    // Self-healing: a crashed run can leave our own backend holding the
    // port (verified win-unpacked test bits only — never anything else).
    const stale = portOwner(port);
    if (stale) {
      console.log(`[acceptance] reaping stale test backend PID ${stale.pid} on port ${port}`);
      reapPortOwner(port);
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (portInUse(port)) {
      throw new Error(
        `Port ${port} is already in use (a live install uses 4620; acceptance uses 4631+). Free it and retry.`,
      );
    }
  }
  seedProfiles();
  const collected: Collected = { consoleErrors: [], failedRequests: [], dialogs: [] };
  // Drive the REAL packaged window over its own DevTools endpoint. (Playwright's
  // _electron driver misses windows the app opens before CDP attaches and this
  // Electron build rejects Target.createTarget, so neither firstWindow() nor a
  // driver-made page works — connectOverCDP enumerates the live window.)
  const dbgPort = port + 100;
  if (portInUse(dbgPort)) {
    throw new Error(`Debug port ${dbgPort} is already in use. Free it and retry.`);
  }
  const userDataDir = join(tmpdir(), `crew-acc-ud-${port}-${process.pid}`);
  if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true });
  let proc: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    proc = spawn(PACKED_EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${dbgPort}`], {
      env: { ...process.env, STUDIO_PORT: String(port) },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    const errText = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("DevTools endpoint never printed within 120s")), 120_000);
      let buf = "";
      proc!.stderr!.on("data", (d: Buffer) => {
        buf += d.toString();
        if (/DevTools listening on ws:\/\//.test(buf)) {
          clearTimeout(timer);
          resolve(buf);
        }
      });
      proc!.on("error", (e) => { clearTimeout(timer); reject(e); });
      proc!.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Packaged app exited early with code ${code}: ${buf.slice(-500)}`)); });
    });
    const wsMatch = /DevTools listening on (ws:\/\/\S+)/.exec(errText);
    if (!wsMatch) throw new Error("Could not find DevTools endpoint in app output");
    // Wait for the app window's page target to EXIST (plain HTTP polling —
    // proven reliable), and only then attach: this Electron build does not
    // deliver target-created events for windows opened after Playwright's
    // CDP session attaches, so attaching first leaves pages() empty forever.
    const dbgHttp = `http://127.0.0.1:${dbgPort}`;
    const start = Date.now();
    for (;;) {
      try {
        const res = await fetch(`${dbgHttp}/json/list`);
        const list = (await res.json()) as { type?: string; url?: string }[];
        const ready = list.some((t) => t.type === "page" && (t.url ?? "").startsWith("http://127.0.0.1:"));
        if (ready) break;
      } catch {}
      if (Date.now() - start > 120_000) {
        throw new Error("Packaged app opened no window within 120s");
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    // Give the fresh target a moment to settle before attaching.
    await new Promise((r) => setTimeout(r, 3000));
    browser = await chromium.connectOverCDP(dbgHttp, { timeout: 120_000 });
    const pages = browser.contexts().flatMap((c) => {
      try {
        return c.pages();
      } catch {
        return [] as Page[];
      }
    });
    if (pages.length === 0) throw new Error("Attached to packaged app but found no window");
    const page = pages[0];
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 120_000 });
    page.on("console", (m) => {
      if (m.type() === "error") collected.consoleErrors.push(m.text().slice(0, 500));
    });
    page.on("pageerror", (e) => collected.consoleErrors.push(`pageerror: ${String(e).slice(0, 500)}`));
    page.on("requestfailed", (r) => collected.failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));
    page.on("dialog", async (d) => {
      collected.dialogs.push(`${d.type()}: ${d.message().slice(0, 400)}`);
      // RunView asks for launch confirmation via confirm(): a real user clicks
      // OK to start their approved job, so the harness accepts confirms and
      // dismisses alerts/prompts.
      try {
        if (d.type() === "confirm") await d.accept();
        else await d.dismiss();
      } catch {}
    });
    return { browser, page, port, exePid: proc.pid!, exeProc: proc, collected, extraProcs: [] };
  } catch (e) {
    // Bury nothing: a half-started app holds STUDIO_PORT and poisons later
    // runs. Kill the verified port owner, then the app process itself.
    try { reapPortOwner(port); } catch {}
    if (proc && proc.pid) {
      try { proc.kill(); } catch {}
    }
    try { if (browser) await browser.close(); } catch {}
    throw e;
  }
}
export async function closeLaunched(l: Launched): Promise<void> {
  for (const p of l.extraProcs) {
    try {
      p.kill();
    } catch {}
  }
  // Stop the spawned backend first (verified port owner), then the app itself.
  try { reapPortOwner(l.port); } catch {}
  try { await l.browser.close(); } catch {}
  try { l.exeProc.kill(); } catch {}
}

export async function dumpFailure(name: string, l: Launched): Promise<void> {
  try {
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(
      join(RESULTS_DIR, `${name}.log.json`),
      JSON.stringify(l.collected, null, 2),
      "utf-8",
    );
  } catch {}
  await screenshot(l.page, name).catch(() => {});
}

export async function screenshot(page: Page, name: string): Promise<void> {
  try {
    if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
    await page.screenshot({ path: join(RESULTS_DIR, `${name}.png`) });
  } catch {}
}

/** Dismiss the onboarding tour overlay if it is showing (fresh profiles
 * start with it, and it can cover the controls the tests drive). */
export async function dismissTour(page: Page): Promise<void> {
  try {
    const skip = page.getByRole("button", { name: /^skip$/i });
    if ((await skip.count()) > 0) {
      await skip.first().click({ timeout: 5000 });
      await page.waitForTimeout(1000);
    }
  } catch {}
}

/** Click "Read it back to me" and wait for the sectioned read-back, retrying
 * the small-model hiccup the UI itself reports as retryable
 * ("The interviewer response was incomplete. Try again; your input is
 * saved."). Throws on the final attempt. */
export async function analyzeWithRetry(page: Page, attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    await page.getByRole("button", { name: /read it back to me/i }).first().click();
    try {
      await page.getByText(/read-back/i).first().waitFor({ timeout: 150_000 });
      return;
    } catch {
      await page.waitForTimeout(3000);
    }
  }
  await page.getByRole("button", { name: /read it back to me/i }).first().click();
  await page.getByText(/read-back/i).first().waitFor({ timeout: 150_000 });
}

/** The benign, explicitly-retryable interviewer hiccup. Tests that assert a
 * clean dialog slate must forgive exactly this alert. */
export function benignDialogs(dialogs: string[]): string[] {
  return dialogs.filter((d) => !/interviewer response was incomplete/i.test(d));
}

/** Answer open interview questions until the header Continue enables.
 * Clicks the first suggested choice, else types a neutral free-text answer.
 * Waits for each answer to register. When no questions are open but the
 * spec is still not ready, presses "Re-check edited spec" — the designed
 * accelerator that asks the interviewer to summarize for review. */
export async function answerUntilReady(page: Page, maxRounds: number): Promise<boolean> {
  const cont = () => page.getByRole("button", { name: /^continue$/i }).first();
  let stagnant = 0;
  for (let round = 0; round < maxRounds; round++) {
    try {
      if (await cont().isEnabled({ timeout: 3000 })) return true;
    } catch {}
    const answered = await page.locator(".q-card.answered").count();
    const choices = page.locator(".q-card:not(.answered) .q-choices button");
    if ((await choices.count()) > 0) {
      await choices.first().click();
      stagnant = 0;
    } else {
      const inputs = page.locator(".q-card:not(.answered) .q-choices input");
      if ((await inputs.count()) === 0) {
        // No open questions but not ready: nudge the interviewer to summarize.
        const recheck = page.getByRole("button", { name: /re-check edited spec/i });
        if ((await recheck.count()) > 0) {
          await recheck.first().click();
          await page.waitForTimeout(45000);
        } else {
          await page.waitForTimeout(10000);
        }
        stagnant++;
        if (stagnant > 6) return false;
        continue;
      }
      await inputs.first().fill("Keep it simple.");
      await inputs.first().press("Enter");
      stagnant = 0;
    }
    try {
      await page.waitForFunction(
        (n) => document.querySelectorAll(".q-card.answered").length > n,
        answered,
        { timeout: 180_000 },
      );
    } catch {
      stagnant++;
      if (stagnant > 6) return false;
    }
  }
  try {
    return await cont().isEnabled({ timeout: 5000 });
  } catch {
    return false;
  }
}

/** Sidebar navigation by visible label. */
export async function goScreen(page: Page, label: RegExp | string): Promise<void> {
  const btn = page.getByRole("button", { name: label });
  if ((await btn.count()) > 0) {
    await btn.first().click();
    await page.waitForTimeout(1500);
    return;
  }
  const link = page.getByRole("link", { name: label });
  await link.first().click();
  await page.waitForTimeout(1500);
}

/** Poll a run to a terminal state via the app's own API. */
export async function waitForRun(
  port: number,
  runId: string,
  timeoutMs: number,
): Promise<{ status: string; exitCode?: number; adwId?: string }> {
  const start = Date.now();
  for (;;) {
    const st = await api<{ status: string; exitCode?: number; adwId?: string }>(
      port,
      `/api/studio/runs/${runId}`,
    );
    if (st.status !== "running" && st.status !== "paused") return st;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Run ${runId} still ${st.status} after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** Find whatever LISTENs on a test port, when it is OUR packaged stack
 * (win-unpacked exe or its bun backend). Precise: the port uniquely maps to
 * the test backend; foreign processes can never match the command line. */
export function portOwner(port: number): { pid: number; cmd: string } | null {
  try {
    // Write-Output emits raw strings (formatted views like Format-List/table
    // truncate long command lines with ellipses).
    const out = execSync(
      `powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-CimInstance Win32_Process -Filter \\"ProcessId=$($c.OwningProcess)\\"; Write-Output $p.ProcessId; Write-Output $p.ExecutablePath; Write-Output $p.CommandLine }"`,
      { stdio: "pipe", windowsHide: true },
    ).toString().trim().split(/\r?\n/);
    const pid = Number(out[0]);
    const cmd = out.slice(1).join(" ");
    // Match fragments separately; normalize separators first (Windows paths
    // use backslashes) and ignore other whitespace (Format views wrap lines).
    const flat = cmd.replace(/\s+/g, "").replace(/\\/g, "/");
    if (process.env.CREW_ACC_DEBUG) console.log(`[portOwner:${port}] pid=${pid} flat=${flat.slice(0, 220)}`);
    if (
      Number.isInteger(pid) && pid > 0 &&
      flat.includes("win-unpacked") &&
      flat.includes("bun.exe") &&
      flat.includes("server/index.ts")
    ) {
      return { pid, cmd };
    }
    return null;
  } catch {
    return null;
  }
}

export function reapPortOwner(port: number): number | null {
  const owner = portOwner(port);
  if (!owner) return null;
  try {
    execSync(`powershell -NoProfile -Command "Stop-Process -Id ${owner.pid} -Force"`, { stdio: "pipe", windowsHide: true });
    return owner.pid;
  } catch {
    return null;
  }
}

/** Restart a packaged backend headlessly (same bits the app spawned). The
 * caller owns the returned process and must kill it during teardown. */
export function startBackendHeadless(port: number): ChildProcess {
  const bun = join(PACKED_RESOURCES, "bun.exe");
  const server = join(PACKED_RESOURCES, "app", "server", "index.ts");
  const proc = spawn(bun, ["run", server], {
    env: { ...process.env, STUDIO_PORT: String(port) },
    stdio: "ignore",
    detached: true,
  });
  proc.unref();
  return proc;
}

export async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${apiBase(port)}/api/health`);
      if (res.ok) return;
    } catch {}
    if (Date.now() - start > timeoutMs) throw new Error(`Backend on ${port} never healthy`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
