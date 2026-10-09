/**
 * Target project management and factory stamping for SSSF Studio.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import type { ApprovedSpecSummary, TargetProject } from "../shared/types.ts";

export class ProjectManager {
  private targetDir: string;
  private readonly factoryRoot: string;

  constructor(initialTargetDir: string, factoryRoot: string) {
    this.targetDir = resolve(initialTargetDir);
    this.factoryRoot = resolve(factoryRoot);
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  setTargetDir(newPath: string): TargetProject {
    const resolved = resolve(newPath);
    if (!existsSync(resolved)) {
      throw new Error(`Target path does not exist: ${resolved}`);
    }
    this.targetDir = resolved;
    return this.getProjectInfo();
  }

  getProjectInfo(): TargetProject {
    const configPath = join(this.targetDir, "adws", "adw_sssf_config", "sssf.config.yaml");
    const dbPath = join(this.targetDir, "adws", "adw_data", "sssf.db");
    const envPath = join(this.targetDir, ".env");
    const justfilePath = join(this.targetDir, "justfile");
    const adwsDir = join(this.targetDir, "adws");

    const hasConfig = existsSync(configPath);
    const hasDb = existsSync(dbPath);
    const hasEnv = existsSync(envPath);
    const hasJustfile = existsSync(justfilePath);
    const isStamped = existsSync(adwsDir) && hasConfig;

    let agentCount = 0;
    if (hasConfig) {
      try {
        const text = Bun.file(configPath);
        // Note: read synchronously or parse
        const content = text.size > 0 ? require("node:fs").readFileSync(configPath, "utf-8") : "";
        const parsed = parse(content);
        if (parsed?.agents && Array.isArray(parsed.agents)) {
          agentCount = parsed.agents.length;
        }
      } catch {}
    }

    let gitBranch: string | null = null;
    try {
      const gitProc = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: this.targetDir,
      });
      if (gitProc.exitCode === 0) {
        gitBranch = gitProc.stdout.toString().trim() || null;
      }
    } catch {}

    const approvedSpecs = this.listApprovedSpecs();

    return {
      path: this.targetDir,
      name: basename(this.targetDir),
      isStamped,
      hasConfig,
      hasDb,
      hasEnv,
      hasJustfile,
      gitBranch,
      approvedSpecs,
      agentCount,
    };
  }

  listApprovedSpecs(): ApprovedSpecSummary[] {
    const results: ApprovedSpecSummary[] = [];
    const requestsDir = join(this.targetDir, "requests");
    const specsDir = join(this.targetDir, "specs");

    const scanDir = (dir: string) => {
      if (!existsSync(dir)) return;
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (file.endsWith(".md") || file.endsWith(".markdown")) {
            const fullPath = join(dir, file);
            try {
              const stat = statSync(fullPath);
              let title = file.replace(/\.md$/, "");
              try {
                const head = require("node:fs").readFileSync(fullPath, "utf-8").slice(0, 500);
                const titleMatch = head.match(/^#\s+(.+)$/m);
                if (titleMatch && titleMatch[1]) {
                  title = titleMatch[1].trim();
                }
              } catch {}

              results.push({
                filePath: fullPath,
                fileName: file,
                title,
                sizeBytes: stat.size,
                lastModified: stat.mtime.toISOString(),
              });
            } catch {}
          }
        }
      } catch {}
    };

    scanDir(requestsDir);
    scanDir(specsDir);

    results.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
    return results;
  }

  async stampFactory(force = false): Promise<{ success: boolean; log: string }> {
    const installScript = join(
      this.factoryRoot,
      ".claude",
      "skills",
      "sssf",
      "scripts",
      "install.py",
    );

    if (!existsSync(installScript)) {
      throw new Error(`Official install script not found at ${installScript}`);
    }

    const args = ["uv", "run", installScript];
    if (force) args.push("--force");

    try {
      const proc = Bun.spawn(args, {
        cwd: this.targetDir,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      const log = stdout + (stderr ? `\nErrors:\n${stderr}` : "");

      // If .env is missing and .env.sample was stamped, create starter .env
      const envPath = join(this.targetDir, ".env");
      const samplePath = join(this.targetDir, ".env.sample");
      if (!existsSync(envPath) && existsSync(samplePath)) {
        try {
          const sample = require("node:fs").readFileSync(samplePath, "utf-8");
          require("node:fs").writeFileSync(envPath, sample, "utf-8");
        } catch {}
      }

      return {
        success: exitCode === 0,
        log,
      };
    } catch (err: any) {
      return {
        success: false,
        log: `Execution failed: ${err.message}`,
      };
    }
  }
}
