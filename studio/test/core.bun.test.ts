import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ApprovalBook } from "../server/approvals";
import { ProfileStore } from "../server/profiles";
import { prepareRuntime } from "../server/runtime";
import { DiscoveryEngine } from "../server/discovery";
import { WorkflowLauncher } from "../server/launcher";
import { ConfigManager } from "../server/config";
import { ProjectManager } from "../server/project";
import { Database } from "bun:sqlite";

const target = mkdtempSync(join(tmpdir(), "crew-core-"));
const second = mkdtempSync(join(tmpdir(), "crew-second-"));
const approvalInput = { specMarkdown: "# Goal\nA test", specTitle: "test", approvedBy: "test", sections: [{ id: "goal", name: "Goal" }], summary: { willHappen: "test", willUse: "stub", willNotDo: "calls", timeEstimate: "unknown", costEstimate: "none", canUndo: "yes", cannotUndo: "none" }, workflowId: "adw_plan.py", workflowName: "Plan", promptPreview: "test" };

describe("case and credential isolation", () => {
  test("changing execution settings requires renewed approval", () => {
    const book = new ApprovalBook(target);
    const a = book.approve(approvalInput);
    const store = new ProfileStore(target);
    store.setDefaultTokenCap(12345);
    expect(() => book.assertApproved(a.id, a.workflowId)).toThrow("changed after approval");
  });
  test("approvals cannot authorize another project", () => {
    const book = new ApprovalBook(target);
    const a = book.approve(approvalInput);
    book.setTargetDir(second);
    expect(() => book.assertApproved(a.id, a.workflowId)).toThrow("No approval");
  });
  test("withdrawal and unconfirmed sections block execution", () => {
    const book = new ApprovalBook(target);
    const a = book.approve(approvalInput);
    book.setSection(a.id, "goal", false);
    expect(() => book.assertApproved(a.id, a.workflowId)).toThrow("not confirmed");
    book.withdraw(a.id);
    expect(() => book.assertApproved(a.id, a.workflowId)).toThrow("withdrawn");
  });
  test("saved keys stay server-side and masked saves preserve them", () => {
    const store = new ProfileStore(target);
    const profile = { ...store.list().profiles[0], apiKey: "test-secret-not-real", model: "auto" };
    store.upsert(profile);
    expect(store.publicList().profiles[0].apiKey).toBe("••••••••");
    store.upsert({ ...profile, apiKey: "••••••••" });
    expect(store.connectionKey({ ...profile, apiKey: "••••••••" })).toBe("test-secret-not-real");
    store.setTargetDir(second);
    expect(store.list().profiles[0].apiKey).toBe("none");
  });
  test("runtime uses the router and auto without putting keys in files", () => {
    mkdirSync(join(target, "adws/adw_sssf_config"), { recursive: true });
    writeFileSync(join(target, "adws/adw_sssf_config/sssf.config.yaml"), "defaults:\n  model: example/model\nagents:\n  - name: planner\n    purpose: test\n    prompt_engineering: {system: x, user: y}\n");
    const store = new ProfileStore(target);
    const runtime = prepareRuntime(target, "runtime-test", store.list(), "adws/adw_sssf_config/sssf.config.yaml");
    const registry = readFileSync(runtime.env.PI_MODELS_PATH, "utf8");
    expect(registry).toContain('"auto"');
    expect(registry).not.toContain("test-secret-not-real");
    expect(runtime.env.CREW_KEY_PLANNER).toBe("test-secret-not-real");
  });
  test("named rosters restore their saved model connections", () => {
    const store = new ProfileStore(target);
    const original = { ...store.list().profiles[0], model: "auto" };
    store.upsert(original);
    const config = new ConfigManager(target);
    config.saveNamedRoster("Router roster", config.loadConfig().config);
    store.upsert({ ...original, model: "different-model" });
    config.applyRosterPreset("router_roster");
    expect(new ProfileStore(target).list().profiles[0].model).toBe("auto");
  });
  test("new app projects inherit profiles and start with clean Git history", () => {
    const manager = new ProjectManager(target, target);
    const info = manager.createProject("isolated-app");
    expect(info.path).not.toBe(target);
    expect(new ProfileStore(info.path).list().profiles[0].model).toBe("auto");
    expect(Bun.spawnSync(["git", "status", "--porcelain"], { cwd: info.path }).stdout.toString().trim()).toBe("");
    expect(() => manager.createProject("../escape")).toThrow();
  });
});

