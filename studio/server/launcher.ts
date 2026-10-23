/**
 * ADW Workflow Catalog & Process Execution Manager for SSSF Studio.
 *
 * Enforces server-side approval (no run starts without a recorded,
 * non-withdrawn approval). Adds Pause/Resume and a per-job token guard
 * that stops the run with a calm plain-language message at a cap.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Database } from "bun:sqlite";
import type {
  AdwWorkflowInfo,
  ApprovalRecordV2,
  LaunchRequest,
  LiveRunState,
} from "../shared/types.ts";
import { ApprovalBook } from "./approvals.ts";
import { ProfileStore } from "./profiles.ts";
import { prepareRuntime } from "./runtime.ts";

const QUALITY_WORKFLOWS = new Set([
  "adw_simple_sdlc.py",
  "adw_simple_sdlc_rea.py",
  "adw_verify_sdlc.py",
  "adw_plan_build_test_quality.py",
  "adw_plan_build_test.py",
  "adw_build_test.py",
  "adw_quality.py",
]);

const WORKFLOW_METADATA: Record<
  string,
  {
    name: string;
    description: string;
    phases: string[];
    requiredAgents: string[];
    recommendedWhen: string;
    badge?: string;
  }
> = {
  "adw_rea_plan.py": {
    name: "Investigate & Plan Only",
    description: "Collect real static REA evidence, interpret it, and write a plan. No build or commits.",
    phases: ["request", "rea_collect", "rea", "plan"],
    requiredAgents: ["rea", "planner"],
    recommendedWhen: "Verify an approved investigation and its plan before authorizing a build.",
  },
  "adw_verify_sdlc.py": {
    name: "Build, Verify & Document Without Commits",
    description: "Plan, build, test, review and document in an isolated project. Leaves all outputs uncommitted.",
    phases: ["request", "plan", "build", "test", "review", "changes", "document"],
    requiredAgents: ["planner", "builder", "reviewer", "documenter"],
    recommendedWhen: "Acceptance verification where the operator must review outputs before any commit.",
  },
  "adw_simple_sdlc.py": {
    name: "Build, Check, Review & Document",
    description: "The complete pipeline: plan → build → test → review → document, landing 3 agent commits.",
    phases: ["request", "plan", "commit_plan", "build", "test", "review", "document", "commit_docs"],
    requiredAgents: ["planner", "builder", "reviewer", "documenter"],
    recommendedWhen: "When building real features from an approved specification. Expect a long, token-heavy run.",
    badge: "Full build",
  },
  "adw_simple_sdlc_rea.py": {
    name: "Investigate, Then Build",
    description: "REA investigates existing software first (evidence-backed handoff), then the full pipeline: plan → build → test → review → document.",
    phases: ["request", "rea_collect", "rea", "plan", "commit_plan", "build", "test", "review", "document", "commit_docs"],
    requiredAgents: ["rea", "planner", "builder", "reviewer", "documenter"],
    recommendedWhen: "When the job depends on understanding existing software, tracing a feature, or migrating legacy behavior. Reads only — REA changes nothing.",
    badge: "Investigate first",
  },
  "adw_build.py": {
    name: "Build Once",
    description: "Single builder pass against the approved spec. Leaves changes uncommitted for hand review.",
    phases: ["request", "build"],
    requiredAgents: ["builder"],
    recommendedWhen: "Tiny changes where the author will verify by hand.",
  },
  "adw_plan_build_test_quality.py": {
    name: "Plan, Build, Test & Quality Gate",
    description: "Agent chain plus deterministic checks: plan → build → bounded verify/fix loops → commit.",
    phases: ["request", "plan", "build", "verify", "fix", "commit"],
    requiredAgents: ["planner", "builder"],
    recommendedWhen: "Real features that must pass the project's own test, lint, typecheck, and build commands.",
    badge: "Thorough",
  },
  "adw_plan_build_test.py": {
    name: "Plan, Build & Test",
    description: "Standard engineering cycle: architectural plan, builder implementation, deterministic tests, and git commit.",
    phases: ["request", "plan", "commit_plan", "build", "test", "commit_build"],
    requiredAgents: ["planner", "builder"],
    recommendedWhen: "When review and docs are not needed immediately.",
    badge: "Popular",
  },
  "adw_plan_build.py": {
    name: "Plan & Build",
    description: "Fast iteration: planner designs the change, builder implements, then commits.",
    phases: ["request", "plan", "commit_plan", "build", "commit_build"],
    requiredAgents: ["planner", "builder"],
    recommendedWhen: "Small, well-understood tasks with no automated suite.",
  },
  "adw_build_test.py": {
    name: "Build & Test Loop",
    description: "Builder executes against a test suite with bounded automated fix loops.",
    phases: ["request", "build", "test", "commit_build"],
    requiredAgents: ["builder"],
    recommendedWhen: "When an existing plan or suite is already in place.",
  },
  "adw_build_review.py": {
    name: "Build & Review Loop",
    description: "Builder implements and reviewer validates against requirements with bounded revise loop.",
    phases: ["request", "build", "review", "commit_build"],
    requiredAgents: ["builder", "reviewer"],
    recommendedWhen: "When alignment with specifications is paramount.",
  },
  "adw_plan.py": {
    name: "Plan Only",
    description: "Writes a plan under specs without building the app.",
    phases: ["request", "plan"],
    requiredAgents: ["planner"],
    recommendedWhen: "First run: verify the interview, approval, trace, and deliverables without a long build.",
    badge: "Recommended",
  },
  "adw_scout.py": {
    name: "Scout Recon",
    description: "Search-heavy read-only exploration of repository layout and references.",
    phases: ["request", "scout"],
    requiredAgents: ["scout"],
    recommendedWhen: "Reconnaissance without risking repo changes.",
  },
  "adw_prompt.py": {
    name: "Single Agent Prompt",
    description: "Executes a single prompt directly against any chosen roster agent.",
    phases: ["request", "agent_run"],
    requiredAgents: ["scout", "planner", "builder", "reviewer", "documenter"],
    recommendedWhen: "Ad-hoc single agent queries or quick verification.",
  },
  "adw_quality.py": {
    name: "Quality Gate",
    description: "Deterministic test, lint, typecheck, and build execution with zero agent calls.",
    phases: ["request", "quality"],
    requiredAgents: [],
    recommendedWhen: "Verifying current test and build health.",
  },
  "adw_document.py": {
    name: "Document Diff",
    description: "Reads the current uncommitted git diff and updates developer/user documentation.",
    phases: ["request", "diff", "document", "commit_docs"],
    requiredAgents: ["documenter"],
    recommendedWhen: "Writing up shipped changes.",
  },
};

export class WorkflowLauncher {
  private targetDir: string;
  private book: ApprovalBook;
  private activeRuns: Map<string, LiveRunState> = new Map();
  private childProcesses: Map<string, any> = new Map();
  private listeners: Map<string, Set<(line: string) => void>> = new Map();

  constructor(targetDir: string, book: ApprovalBook) {
    this.targetDir = targetDir;
    this.book = book;
    this.loadHistory();
  }

  setTargetDir(dir: string): void {
    if (Array.from(this.activeRuns.values()).some(r => r.status === "running" || r.status === "paused")) {
      throw new Error("Stop the current job before switching projects.");
    }
    this.activeRuns.clear();
    this.targetDir = dir;
    this.loadHistory();
  }

  private loadHistory(): void {
    this.reconcileInterruptedRuns();
    try {
      const history = JSON.parse(readFileSync(join(this.targetDir, "adws/adw_data/studio_history.json"), "utf8"));
      for (const saved of history.runs ?? []) {
        if (!["success", "fail", "stopped"].includes(saved.status) || this.activeRuns.has(saved.runId)) continue;
        this.activeRuns.set(saved.runId, {
          ...saved,
          workflowName: WORKFLOW_METADATA[saved.workflowId]?.name ?? saved.workflowId,
          // Keep a bounded tail so Results/Run still have context after a restart.
          logs: Array.isArray(saved.logs) ? saved.logs.slice(-400) : [],
        });
      }
    } catch {}
  }

  /** Mark runs that died with the server as failed, so nothing shows
   * "running" forever. A session left in `running` with no live child process
   * may also belong to a standalone engine or another server. Check its
   * recorded engine PID before changing its state; never stop that process.
   * Open phases/processes close with the reason recorded. */
  private reconcileInterruptedRuns(): void {
    const dbPath = join(this.targetDir, "adws", "adw_data", "sssf.db");
    if (!existsSync(dbPath)) return;
    let db: Database | undefined;
    try {
      db = new Database(dbPath);
      db.exec("PRAGMA busy_timeout=5000");
      const endedAt = new Date().toISOString();
      const reason = "server restarted while this run was active; no live process";
      db.transaction(() => {
        const pending = db!.query("SELECT adw_id FROM sessions WHERE status='running'").all() as {adw_id: string}[];
        for (const { adw_id } of pending) {
          const engine = db!.query("SELECT pid FROM processes WHERE adw_id=? AND kind='adw' AND ended_at IS NULL ORDER BY id DESC LIMIT 1").get(adw_id) as {pid: number} | null;
          if (engine?.pid) {
            try { process.kill(engine.pid, 0); continue; } catch (error: any) {
              // Access denied cannot establish death. Preserve ambiguous state.
              if (error?.code !== "ESRCH") continue;
            }
          }
          db!.query("UPDATE sessions SET status='fail', ended_at=? WHERE adw_id=?").run(endedAt, adw_id);
          db!.query("UPDATE phases SET status='fail', ended_at=?, error=? WHERE adw_id=? AND ended_at IS NULL AND status='running'").run(endedAt, reason, adw_id);
          db!.query("UPDATE processes SET ended_at=? WHERE adw_id=? AND ended_at IS NULL").run(endedAt, adw_id);
        }
      })();
    } catch {
      // A locked or missing trace db must never block startup.
    } finally {
      db?.close();
    }
  }

  setApprovalBook(book: ApprovalBook) {
    this.book = book;
  }

  listWorkflows(): AdwWorkflowInfo[] {
    const adwsDir = join(this.targetDir, "adws");
    const results: AdwWorkflowInfo[] = [];

    if (!existsSync(adwsDir)) return [];

    try {
      const files = readdirSync(adwsDir);
      for (const file of files) {
        if (file.startsWith("adw_") && file.endsWith(".py")) {
          const meta = WORKFLOW_METADATA[file] || {
            name: file.replace(/^adw_|\.py$/g, "").replace(/_/g, " ").toUpperCase(),
            description: "SSSF workflow script",
            phases: ["request"],
            requiredAgents: [],
            recommendedWhen: "Custom factory workflow",
          };

          results.push({
            id: file,
            scriptFile: file,
            ...meta,
          });
        }
      }
    } catch {}

    results.sort((a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0));
    return results;
  }

  getActiveRuns(): LiveRunState[] {
    return Array.from(this.activeRuns.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  getRunState(runId: string): LiveRunState | null {
    return this.activeRuns.get(runId) ?? null;
  }

  async launchWorkflow(req: LaunchRequest & { approvalId?: string; tokenCap?: number }): Promise<LiveRunState> {
    if (!this.listWorkflows().some(w => w.id === req.workflowId)) throw new Error("Choose an available workflow.");
    if (req.configPath && req.configPath !== "adws/adw_sssf_config/sssf.config.yaml") throw new Error("Use the roster that was reviewed and approved.");
    if (req.adwId && !/^[a-f0-9]{8}$/.test(req.adwId)) throw new Error("Invalid session ID.");
    if (Array.from(this.activeRuns.values()).some(r => r.status === "running" || r.status === "paused")) throw new Error("A job is already running in this project.");
    // ── Hard gate: server-side approval enforcement ────────────────────
    if (!req.approvalId) {
      throw new Error("Approval required: no run can start without a recorded approval.");
    }
    const approval: ApprovalRecordV2 = this.book.assertApproved(req.approvalId, req.workflowId);
    if (QUALITY_WORKFLOWS.has(req.workflowId) && !existsSync(join(this.targetDir, ".crew-quality.json"))) {
      throw new Error("This workflow runs deterministic checks, but this project has no .crew-quality.json. Open Settings → Project checks, add the real test/lint/typecheck/build commands, then run again.");
    }
    if (QUALITY_WORKFLOWS.has(req.workflowId)) {
      let checks: any;
      try { checks = JSON.parse(readFileSync(join(this.targetDir, ".crew-quality.json"), "utf8")); }
      catch { throw new Error("Project checks are not valid JSON. Open Settings → Project checks and save valid commands."); }
      const requiredChecks = ["adw_quality.py", "adw_plan_build_test_quality.py", "adw_verify_sdlc.py"].includes(req.workflowId) ? ["test", "lint", "typecheck", "build"] : ["test"];
      const missing = requiredChecks.filter(key => !Array.isArray(checks?.[key]) || !checks[key].length || !checks[key].every((arg: unknown) => typeof arg === "string" && arg.trim()));
      if (missing.length) throw new Error(`Configure real ${missing.join(", ")} commands in Settings → Project checks before running this workflow.`);
    }
    const gitStatus = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: this.targetDir });
    if (gitStatus.exitCode !== 0) throw new Error("Choose a prepared app project with Git history.");
    // Product-managed files are not user work: the checks file written by
    // Settings → Project checks and the runtime approval copies this launcher
    // materializes must never block a launch (or no project with saved checks
    // could ever start an agent workflow).
    const dirty = gitStatus.stdout.toString().split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const path = line.slice(2).trim().replace(/^"(.*)"$/, "$1");
        const arrow = path.indexOf(" -> ");
        return arrow >= 0 ? path.slice(arrow + 4) : path;
      })
      .filter((f) => f !== ".crew-quality.json" && !f.startsWith(".sssf/approved-specs/"));
    if (!["adw_scout.py", "adw_quality.py", "adw_rea_plan.py", "adw_verify_sdlc.py"].includes(req.workflowId) && dirty.length) throw new Error("This project has uncommitted work. Review and save it before starting agents, or create a separate app project.");
    // ───────────────────────────────────────────────────────────────────

    const scriptPath = join("adws", req.workflowId);
    // Materialize the approved spec as a runtime file in requests/ so the
    // Python factory reads the exact approved text. (Approved-spec mode
    // already points at a file; for the approval-gated path we always use
    // the approved text the user signed off on.)
    const runtimeSpecPath = await this.materializeApprovedSpec(approval);

    const runId = "run-" + randomUUID();
    const runTarget = this.targetDir;
    const configPath = req.configPath || "adws/adw_sssf_config/sssf.config.yaml";
    const meta = WORKFLOW_METADATA[req.workflowId] || { name: req.workflowId };
    const tokenCap = req.tokenCap ?? new ProfileStore(this.targetDir).list().defaultTokenCap;
    if (!Number.isSafeInteger(tokenCap) || tokenCap <= 0) throw new Error("Set a positive whole-number token cap before running.");
    const runtime = prepareRuntime(this.targetDir, runId, new ProfileStore(this.targetDir).list(), configPath);
    const runtimeConfig = new (await import("./config.ts")).ConfigManager(this.targetDir).loadConfig().config;
    const required = WORKFLOW_METADATA[req.workflowId]?.requiredAgents ?? [];
    if (req.workflowId !== "adw_prompt.py") {
      const missing = required.filter(name => !runtimeConfig.agents.some(a => a.name === name));
      if (missing.length) throw new Error(`This workflow requires these roster roles: ${missing.join(", ")}. Choose a compatible workflow or roster.`);
    }

    const liveRun: LiveRunState = {
      runId,
      adwId: req.adwId || randomUUID().replaceAll("-", "").slice(0, 8),
      workflowId: req.workflowId,
      workflowName: meta.name,
      status: "running",
      startedAt: new Date().toISOString(),
      promptPreview: approval.promptPreview,
      logs: [
        `[crew] Launching ${req.workflowId}...`,
        `[crew] Target Directory: ${this.targetDir}`,
        `[crew] Config: ${configPath}`,
        `[crew] Approval: ${approval.id} (v${approval.specVersion}) by ${approval.approvedBy}`,
        `[crew] Token cap for this run: ${tokenCap.toLocaleString()}`,
        `[crew] Prompt (approved spec, ${runtimeSpecPath.split("/").pop()}):`,
        `------------------------------------------------------------`,
      ],
      approvalId: approval.id,
      tokenCap,
      tokenUsage: 0,
    };

    this.activeRuns.set(runId, liveRun);

    const args = ["uv", "run", scriptPath, "--config", runtime.configPath];
    args.push("--adw-id", liveRun.adwId);
    args.push(runtimeSpecPath);

    try {
      const proc = Bun.spawn(args, {
        cwd: this.targetDir,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
          ...runtime.env,
          CREW_TOKEN_CAP: String(tokenCap),
        },
        stdout: "pipe",
        stderr: "pipe",
        detached: process.platform !== "win32",
      });

      liveRun.pid = proc.pid;
      this.childProcesses.set(runId, proc);

      this.streamOutput(runId, proc.stdout, false);
      this.streamOutput(runId, proc.stderr, true);
      const dbPath = join(runTarget, "adws", "adw_data", "sssf.db");
      const usageTimer = setInterval(() => {
        if (!existsSync(dbPath) || liveRun.status === "stopped") return;
        const total = this.readTokenUsage(dbPath, liveRun.adwId);
        if (total != null) {
          liveRun.tokenUsage = Math.max(liveRun.tokenUsage ?? 0, total);
          this.checkTokenCap(runId, liveRun);
        }
      }, 500);

      proc.exited.then((code) => {
        clearInterval(usageTimer);
        // The last usage event can land after the final stdout line, so read the
        // trace once more before recording the result.
        const total = this.readTokenUsage(dbPath, liveRun.adwId);
        if (total != null) liveRun.tokenUsage = Math.max(liveRun.tokenUsage ?? 0, total);
        liveRun.exitCode = code;
        if (liveRun.status !== "stopped") liveRun.status = code === 0 ? "success" : "fail";
        if (liveRun.status === "fail" && (liveRun.tokenCap ?? 0) > 0 && (liveRun.tokenUsage ?? 0) >= (liveRun.tokenCap ?? 0)) {
          liveRun.stopReason = "token-cap";
        }
        liveRun.endedAt = new Date().toISOString();
        const finishMsg = `[crew] Workflow finished with exit code ${code} (${liveRun.status})`;
        liveRun.logs.push(finishMsg);
        this.emitLog(runId, finishMsg);
        this.childProcesses.delete(runId);
        this.saveRunHistory(liveRun);
      });

      return liveRun;
    } catch (err: any) {
      liveRun.status = "fail";
      liveRun.endedAt = new Date().toISOString();
      const errMsg = `[crew] Failed to spawn process: ${err.message}`;
      liveRun.logs.push(errMsg);
      this.saveRunHistory(liveRun);
      return liveRun;
    }
  }

  private async materializeApprovedSpec(approval: ApprovalRecordV2): Promise<string> {
    const requestsDir = join(this.targetDir, ".sssf", "approved-specs");
    if (!existsSync(requestsDir)) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(requestsDir, { recursive: true });
    }
    const fileName = `approved-v${approval.specVersion}-${approval.id}.md`;
    const filePath = join(requestsDir, fileName);
    const header = `<!-- CREW APPROVED SPECIFICATION (runtime copy) -->
<!-- Approval ID: ${approval.id} -->
<!-- Version: ${approval.specVersion} -->
<!-- Approved By: ${approval.approvedBy} -->
<!-- Approved At: ${approval.approvedAt} -->
<!-- Hash: ${approval.specHash} -->

`;
    writeFileSync(filePath, header + approval.specMarkdown, "utf-8");
    return filePath;
  }

  private async streamOutput(
    runId: string,
    stream: ReadableStream,
    isErr: boolean,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let partialLine = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = (partialLine + chunk).split(/\r?\n/);
        partialLine = lines.pop() ?? "";

        for (const line of lines) {
          if (!line) continue;
          const liveRun = this.activeRuns.get(runId);
          if (liveRun) {
            // Parse adw_id
            const idMatch = line.match(/adw_id:\s+([a-f0-9]{8})/i);
            if (idMatch && idMatch[1]) liveRun.adwId = idMatch[1];

            // Parse phase
            const phaseMatch = line.match(/[▶►]\s+(\d+)\s+([a-zA-Z0-9_-]+)/);
            if (phaseMatch && phaseMatch[2]) liveRun.currentPhase = phaseMatch[2];

            // Parse tokens (cumulative) — matches SSSF's usage lines like
            // "tokens: 1234" or "total_tokens: 1234" or "usage.total_tokens: 1234"
            const tokMatch = line.match(/(?:total_tokens|tokens|total)\s*[:=]\s*([\d,]+)/i);
            if (tokMatch && tokMatch[1]) {
              const n = parseInt(tokMatch[1].replaceAll(",", ""), 10);
              if (Number.isFinite(n) && n > (liveRun.tokenUsage ?? 0)) {
                liveRun.tokenUsage = n;
                this.checkTokenCap(runId, liveRun);
              }
            }

            liveRun.logs.push(line);
            this.emitLog(runId, line);
          }
        }
      }

      if (partialLine) {
        const liveRun = this.activeRuns.get(runId);
        if (liveRun) {
          liveRun.logs.push(partialLine);
          this.emitLog(runId, partialLine);
        }
      }
    } catch {}
  }

  private readTokenUsage(dbPath: string, adwId: string): number | null {
    if (!existsSync(dbPath)) return null;
    let db: Database | undefined;
    try {
      db = new Database(dbPath, { readonly: true });
      const row = db.query("SELECT COALESCE(SUM(tokens), 0) AS total_tokens FROM events WHERE adw_id = ? AND type = 'usage'").get(adwId) as { total_tokens: number } | null;
      return row?.total_tokens ?? null;
    } catch {
      return null;
    } finally {
      db?.close();
    }
  }

  private checkTokenCap(runId: string, liveRun: LiveRunState) {
    const cap = liveRun.tokenCap ?? 0;
    if (cap <= 0) return;
    const used = liveRun.tokenUsage ?? 0;
    if (used >= cap) {
      const msg = `[crew] Token cap reached (${used.toLocaleString()} / ${cap.toLocaleString()}). Stopping the run with a calm plain-language message.`;
      liveRun.logs.push(msg);
      this.emitLog(runId, msg);
      this.stopRun(runId, "token-cap");
    }
  }

  stopRun(runId: string, reason: string = "user-stop"): boolean {
    const proc = this.childProcesses.get(runId);
    const liveRun = this.activeRuns.get(runId);

    if (proc) {
      try {
        if (process.platform === "win32") {
          const result = Bun.spawnSync(["taskkill", "/PID", String(proc.pid), "/T", "/F"]);
          if (result.exitCode !== 0) throw new Error("Could not stop the job process tree. Try Stop again.");
        } else {
          process.kill(-proc.pid, "SIGKILL");
        }
      } catch (error) { throw error; }
      this.childProcesses.delete(runId);
    }

    if (liveRun && (liveRun.status === "running" || liveRun.status === "paused")) {
      liveRun.status = "stopped";
      liveRun.stopReason = reason;
      liveRun.endedAt = new Date().toISOString();
      const tracePath = join(this.targetDir, "adws", "adw_data", "sssf.db");
      if (existsSync(tracePath)) {
        let db: Database | undefined;
        try {
          db = new Database(tracePath);
          db.exec("PRAGMA busy_timeout=5000");
          db.transaction(() => {
            db!.query("UPDATE sessions SET status='fail', ended_at=?, total_tokens=MAX(COALESCE(total_tokens,0),?) WHERE adw_id=?").run(liveRun.endedAt!, liveRun.tokenUsage ?? 0, liveRun.adwId);
            db!.query("UPDATE phases SET status='fail', ended_at=?, error='Run stopped' WHERE adw_id=? AND ended_at IS NULL").run(liveRun.endedAt!, liveRun.adwId);
            db!.query("UPDATE processes SET ended_at=? WHERE adw_id=? AND ended_at IS NULL").run(liveRun.endedAt!, liveRun.adwId);
          })();
        } catch { liveRun.logs.push("[crew] The job stopped, but its trace could not be finalized."); }
        finally { db?.close(); }
      }
      const msg = reason === "token-cap"
        ? `[crew] Stopped at the token cap. The job did not finish. Raise the cap in Settings or approve a smaller spec and try again.`
        : `[crew] Process stopped by user.`;
      liveRun.logs.push(msg);
      this.emitLog(runId, msg);
      this.saveRunHistory(liveRun);
      return true;
    }
    return false;
  }

  /**
   * Pause: send SIGTSTP (Unix) or fallback to a soft "pause" by detaching
   * stdout. Resume: SIGCONT (Unix). On Windows where SIGTSTP is not
   * supported, we degrade to a "soft pause" that stops streaming new
   * output but does not suspend the process; we document this in PROGRESS.
   */
  pauseRun(runId: string): boolean {
    const liveRun = this.activeRuns.get(runId);
    const proc = this.childProcesses.get(runId);
    if (!liveRun || liveRun.status !== "running") return false;
    if (process.platform === "win32") throw new Error("Pause is not available on Windows yet. The job is still running; use Stop to end it.");

    try {
      if (typeof proc?.kill === "function") {
        // SIGTSTP = suspend
        process.kill(-proc.pid, "SIGSTOP");
      }
      liveRun.status = "paused";
      const msg = `[crew] Run paused. Resume to continue, or Stop to end.`;
      liveRun.logs.push(msg);
      this.emitLog(runId, msg);
      return true;
    } catch (e: any) {
      const msg = `[crew] Pause not supported here (${e.message}). Use Stop instead.`;
      liveRun.logs.push(msg);
      this.emitLog(runId, msg);
      return false;
    }
  }

  resumeRun(runId: string): boolean {
    const liveRun = this.activeRuns.get(runId);
    const proc = this.childProcesses.get(runId);
    if (!liveRun || liveRun.status !== "paused") return false;
    try {
      if (process.platform !== "win32" && typeof proc?.kill === "function") {
        process.kill(-proc.pid, "SIGCONT");
      }
      liveRun.status = "running";
      liveRun.stopReason = "user-pause-resumed";
      const msg = `[crew] Run resumed.`;
      liveRun.logs.push(msg);
      this.emitLog(runId, msg);
      return true;
    } catch {
      return false;
    }
  }

  subscribeLogs(runId: string, listener: (line: string) => void): () => void {
    let set = this.listeners.get(runId);
    if (!set) {
      set = new Set();
      this.listeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set?.size === 0) this.listeners.delete(runId);
    };
  }

  private emitLog(runId: string, line: string): void {
    const set = this.listeners.get(runId);
    if (set) {
      for (const listener of set) {
        try { listener(line); } catch {}
      }
    }
  }

  private saveRunHistory(run: LiveRunState): void {
    try {
      const historyFile = join(this.targetDir, "adws", "adw_data", "studio_history.json");
      let history: { approvals: any[]; runs: any[] } = { approvals: [], runs: [] };
      if (existsSync(historyFile)) {
        try { history = JSON.parse(readFileSync(historyFile, "utf-8")); } catch {}
      }
      if (!Array.isArray(history.runs)) history.runs = [];
      history.runs = history.runs.filter(r => r.runId !== run.runId);
      history.runs.unshift({
        runId: run.runId,
        adwId: run.adwId,
        workflowId: run.workflowId,
        status: run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        exitCode: run.exitCode,
        promptPreview: run.promptPreview,
        approvalId: run.approvalId,
        tokenUsage: run.tokenUsage,
        tokenCap: run.tokenCap,
        stopReason: run.stopReason,
        logs: run.logs.slice(-400),
      });
      writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8");
    } catch (e) {
      console.error("[launcher] failed to write run history:", e);
    }
  }
}

export { WORKFLOW_METADATA };
