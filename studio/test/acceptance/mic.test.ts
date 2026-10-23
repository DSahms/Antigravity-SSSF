// Test D — microphone: the desktop build has no external speech service, so
// recognition fails with "network". The product must say exactly that and
// offer Paste/Upload — not blame the microphone. No model needed. Port 4635.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  acceptanceEnabled,
  launchPackaged,
  closeLaunched,
  dumpFailure,
  screenshot,
  goScreen,
  dismissTour,
  type Launched,
} from "./helpers";

const run = acceptanceEnabled() ? describe : describe.skip;

run("acceptance D — microphone availability reporting", () => {
  let l: Launched;
  const name = "d-mic";

  beforeAll(async () => {
    l = await launchPackaged(4635);
  }, 180_000);

  afterAll(async () => {
    if (l!) await closeLaunched(l);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && l!) {
      await dumpFailure(name, l);
    }
  });

  it("voice button exists and the failure names the missing service", async () => {
    await goScreen(l.page, /new job/i);
    await dismissTour(l.page);
    const mic = l.page.getByRole("button", { name: /microphone/i });
    expect(await mic.count()).toBeGreaterThan(0);
    await mic.first().click();
    await l.page.waitForTimeout(8000);
    const serviceMsg = l.collected.dialogs.find((d) =>
      /external speech service/i.test(d),
    );
    expect(serviceMsg).toBeDefined();
    // The message must not blame hardware the harness cannot verify.
    expect(serviceMsg).not.toMatch(/microphone was|microphone is not|no microphone/i);
    await screenshot(l.page, "d-mic-report");
  }, 120_000);

  it("paste and upload remain available when voice is not", async () => {
    await goScreen(l.page, /new job/i);
    await dismissTour(l.page);
    await l.page.getByRole("tab", { name: /paste/i }).first().click();
    await l.page.waitForTimeout(1000);
    expect(await l.page.getByRole("button", { name: /paste from clipboard/i }).count()).toBeGreaterThan(0);
    await l.page.getByRole("tab", { name: /upload/i }).first().click();
    await l.page.waitForTimeout(1000);
    expect(await l.page.evaluate(() => document.body.innerText)).toMatch(/upload a file/i);
  });
});
