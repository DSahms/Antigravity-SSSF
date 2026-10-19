/**
 * Target project management and factory stamping for SSSF Studio.
 */
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, cpSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parse } from "yaml";
import type {
  ApprovedSpecSummary, DeliverableFile, ProjectDeliverables, ProjectQualityState,
  QualityConfig, TargetProject,
} from "../shared/types.ts";

const QUALITY_KEYS = ["test", "lint", "typecheck", "build"] as const;

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

  private qualityPath(): string {
    return join(this.targetDir, ".crew-quality.json");
  }

  getQualityConfig(): ProjectQualityState {
    const path = this.qualityPath();
    if (!existsSync(path)) return { path, exists: false, config: null };
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      const config: QualityConfig = {};
      for (const key of QUALITY_KEYS) {
        const value = parsed[key];
        if (Array.isArray(value) && value.length && value.every(item => typeof item === "string")) {
          config[key] = value;
        }
      }
      return { path, exists: true, config };
    } catch (error) {
      return { path, exists: true, config: null, error: (error as Error).message };
    }
  }

  getDeliverables(): ProjectDeliverables {
    const collect = (folder: string): DeliverableFile[] => {
      const dir = join(this.targetDir, folder);
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter(name => name.endsWith(".md"))
        .map(name => {
          const full = join(dir, name);
          const info = statSync(full);
          return { path: full, name, sizeBytes: info.size, modifiedAt: info.mtime.toISOString() };
        })
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
        .slice(0, 12);
    };
    const changedFiles: string[] = [];
    const git = Bun.spawnSync(["git", "status", "--porcelain"], { cwd: this.targetDir });
    if (git.exitCode === 0) {
      for (const line of git.stdout.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        const path = line.slice(3).trim();
        if (path) changedFiles.push(path);
      }
    }
    return { projectPath: this.targetDir, specs: [...collect("specs"), ...collect("requests")], changedFiles };
  }

  saveQualityConfig(input: unknown): ProjectQualityState {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Send a JSON object with test, lint, typecheck, or build commands.");
    }
    const source = input as Record<string, unknown>;
    const config: QualityConfig = {};
    for (const key of QUALITY_KEYS) {
      const value = source[key];
      if (value === undefined || value === null) continue;
      if (!Array.isArray(value) || !value.length || !value.every(item => typeof item === "string" && item.trim())) {
        throw new Error(`The ${key} command must be a non-empty list of strings.`);
      }
      config[key] = value.map(item => item.trim());
    }
    if (!Object.keys(config).length) {
      throw new Error("Add at least one real check (test, lint, typecheck, or build) before saving.");
    }
    writeFileSync(this.qualityPath(), JSON.stringify(config, null, 2) + "\n");
    return this.getQualityConfig();
  }

  createProject(name: string): TargetProject {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) throw new Error("Use a short project name with letters, numbers, and dashes.");
    const target = join(this.factoryRoot, ".sssf", "projects", name);
    if (existsSync(target)) throw new Error("That project already exists. Open it from your saved projects.");
    mkdirSync(target, { recursive: true });
    cpSync(join(this.factoryRoot, "adws"), join(target, "adws"), { recursive: true, filter: path => !path.includes("sessions") && !path.includes("__pycache__") && !path.endsWith(".db") && !path.endsWith("studio_history.json") });
    mkdirSync(join(target, ".sssf"), { recursive: true });
    writeFileSync(join(target, ".sssf", "case.json"), JSON.stringify({ id: `case-${name}`, title: name, jobType: "software", createdAt: new Date().toISOString(), repositoryPath: target, inputs: [], outputs: [] }, null, 2));
    const profiles = join(this.targetDir, ".sssf", "profiles.json");
    if (existsSync(profiles)) cpSync(profiles, join(target, ".sssf", "profiles.json"));
    writeFileSync(join(target, ".gitignore"), ".sssf/\nadws/adw_data/sessions/\n*.db*\n.env*\nnode_modules/\n__pycache__/\n");
    writeFileSync(join(target, ".env"), "");
    writeFileSync(join(target, "README.md"), `# ${name}\n\nCreated with Crew Platform. Describe your app in New Job.\n`);
    for (const args of [["init"], ["add", "."], ["-c", "user.name=Crew Platform", "-c", "user.email=crew@localhost", "commit", "-m", "Create project baseline"]]) {
      if (Bun.spawnSync(["git", ...args], { cwd: target, stdout: "ignore", stderr: "ignore" }).exitCode !== 0) throw new Error("Could not prepare the new project's Git history.");
    }
    for (const [key, fallback] of [["user.name", "Crew Platform"], ["user.email", "crew@localhost"]]) {
      const current = Bun.spawnSync(["git", "config", key], { cwd: target });
      if (current.exitCode !== 0) Bun.spawnSync(["git", "config", key, fallback], { cwd: target });
    }
    return this.setTargetDir(target);
  }

  setTargetDir(newPath: string): TargetProject {
    const resolved = resolve(newPath);
    if (!existsSync(resolved)) {
      throw new Error(`Target path does not exist: ${resolved}`);
    }
    if (!statSync(resolved).isDirectory()) throw new Error("Choose a project folder, not a file.");
    this.targetDir = resolved;
    const dir = join(this.factoryRoot, ".sssf");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "active-project.json"), JSON.stringify({ path: resolved }));
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
