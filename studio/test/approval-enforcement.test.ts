/**
 * API-level test: a run cannot start without a recorded approval.
 *
 * Verifies the mission's section 3 requirement: "A run can never start
 * without a recorded approval (enforce this server-side, not just in the
 * UI)."
 *
 * This test starts the studio server against a temporary target dir, then
 * hits the launch endpoint in five scenarios:
 *   1. No approvalId at all        → 4xx, "Approval required…"
 *   2. Bogus approvalId            → 4xx, "No approval recorded…"
 *   3. Wrong workflowId            → 4xx, "Approval authorizes workflow X, not Y."
 *   4. Withdrawn approval          → 4xx, "Approval was withdrawn…"
 *   5. Valid, all sections confirmed → spawn proceeds (status running)
 *
 * The test is intentionally server-only; the UI is exercised by the
 * tour overlap test (tour-overlap.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const TARGET_DIR = mkdtempSync(join(tmpdir(), "crew-approval-"));
const PORT = 4701;

let serverProcess: ChildProcess | null = null;

async function waitUntilUp(port: number, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server on :${port} did not come up in ${timeoutMs}ms`);
}

beforeAll(async () => {
  mkdirSync(join(TARGET_DIR, "adws"), { recursive: true });
  mkdirSync(join(TARGET_DIR, "adws", "adw_sssf_config"), { recursive: true });
  mkdirSync(join(TARGET_DIR, "requests"), { recursive: true });
  mkdirSync(join(TARGET_DIR, "adws", "adw_data"), { recursive: true });

  writeFileSync(
    join(TARGET_DIR, "adws", "adw_sssf_config", "sssf.config.yaml"),
    `defaults:\n  coding_agent: pi\n  model: local/koboldcpp-default\n  thinking: off\n  tools: []\n  protected_files: []\n  data_dir: adws/adw_data\nobservability:\n  db: adws/adw_data/sssf.db\n  poll_ms: 500\nagents:\n  - name: planner\n    purpose: test\n    prompt_engineering:\n      system: x\n      user: y\n`,
  );
  writeFileSync(join(TARGET_DIR, ".env"), "");
  writeFileSync(join(TARGET_DIR, "adws", "adw_plan.py"), "# stub\n");
  writeFileSync(join(TARGET_DIR, "adws", "adw_simple_sdlc.py"), "# alternate workflow stub\n");
  writeFileSync(join(TARGET_DIR, ".gitignore"), ".sssf/\n.env\n");
  for (const args of [["init"], ["add", "."], ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "baseline"]]) {
    if (spawnSync("git", args, { cwd: TARGET_DIR, windowsHide: true }).status !== 0) throw new Error("Test Git setup failed");
  }

  serverProcess = spawn("bun", ["run", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TARGET_DIR: TARGET_DIR,
      STUDIO_PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout?.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProcess.stderr?.on("data", (d) => process.stderr.write(`[server!] ${d}`));

  await waitUntilUp(PORT);
}, 60_000);

afterAll(async () => {
  if (serverProcess) {
    try { serverProcess.kill("SIGTERM"); } catch {}
    serverProcess = null;
  }
  await new Promise((r) => setTimeout(r, 500));
});

async function postJson(path: string, body: any) {
  const res = await fetch(`http://localhost:${PORT}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

describe("server-side approval enforcement", () => {
  it("rejects a launch with no approvalId", async () => {
    const r = await postJson("/api/studio/launch", {
      workflowId: "adw_plan.py",
      promptMode: "approved-spec",
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(String(r.data?.error || "")).toMatch(/approval required/i);
  });

  it("rejects a launch with a bogus approvalId", async () => {
    const r = await postJson("/api/studio/launch", {
      workflowId: "adw_plan.py",
      promptMode: "approved-spec",
      approvalId: "appr-does-not-exist",
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(String(r.data?.error || "")).toMatch(/no approval recorded/i);
  });

  it("rejects a launch whose workflowId does not match the approval", async () => {
    const a = await postJson("/api/studio/approvals/create", {
      specMarkdown: "# T\n\n## Overview\nA test.\n",
      specTitle: "T",
      approvedBy: "dave",
      sections: [{ id: "sec-overview", name: "Overview" }],
      summary: { willHappen: "x", willUse: "x", willNotDo: "x", timeEstimate: "1m", costEstimate: "free", canUndo: "x", cannotUndo: "x" },
      workflowId: "adw_plan.py",
      workflowName: "Plan Only",
      promptPreview: "T",
    });
    expect(a.status).toBe(200);
    const approvalId = a.data.id;

    const r = await postJson("/api/studio/launch", {
      workflowId: "adw_simple_sdlc.py",
      promptMode: "approved-spec",
      approvalId,
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(String(r.data?.error || "")).toMatch(/authorizes workflow/i);
  });

  it("rejects a launch whose approval was withdrawn", async () => {
    const a = await postJson("/api/studio/approvals/create", {
      specMarkdown: "# T2\n\n## Overview\nA test 2.\n",
      specTitle: "T2",
      approvedBy: "dave",
      sections: [{ id: "sec-overview", name: "Overview" }],
      summary: { willHappen: "x", willUse: "x", willNotDo: "x", timeEstimate: "1m", costEstimate: "free", canUndo: "x", cannotUndo: "x" },
      workflowId: "adw_plan.py",
      workflowName: "Plan Only",
      promptPreview: "T2",
    });
    const approvalId = a.data.id;

    const w = await postJson(`/api/studio/approvals/${approvalId}/withdraw`, {});
    expect(w.data?.ok).toBe(true);

    const r = await postJson("/api/studio/launch", {
      workflowId: "adw_plan.py",
      promptMode: "approved-spec",
      approvalId,
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(String(r.data?.error || "")).toMatch(/withdrawn/i);
  });

  it("passes the gate when the approval is valid (run is spawned)", async () => {
    const a = await postJson("/api/studio/approvals/create", {
      specMarkdown: "# T3\n\n## Overview\nA test 3.\n",
      specTitle: "T3",
      approvedBy: "dave",
      sections: [{ id: "sec-overview", name: "Overview" }],
      summary: { willHappen: "x", willUse: "x", willNotDo: "x", timeEstimate: "1m", costEstimate: "free", canUndo: "x", cannotUndo: "x" },
      workflowId: "adw_plan.py",
      workflowName: "Plan Only",
      promptPreview: "T3",
    });
    const approvalId = a.data.id;

    const r = await postJson("/api/studio/launch", {
      workflowId: "adw_plan.py",
      promptMode: "approved-spec",
      approvalId,
      tokenCap: 1000,
    });
    expect(r.status).toBe(200);
    expect(r.data.runId).toBeTruthy();
    const logs = (r.data.logs || []).join("\n");
    expect(logs).toMatch(/Approval:/);
    expect(logs).toMatch(/Token cap/);
  });

  it("creates a new version when the same title is re-approved", async () => {
    const a1 = await postJson("/api/studio/approvals/create", {
      specMarkdown: "# V\n\n## Overview\nv1.\n",
      specTitle: "Versioned",
      approvedBy: "dave",
      sections: [{ id: "sec-overview", name: "Overview" }],
      summary: { willHappen: "x", willUse: "x", willNotDo: "x", timeEstimate: "1m", costEstimate: "free", canUndo: "x", cannotUndo: "x" },
      workflowId: "adw_plan.py",
      workflowName: "Plan Only",
      promptPreview: "V",
    });
    const a2 = await postJson("/api/studio/approvals/create", {
      specMarkdown: "# V\n\n## Overview\nv2 with edits.\n",
      specTitle: "Versioned",
      approvedBy: "dave",
      sections: [{ id: "sec-overview", name: "Overview" }],
      summary: { willHappen: "x", willUse: "x", willNotDo: "x", timeEstimate: "1m", costEstimate: "free", canUndo: "x", cannotUndo: "x" },
      workflowId: "adw_plan.py",
      workflowName: "Plan Only",
      promptPreview: "V",
    });
    expect(a1.data.specVersion).toBe(1);
    expect(a2.data.specVersion).toBe(2);
    expect(a1.data.specHash).not.toBe(a2.data.specHash);
  });
});
