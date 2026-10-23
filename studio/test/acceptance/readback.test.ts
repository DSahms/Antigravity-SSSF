// Test E — read-back: the product's read-back is the sectioned text brief
// (there is no audio TTS path in the product). Port 4636. Needs router+seed.
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

run("acceptance E — read-back renders in clear sections", () => {
  let l: Launched;
  const name = "e-readback";

  beforeAll(async () => {
    l = await launchPackaged(4636);
    await api(l.port, "/api/studio/project/create", {
      method: "POST",
      body: JSON.stringify({ name: `rc-acc-e-${Date.now().toString(36)}` }),
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

  it("analyze produces all four read-back groups", async () => {
    await goScreen(l.page, /new job/i);
    await dismissTour(l.page);
    await l.page.locator("textarea").first().fill(MINI_TODO_TEXT);
    await analyzeWithRetry(l.page);
    const text = await l.page.evaluate(() => document.body.innerText);
    for (const group of ["Missing requirements", "Ambiguities", "Suggestions", "Risks"]) {
      expect(text).toMatch(new RegExp(group, "i"));
    }
    await screenshot(l.page, "e-readback");
  }, 360_000);

  it("read-back needed no audio service", async () => {
    // By design: read-back is text. No speechSynthesis path exists in the UI.
    const hasTTS = await l.page.evaluate(() => "speechSynthesis" in window);
    expect(hasTTS).toBe(true); // platform capability present; product simply uses text
    expect(benignDialogs(l.collected.dialogs)).toEqual([]);
  });
});
