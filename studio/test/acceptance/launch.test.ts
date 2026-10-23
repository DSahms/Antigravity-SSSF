// Test A — fresh packaged install: window renders, backend responds.
// Port 4631. No model/router needed.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  acceptanceEnabled,
  launchPackaged,
  closeLaunched,
  dumpFailure,
  screenshot,
  api,
  type Launched,
} from "./helpers";

const run = acceptanceEnabled() ? describe : describe.skip;

run("acceptance A — packaged launch", () => {
  let l: Launched;
  const name = "a-launch";

  beforeAll(async () => {
    l = await launchPackaged(4631);
  }, 180_000);

  afterAll(async () => {
    if (l!) await closeLaunched(l);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && l!) {
      await dumpFailure(name, l);
    }
  });

  it("the packaged main window renders the UI", async () => {
    // This page IS the packaged app's window (same target the app opened).
    expect(l.page.url()).toMatch(/^http:\/\/127\.0\.0\.1:4631\//);
    await screenshot(l.page, "a-appwindow");
  });

  it("the automation page loads the UI over HTTP from the embedded backend", async () => {
    expect(l.page.url()).toMatch(/^http:\/\/127\.0\.0\.1:4631\//);
    expect(await l.page.title()).toContain("C.R.E.W.");
    const text = await l.page.evaluate(() => document.body.innerText.length);
    expect(text).toBeGreaterThan(50);
    await screenshot(l.page, "a-home");
  });

  it("backend health and version respond", async () => {
    const health = await api<{ ok: boolean }>(l.port, "/api/health");
    expect(health.ok).toBe(true);
    const version = await api<{ name: string; version: string }>(l.port, "/api/version");
    expect(version.name).toContain("C.R.E.W.");
  });

  it("no failed requests or page errors on launch", async () => {
    await l.page.waitForTimeout(3000);
    expect(l.collected.failedRequests).toEqual([]);
    expect(l.collected.consoleErrors.filter((m) => !m.includes("favicon"))).toEqual([]);
  });
});