test("real interview transport preserves auto, readiness, and saved progress", async () => {
  let model = "";
  const mock = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    model = (await req.json() as any).model;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ title: "Demo", reply: "Here is the summary.", ready: true, questions: [], specMarkdown: "# Demo\n\n## Goal\nBuild a demo.\n\n## Requirements\nOne button.\n\n## Acceptance Criteria\nThe button works.\n\n## Boundaries\nNo publishing." }) } }] });
  } });
  try {
    const store = new ProfileStore(second);
    store.upsert({ ...store.list().profiles.find(p => p.role === "interviewer")!, baseUrl: `http://127.0.0.1:${mock.port}/v1`, model: "auto" });
    const engine = new DiscoveryEngine(second);
    const state = await engine.analyzeDescription("Create a demo with one button.");
    expect(model).toBe("auto");
    expect(state.ready).toBe(true);
    expect(new DiscoveryEngine(second).getCurrentSession().title).toBe("Demo");
    engine.updateSpecMarkdown("Changed goal");
    expect(engine.getCurrentSession().ready).toBe(false);
  } finally { mock.stop(true); }
});

describe("HTTP boundary", () => {
  let proc: ReturnType<typeof Bun.spawn>;
  const port = 4736;
  beforeAll(async () => {
    proc = Bun.spawn([process.execPath, "run", "server/index.ts"], { cwd: resolve(import.meta.dir, ".."), env: { ...process.env, TARGET_DIR: target, STUDIO_PORT: String(port) }, stdout: "ignore", stderr: "ignore" });
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {}
      await Bun.sleep(100);
    }
    throw new Error("Test server did not start");
  });
  afterAll(() => proc?.kill());
  test("cross-origin API access is rejected", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/studio/profiles`, { headers: { origin: "https://untrusted.example" } });
    expect(res.status).toBe(403);
  });
  test("settings API does not disclose keys", async () => {
    const text = await (await fetch(`http://127.0.0.1:${port}/api/studio/profiles`)).text();
    expect(text).not.toContain("test-secret-not-real");
  });
  test("launch cannot escape the workflow directory", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/studio/launch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workflowId: "../../unsafe.py" }) });
    expect(res.ok).toBe(false);
  });
});

test("Stop terminates a workflow and its child while preserving stopped status", async () => {
  if (process.platform !== "win32") return;
  const dir = mkdtempSync(join(tmpdir(), "crew-stop-"));
  mkdirSync(join(dir, "adws/adw_sssf_config"), { recursive: true });
  mkdirSync(join(dir, "adws/adw_data"), { recursive: true });
  writeFileSync(join(dir, "adws/adw_sssf_config/sssf.config.yaml"), "defaults: {model: example/model}\nagents:\n  - name: planner\n    purpose: stub\n    prompt_engineering: {system: x, user: y}\n");
  writeFileSync(join(dir, "adws/adw_plan.py"), "import subprocess, sys, time\nfrom pathlib import Path\np = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\nPath('.sssf/child.pid').write_text(str(p.pid))\ntime.sleep(60)\n");
  writeFileSync(join(dir, ".gitignore"), ".sssf/\n*.db*\n");
  for (const args of [["init"], ["add", "."], ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "baseline"]]) {
    if (Bun.spawnSync(["git", ...args], { cwd: dir, stdout: "ignore", stderr: "ignore" }).exitCode !== 0) throw new Error("Test Git setup failed");
  }
  const book = new ApprovalBook(dir);
  const a = book.approve(approvalInput);
  const launcher = new WorkflowLauncher(dir, book);
  const db = new Database(join(dir, "adws/adw_data/sssf.db"));
  db.exec("CREATE TABLE sessions(adw_id TEXT,status TEXT,ended_at TEXT,total_tokens INTEGER); CREATE TABLE phases(adw_id TEXT,status TEXT,ended_at TEXT,error TEXT); CREATE TABLE processes(adw_id TEXT,ended_at TEXT); CREATE TABLE events(adw_id TEXT,type TEXT,tokens INTEGER); INSERT INTO sessions VALUES('aaaa1234','running',NULL,0); INSERT INTO phases VALUES('aaaa1234','running',NULL,NULL); INSERT INTO processes VALUES('aaaa1234',NULL);");
  const run = await launcher.launchWorkflow({ workflowId: "adw_plan.py", promptMode: "approved-spec", approvalId: a.id, tokenCap: 1000, adwId: "aaaa1234" });
  let childPid = 0;
  try {
    for (let i = 0; i < 100; i++) {
      try { childPid = Number(readFileSync(join(dir, ".sssf/child.pid"), "utf8")); if (childPid) break; } catch {}
      await Bun.sleep(100);
    }
    expect(childPid).toBeGreaterThan(0);
    expect(() => launcher.pauseRun(run.runId)).toThrow("not available");
    expect(run.status).toBe("running");
    launcher.stopRun(run.runId);
    await Bun.sleep(300);
    expect(run.status).toBe("stopped");
    expect(() => process.kill(childPid, 0)).toThrow();
    expect((db.query("SELECT status FROM sessions").get() as any).status).toBe("fail");
    expect((db.query("SELECT ended_at FROM processes").get() as any).ended_at).not.toBeNull();
  } finally { if (run.status === "running") launcher.stopRun(run.runId); db.close(); }
}, 20000);
