// Test H — installed build identity: the backend and the UI report the same
// version as the source tree the installer was built from. Port 4639.
// This is the Tripwire that would have caught "old build still installed".
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  acceptanceEnabled,
  launchPackaged,
  closeLaunched,
  dumpFailure,
  screenshot,
  goScreen,
  api,
  STUDIO_ROOT,
  type Launched,
} from "./helpers";

const run = acceptanceEnabled() ? describe : describe.skip;

run("acceptance H — installed build identity", () => {
  let l: Launched;
  const name = "h-version";

  beforeAll(async () => {
    l = await launchPackaged(4639);
  }, 180_000);

  afterAll(async () => {
    if (l!) await closeLaunched(l);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && l!) {
      await dumpFailure(name, l);
    }
  });

  it("backend reports the source-tree version", async () => {
    const pkg = JSON.parse(readFileSync(join(STUDIO_ROOT, "package.json"), "utf-8")) as { version: string };
    const v = await api<{ name: string; version: string }>(l.port, "/api/version");
    expect(v.name).toContain("C.R.E.W.");
    expect(v.version).toBe(pkg.version);
  });

  it("the UI shows the installed build", async () => {
    await goScreen(l.page, /help/i);
    await l.page.getByText(/installed build/i).first().waitFor({ timeout: 30_000 });
    const text = await l.page.evaluate(() => document.body.innerText);
    const pkg = JSON.parse(readFileSync(join(STUDIO_ROOT, "package.json"), "utf-8")) as { version: string };
    expect(text).toContain(pkg.version);
    await screenshot(l.page, "h-version");
  });
});
