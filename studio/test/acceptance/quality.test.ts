// Test C1 — deterministic UI workflow: interview → approve → Quality Gate → results.
// Port 4633. Needs the local router + seeded profiles for the interview;
// the executed workflow itself makes zero model calls.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  acceptanceEnabled,
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
  MINI_TODO_TEXT,
  type Launched,
} from "./helpers";

const PROJECT = `rc-acc-q-${Date.now().toString(36)}`;
const CHECK = { test: ["node", "--version"], lint: ["node", "--version"], typecheck: ["node", "--version"], build: ["node", "--version"] };

const run = acceptanceEnabled() && modelReady() ? describe : describe.skip;

run("acceptance C1 — approve and run Quality Gate via the UI", () => {
  let l: Launched;
  const name = "c1-quality";
  let adwId = "";

  beforeAll(async () => {
    l = await launchPackaged(4633);
    // Fixture project + real check commands via the same endpoints the UI uses.
    await api(l.port, "/api/studio/project/create", { method: "POST", body: JSON.stringify({ name: PROJECT }) });
    await api(l.port, "/api/studio/project/quality", { method: "POST", body: JSON.stringify(CHECK) });
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

  it("interviews to a ready spec and continues to review", async () => {
    await goScreen(l.page, /new job/i);
    await dismissTour(l.page);
    await l.page.locator("textarea").first().fill(MINI_TODO_TEXT);
    await analyzeWithRetry(l.page);
    const ready = await answerUntilReady(l.page, 25);
    expect(ready).toBe(true);
    await l.page.getByRole("button", { name: /^continue$/i }).first().click();
    await l.page.waitForTimeout(3000);
    await screenshot(l.page, "c1-review");
  }, 1_500_000);

  it("approves via the review screen and runs the gate", async () => {
    await l.page.locator("select").first().selectOption("adw_quality.py");
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
    const final = await waitForRun(l.port, runs[0].runId, 300_000);
    expect(final.status).toBe("success");
    await screenshot(l.page, "c1-run-done");
  }, 600_000);

  it("gate results are inspectable", async () => {
    const gates = await api<{ area: string; passed: number }[]>(l.port, `/api/sessions/${adwId}/gates`);
    expect(gates.length).toBe(4);
    expect(gates.every((g) => g.passed === 1)).toBe(true);
    await l.page.getByRole("button", { name: /see results/i }).first().click();
    await l.page.waitForTimeout(3000);
    const text = await l.page.evaluate(() => document.body.innerText);
    expect(text).toMatch(/success|passed|Quality Gate/i);
    await screenshot(l.page, "c1-results");
  }, 120_000);

  it("no failed requests during the flow", async () => {
    expect(l.collected.failedRequests).toEqual([]);
  });
});
