// Test C2 — release acceptance: a real Mini To-Do app generated through the UI.
// Port 4634. Only runs with CREW_ACCEPTANCE_FULL=1 plus router + seeded profiles.
// Expect a long, token-heavy run (builder agent). Cost on the saved router is $0.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptanceEnabled,
  fullEnabled,
  modelReady,
  launchPackaged,
  closeLaunched,
  dumpFailure,
  screenshot,
  goScreen,
  dismissTour,
  answerUntilReady,
  analyzeWithRetry,
  api,
  waitForRun,
  appResourcesDir,
  MINI_TODO_TEXT,
  type Launched,
} from "./helpers";

const PROJECT = `rc-acc-todo-${Date.now().toString(36)}`;
const CHECK = { test: ["node", "--version"] };

const run = acceptanceEnabled() && fullEnabled() && modelReady() ? describe : describe.skip;

run("acceptance C2 — Mini To-Do generated via the UI", () => {
  let l: Launched;
  const name = "c2-minitodo";
  let adwId = "";

  beforeAll(async () => {
    l = await launchPackaged(4634);
    await api(l.port, "/api/studio/project/create", { method: "POST", body: JSON.stringify({ name: PROJECT }) });
    await api(l.port, "/api/studio/project/quality", { method: "POST", body: JSON.stringify(CHECK) });
    // Raise the run cap for the builder; the default 20k only fits Plan Only.
    await api(l.port, "/api/studio/profiles", { method: "POST", body: JSON.stringify({ defaultTokenCap: 250000 }) });
    await l.page.reload();
    await l.page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 120_000 });
  }, 180_000);

  afterAll(async () => {
    if (l!) await closeLaunched(l);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && l!) {
      await dumpFailure(name, l);
    }
  });

  it("interviews to a ready spec", async () => {
    await goScreen(l.page, /new job/i);
    await dismissTour(l.page);
    await l.page.locator("textarea").first().fill(MINI_TODO_TEXT);
    await analyzeWithRetry(l.page);
    const ready = await answerUntilReady(l.page, 25);
    expect(ready).toBe(true);
    await l.page.getByRole("button", { name: /^continue$/i }).first().click();
    await l.page.waitForTimeout(3000);
  }, 1_500_000);

  it("approves Plan Build Test and the builder delivers the app", async () => {
    await l.page.locator("select").first().selectOption("adw_plan_build_test.py");
    await l.page.getByRole("button", { name: /confirm all/i }).first().click();
    await l.page.locator(".final-check input").first().check();
    await l.page.getByRole("button", { name: /approve and continue/i }).first().click();
    await l.page.getByText(/approved v1/i).first().waitFor({ timeout: 60_000 });
    await l.page.getByRole("button", { name: /continue to run/i }).first().click();
    await l.page.waitForTimeout(3000);
    await l.page.getByRole("button", { name: /run the approved job/i }).first().click();
    const runs = await api<{ runId: string; adwId: string }[]>(l.port, "/api/studio/runs/active");
    expect(runs.length).toBeGreaterThan(0);
    adwId = runs[0].adwId;
    const final = await waitForRun(l.port, runs[0].runId, 2_700_000);
    expect(final.status).toBe("success");
  }, 2_700_000);

  it("the generated app exists and behaves as specified", async () => {
    const dir = join(appResourcesDir(), ".sssf", "projects", PROJECT);
    const candidates = ["index.html", "todo.html", "app.html", "mini-todo.html"];
    let found = "";
    for (const c of candidates) {
      if (existsSync(join(dir, c))) { found = join(dir, c); break; }
    }
    expect(found).not.toBe("");
    const html = readFileSync(found, "utf-8");
    expect(html).toMatch(/localStorage/i);
    expect(html).toMatch(/add|task|todo/i);
    await screenshot(l.page, "c2-app-done");
  });
});
