// Test B — project intake: paste text, analyze, read-back renders.
// Port 4632. Needs the local router + seeded profiles; skips otherwise.
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
  analyzeWithRetry,
  benignDialogs,
  api,
  MINI_TODO_TEXT,
  type Launched,
} from "./helpers";

const run = acceptanceEnabled() && modelReady() ? describe : describe.skip;

run("acceptance B — project intake", () => {
  let l: Launched;
  const name = "b-intake";

  beforeAll(async () => {
    l = await launchPackaged(4632);
    await api(l.port, "/api/studio/project/create", {
      method: "POST",
      body: JSON.stringify({ name: `rc-acc-b-${Date.now().toString(36)}` }),
    });
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

  it("accepts pasted text and produces the sectioned read-back", async () => {
    await goScreen(l.page, /new job/i);
    await dismissTour(l.page);
    const boxes = l.page.locator("textarea");
    await boxes.first().fill(MINI_TODO_TEXT);
    await analyzeWithRetry(l.page);
    const sections = await l.page.locator(".rb-section").count();
    expect(sections).toBeGreaterThan(0);
    await screenshot(l.page, "b-readback");
  }, 360_000);

  it("no failed requests and no error dialogs during intake", async () => {
    expect(l.collected.failedRequests).toEqual([]);
    // Forgive only the explicitly-retryable model hiccup the UI names.
    expect(benignDialogs(l.collected.dialogs)).toEqual([]);
  });
});
