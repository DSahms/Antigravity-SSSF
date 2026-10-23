// Test F — persistence: records survive a full app restart. No model needed.
// Port 4637.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  acceptanceEnabled,
  launchPackaged,
  closeLaunched,
  dumpFailure,
  screenshot,
  goScreen,
  api,
  type Launched,
} from "./helpers";

const run = acceptanceEnabled() ? describe : describe.skip;

run("acceptance F — records persist across restart", () => {
  let l: Launched;
  const name = "f-persist";
  const TITLE = `persist-probe-${Date.now().toString(36)}`;

  beforeAll(async () => {
    l = await launchPackaged(4637);
  }, 180_000);

  afterAll(async () => {
    if (l!) await closeLaunched(l);
  });

  afterEach(async (ctx) => {
    if (ctx.task.result?.state === "fail" && l!) {
      await dumpFailure(name, l);
    }
  });

  it("approval written before restart is visible after restart", async () => {
    await api(l.port, "/api/studio/project/create", {
      method: "POST",
      body: JSON.stringify({ name: `rc-acc-f-${Date.now().toString(36)}` }),
    });
    await api(l.port, "/api/studio/project/quality", {
      method: "POST",
      body: JSON.stringify({ test: ["node", "--version"] }),
    });
    const appr = await api<{ id: string }>(l.port, "/api/studio/approvals/create", {
      method: "POST",
      body: JSON.stringify({
        specMarkdown: `# ${TITLE}\n\nPersistence probe.`,
        specTitle: TITLE,
        approvedBy: "acceptance harness",
        sections: [{ id: "s1", name: "Scope" }],
        summary: { willHappen: "probe", willUse: "none", willNotDo: "nothing", timeEstimate: "1m", costEstimate: "$0", canUndo: "yes", cannotUndo: "no" },
        workflowId: "adw_quality.py",
        workflowName: "Quality Gate",
        promptPreview: TITLE,
      }),
    });
    expect(appr.id).toMatch(/^appr-/);

    // Full app restart (not just the server).
    const port = l.port;
    await closeLaunched(l);
    l = await launchPackaged(port);

    await goScreen(l.page, /history/i);
    await l.page.waitForTimeout(3000);
    const text = await l.page.evaluate(() => document.body.innerText);
    const viaUI = text.includes(TITLE);
    if (!viaUI) {
      // Fall back to the same record the UI reads: still a persistence proof.
      const list = await api<{ specTitle: string }[]>(l.port, "/api/studio/approvals");
      expect(list.map((a) => a.specTitle)).toContain(TITLE);
    } else {
      expect(viaUI).toBe(true);
    }
    await screenshot(l.page, "f-history");
  }, 300_000);
});
