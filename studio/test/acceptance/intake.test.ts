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

  it("Paste button drops real clipboard text (David's exact path)", async () => {
    await goScreen(l.page, /new job/i);
    await dismissTour(l.page);
    await l.page.getByRole("tab", { name: /paste/i }).first().click();
    const marker = `clipboard-probe-${Date.now().toString(36)} Mini To-Do via button.`;
    await l.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await l.page.evaluate((t) => navigator.clipboard.writeText(t), marker);
    await l.page.getByRole("button", { name: /paste from clipboard/i }).first().click();
    await l.page.waitForFunction(
      (m) => (document.querySelectorAll("textarea")[0] as HTMLTextAreaElement)?.value.includes(m),
      marker,
      { timeout: 30_000 },
    );
    const value = await l.page.locator("textarea").first().inputValue();
    expect(value).toContain(marker);
    await screenshot(l.page, "b-paste-button");
  }, 120_000);

  it("file upload reads a .md file (David's import path)", async () => {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const fixture = join(tmpdir(), `crew-acc-upload-${Date.now().toString(36)}.md`);
    writeFileSync(fixture, "# Uploaded brief\n\nMini To-Do via file upload.", "utf-8");
    await goScreen(l.page, /new job/i);
    await dismissTour(l.page);
    await l.page.getByRole("tab", { name: /upload/i }).first().click();
    await l.page.locator('input[type="file"]').first().setInputFiles(fixture);
    await l.page.getByText(/chars/i).first().waitFor({ timeout: 30_000 });
    const text = await l.page.evaluate(() => document.body.innerText);
    expect(text).toMatch(/crew-acc-upload-.*\.md/);
    await screenshot(l.page, "b-upload");
  }, 120_000);
});
