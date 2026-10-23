// Test G — error recovery: backend down → actionable message → backend back →
// user continues without restarting the app. No model needed. Port 4638.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  acceptanceEnabled,
  launchPackaged,
  closeLaunched,
  dumpFailure,
  screenshot,
  goScreen,
  api,
  waitForHealth,
  startBackendHeadless,
  portOwner,
  type Launched,
} from "./helpers";

const run = acceptanceEnabled() ? describe : describe.skip;

run("acceptance G — backend outage and recovery", () => {
  let l: Launched;
  const name = "g-recovery";
  const PORT = 4638;

  beforeAll(async () => {
    l = await launchPackaged(PORT);
  }, 180_000);

  afterAll(async () => {
    if (l!) await closeLaunched(l);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && l!) {
      await dumpFailure(name, l);
    }
  });

  it("stopping only the backend child is precise", async () => {
    // The backend is whatever LISTENs on our port and belongs to the
    // packaged stack — verified by command line before touching it.
    const owner = portOwner(PORT);
    expect(owner).not.toBeNull();
    expect(owner!.cmd.replace(/\\/g, "/")).toMatch(/bun.*server\/index\.ts/);
    process.kill(owner!.pid);
    await new Promise((r) => setTimeout(r, 3000));
    await expect(api(PORT, "/api/health")).rejects.toThrow();
  }, 120_000);

  it("the UI reports an actionable backend error, not 'Failed to fetch'", async () => {
    l.collected.dialogs.length = 0;
    await goScreen(l.page, /new job/i);
    await l.page.locator("textarea").first().fill("Recovery probe text.");
    await l.page.getByRole("button", { name: /read it back to me/i }).first().click();
    await l.page.waitForTimeout(8000);
    const backendMsg = l.collected.dialogs.find((d) => /cannot reach the crew backend/i.test(d));
    expect(backendMsg).toBeDefined();
    // The message must name the backend, the URL tried, and the remedy —
    // not just the raw fetch error. (The raw error is kept in parentheses
    // for diagnosis.)
    expect(backendMsg).toMatch(/restart the app/i);
    expect(backendMsg).toMatch(/http:\/\/127\.0\.0\.1:4638/);
    await screenshot(l.page, "g-backend-down");
  }, 120_000);

  it("after the backend returns, the same window continues", async () => {
    const proc = startBackendHeadless(PORT);
    l.extraProcs.push(proc);
    await waitForHealth(PORT, 90_000);
    l.collected.dialogs.length = 0;
    await goScreen(l.page, /home/i);
    await l.page.waitForTimeout(4000);
    expect(l.collected.dialogs).toEqual([]);
    const health = await api<{ ok: boolean }>(PORT, "/api/health");
    expect(health.ok).toBe(true);
    await screenshot(l.page, "g-recovered");
  }, 180_000);
});
