/**
 * ADW Workflow Catalog & Process Execution Manager for SSSF Studio.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AdwWorkflowInfo,
  LaunchRequest,
  LiveRunState,
} from "../shared/types.ts";

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
  "adw_simple_sdlc.py": {
    name: "Simple SDLC (Full Chain)",
    description: "The complete pipeline: plan → build → test → review → document, landing 3 agent commits.",
    phases: ["request", "plan", "commit_plan", "build", "test", "review", "document", "commit_docs"],
    requiredAgents: ["planner", "builder", "reviewer", "documenter"],
    recommendedWhen: "When building real features from an approved specification.",
    badge: "Recommended",
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
    description: "Generates an architectural plan in specs/plan.md without modifying any repository files.",
    phases: ["request", "plan"],
    requiredAgents: ["planner"],
    recommendedWhen: "Architecture exploration and blueprint design.",
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
  private activeRuns: Map<string, LiveRunState> = new Map();
  private childProcesses: Map<string, any> = new Map();
  private listeners: Map<string, Set<(line: string) => void>> = new Map();

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  setTargetDir(dir: string): void {
    this.targetDir = dir;
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

    // Sort recommended first
    results.sort((a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0));
    return results;
  }

  getActiveRuns(): LiveRunState[] {
    return Array.from(this.activeRuns.values());
  }

  getRunState(runId: string): LiveRunState | null {
    return this.activeRuns.get(runId) ?? null;
  }

  async launchWorkflow(req: LaunchRequest): Promise<LiveRunState> {
    const scriptPath = join("adws", req.workflowId);
    let promptArg = "";

    if (req.promptMode === "approved-spec" && req.specPath) {
      promptArg = req.specPath;
    } else if (req.promptMode === "file" && req.specPath) {
      promptArg = req.specPath;
    } else if (req.customPrompt) {
      promptArg = req.customPrompt;
    } else {
      promptArg = "Implement requested specification";
    }

    const runId = "run-" + Date.now().toString(36);
    const configPath = req.configPath || "adws/adw_sssf_config/sssf.config.yaml";

    const meta = WORKFLOW_METADATA[req.workflowId] || { name: req.workflowId };

    const liveRun: LiveRunState = {
      runId,
      adwId: req.adwId || "",
      workflowId: req.workflowId,
      workflowName: meta.name,
      status: "running",
      startedAt: new Date().toISOString(),
      promptPreview: promptArg.length > 100 ? promptArg.slice(0, 100) + "..." : promptArg,
      logs: [
        `[studio] Launching ${req.workflowId}...`,
        `[studio] Target Directory: ${this.targetDir}`,
        `[studio] Config: ${configPath}`,
        `[studio] Prompt: ${promptArg}`,
        `------------------------------------------------------------`,
      ],
    };

    this.activeRuns.set(runId, liveRun);

    const args = ["uv", "run", scriptPath, "--config", configPath];
    if (req.adwId) {
      args.push("--adw-id", req.adwId);
    }
    args.push(promptArg);

    try {
      const proc = Bun.spawn(args, {
        cwd: this.targetDir,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      liveRun.pid = proc.pid;
      this.childProcesses.set(runId, proc);

      // Stream stdout
      this.streamOutput(runId, proc.stdout, false);
      // Stream stderr
      this.streamOutput(runId, proc.stderr, true);

      // Handle completion asynchronously
      proc.exited.then((code) => {
        liveRun.exitCode = code;
        liveRun.status = code === 0 ? "success" : "fail";
        liveRun.endedAt = new Date().toISOString();
        const finishMsg = `[studio] Workflow finished with exit code ${code} (${liveRun.status})`;
        liveRun.logs.push(finishMsg);
        this.emitLog(runId, finishMsg);

        this.childProcesses.delete(runId);
        this.saveRunHistory(liveRun);
      });

      return liveRun;
    } catch (err: any) {
      liveRun.status = "fail";
      liveRun.endedAt = new Date().toISOString();
      const errMsg = `[studio] Failed to spawn process: ${err.message}`;
      liveRun.logs.push(errMsg);
      return liveRun;
    }
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
            // Check for adw_id
            const idMatch = line.match(/adw_id:\s+([a-f0-9]{8})/i);
            if (idMatch && idMatch[1]) {
              liveRun.adwId = idMatch[1];
            }
            // Check for phase start
            const phaseMatch = line.match(/[▶►]\s+(\d+)\s+([a-zA-Z0-9_-]+)/);
            if (phaseMatch && phaseMatch[2]) {
              liveRun.currentPhase = phaseMatch[2];
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

  stopRun(runId: string): boolean {
    const proc = this.childProcesses.get(runId);
    const liveRun = this.activeRuns.get(runId);

    if (proc) {
      try {
        proc.kill();
      } catch {}
      this.childProcesses.delete(runId);
    }

    if (liveRun && liveRun.status === "running") {
      liveRun.status = "stopped";
      liveRun.endedAt = new Date().toISOString();
      const stopMsg = `[studio] Process stopped by user.`;
      liveRun.logs.push(stopMsg);
      this.emitLog(runId, stopMsg);
      this.saveRunHistory(liveRun);
      return true;
    }
    return false;
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
      if (set?.size === 0) {
        this.listeners.delete(runId);
      }
    };
  }

  private emitLog(runId: string, line: string): void {
    const set = this.listeners.get(runId);
    if (set) {
      for (const listener of set) {
        try {
          listener(line);
        } catch {}
      }
    }
  }

  private saveRunHistory(run: LiveRunState): void {
    try {
      const historyFile = join(this.targetDir, "adws", "adw_data", "studio_history.json");
      let history: { approvals: any[]; runs: any[] } = { approvals: [], runs: [] };
      if (existsSync(historyFile)) {
        try {
          history = JSON.parse(readFileSync(historyFile, "utf-8"));
        } catch {}
      }
      if (!Array.isArray(history.runs)) history.runs = [];
      history.runs.unshift({
        runId: run.runId,
        adwId: run.adwId,
        workflowId: run.workflowId,
        status: run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        exitCode: run.exitCode,
        promptPreview: run.promptPreview,
      });
      writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8");
    } catch (e) {
      console.error("[launcher] failed to write run history:", e);
    }
  }
}
