import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ApprovalBook } from "../server/approvals";
import { ProfileStore } from "../server/profiles";
import { WORKFLOW_METADATA } from "../server/launcher";
import { WorkflowLauncher } from "../server/launcher";
import { parseArgv } from "../shared/command-argv";

const target = mkdtempSync(join(tmpdir(), "crew-rea-"));
const approvalInput = { specMarkdown: "# Goal\nTrace the legacy export", specTitle: "rea-probe", approvedBy: "test", sections: [{ id: "goal", name: "Goal" }], summary: { willHappen: "test", willUse: "stub", willNotDo: "calls", timeEstimate: "unknown", costEstimate: "none", canUndo: "yes", cannotBeUndone: "no" }, workflowId: "adw_simple_sdlc_rea.py", workflowName: "Investigate, Then Build", promptPreview: "test" } as any;

describe("REA workflow registration", () => {
  test("quality launch rejects missing required commands before any process starts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "crew-quality-preflight-"));
    mkdirSync(join(dir, "adws"), { recursive: true });
    writeFileSync(join(dir, "adws/adw_quality.py"), "# stub");
    writeFileSync(join(dir, ".crew-quality.json"), JSON.stringify({ test: ["node", "--test"] }));
    const book = new ApprovalBook(dir);
    const a = book.approve({ ...approvalInput, workflowId: "adw_quality.py" });
    await expect(new WorkflowLauncher(dir, book).launchWorkflow({ workflowId: "adw_quality.py", approvalId: a.id, promptMode: "approved-spec" })).rejects.toThrow("lint, typecheck, build");
  });
  test("project checks preserve Windows paths and exact saved argument lists", () => {
    expect(parseArgv('"C:\\Program Files\\node.exe" "D:\\my project\\check.js"')).toEqual(["C:\\Program Files\\node.exe", "D:\\my project\\check.js"]);
    const args = ["node", "path with spaces.js", 'a"b', "D:\\code\\test.js"];
    expect(parseArgv(JSON.stringify(args))).toEqual(args);
    expect(() => parseArgv('node "unfinished')).toThrow("Close the quote");
  });
  test("noncommitting investigation and SDLC have explicit catalog boundaries", () => {
    expect(WORKFLOW_METADATA["adw_rea_plan.py"].phases).toEqual(["request", "rea_collect", "rea", "plan"]);
    expect(WORKFLOW_METADATA["adw_verify_sdlc.py"].phases.some(p => p.startsWith("commit"))).toBe(false);
  });
  test("changes to execution code, prompts or checks invalidate approval", () => {
    for (const path of ["adws/adw_plan.py", "adws/adw_data/prompt_engineering/planner/system.md", ".crew-quality.json"]) {
      const dir = mkdtempSync(join(tmpdir(), "crew-input-hash-"));
      const full = join(dir, path);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, "before");
      const book = new ApprovalBook(dir);
      const a = book.approve(approvalInput);
      writeFileSync(full, "after");
      expect(() => book.assertApproved(a.id, a.workflowId)).toThrow("changed after approval");
    }
  });
  test("catalog exposes the investigate-first workflow with rea before plan", () => {
    const w = (WORKFLOW_METADATA as any)["adw_simple_sdlc_rea.py"];
    expect(w).toBeDefined();
    expect(w.requiredAgents).toContain("rea");
    expect(w.phases[0]).toBe("request");
    expect(w.phases[1]).toBe("rea_collect");
    expect(w.phases[2]).toBe("rea");
    expect(w.phases.indexOf("plan")).toBeGreaterThan(w.phases.indexOf("rea"));
  });

  test("approval binds the REA workflow id, not any other workflow", () => {
    const book = new ApprovalBook(target);
    const a = book.approve(approvalInput);
    expect(() => book.assertApproved(a.id, "adw_simple_sdlc_rea.py")).not.toThrow();
    expect(() => book.assertApproved(a.id, "adw_plan.py")).toThrow('not "adw_plan.py"');
  });

  test("approved investigation scope is persisted as the exact spec", () => {
    const dir = mkdtempSync(join(tmpdir(), "crew-rea-scope-"));
    const specMarkdown = '# Goal\nInvestigate\n```crew-rea\n{"question":"trace","target":"D:/synthetic","scope":"static inventory of named target","permitted_actions":"static-local"}\n```';
    const book = new ApprovalBook(dir);
    const a = book.approve({ ...approvalInput, specMarkdown });
    const reloaded = new ApprovalBook(dir).assertApproved(a.id, "adw_simple_sdlc_rea.py");
    expect(reloaded.specMarkdown).toBe(specMarkdown);
    expect(ApprovalBook.hashSpec(specMarkdown.replace("D:/synthetic", "D:/other"))).not.toBe(reloaded.specHash);
  });
});

describe("REA connection profile", () => {
  test("fresh stores seed a rea role with local and cloud variants", () => {
    const store = new ProfileStore(target);
    const roles = store.list().profiles.map(p => `${p.role}:${p.provider}`);
    expect(roles).toContain("rea:local");
    expect(roles).toContain("rea:cloud");
  });

  test("existing profiles gain rea without touching saved connections", () => {
    const dir = mkdtempSync(join(tmpdir(), "crew-rea-merge-"));
    const first = new ProfileStore(dir);
    first.upsert({ ...first.list().profiles.find(p => p.role === "planner")!, apiKey: "keep-me", model: "auto" } as any);
    const before = first.list().profiles.filter(p => p.role !== "rea").map(p => `${p.role}:${p.provider}:${p.apiKey}`);
    const second = new ProfileStore(dir);
    const after = second.list().profiles;
    expect(after.some(p => p.role === "rea" && p.provider === "local")).toBe(true);
    for (const key of before) {
      const [role, provider, apiKey] = key.split(":");
      expect(after.find(p => p.role === role && p.provider === provider)?.apiKey).toBe(apiKey);
    }
  });
});
