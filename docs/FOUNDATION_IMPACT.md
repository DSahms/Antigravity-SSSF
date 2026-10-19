# Phase 0: Impact Map

**Purpose:** List every place the code assumes a git repository, a target repo, commits, a stamped project folder, or a software-only workflow. Also record how the factory gets its model and key settings today.

---

## 1. Git Repository Assumptions

| File | Lines | What It Assumes |
|------|-------|----------------|
| `studio/server/project.ts` | 57-65 | Calls `Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: this.targetDir })` to detect the current git branch. Assumes the target directory is or contains a git repository. |
| `studio/server/project.ts` | 57-65 | If git is not available or the cwd has no repo, the try/catch silently leaves `gitBranch` as `null`. |
| `README.md` | 72 | Documents `git init && git commit --allow-empty -m init` as a prerequisite for chains that end in a commit phase. |
| `studio/server/index.ts` | 22-24 | Reads `process.env.TARGET_DIR` or defaults to `FACTORY_ROOT` (`resolve(import.meta.dir, "..", "..")`). The target dir is expected to be a stamped repo path. |
| `studio/server/launcher.ts` | 170 | Uses `join("adws", req.workflowId)` to construct the script path relative to the target dir. Implicitly assumes an `adws/` directory under the target. |
| `studio/server/launcher.ts` | 210 | Spawns `["uv", "run", scriptPath, "--config", configPath]` in `cwd: this.targetDir`. The workflow is expected to run in a repo context. |

---

## 2. Commit Phase Assumptions

| File | Lines | What It Assumes |
|------|-------|----------------|
| `studio/server/project.ts` | 206-208 (via README) | The commit phase calls `git_helper.commit_all(message)` which requires a git repo. A "no-op build fails the phase rather than committing nothing" — `git init` with one commit is needed first. |
| `README.md` | 363 | Documents that `commit_all` raises if the cwd is not a git repo or nothing changed. |

---

## 3. Stamped Project Folder Assumptions

| File | Lines | What It Assumes |
|------|-------|----------------|
| `studio/server/project.ts` | 31-81 | `getProjectInfo()` checks for stamping artifacts: `sssf.config.yaml`, `sssf.db`, `.env`, `justfile`, and `adws/` directory. `isStamped = existsSync(adwsDir) && hasConfig`. Assumes these files live at fixed paths under the target directory. |
| `studio/server/project.ts` | 32 | `configPath = join(this.targetDir, "adws", "adw_sssf_config", "sssf.config.yaml")` — fixed path for the roster YAML. |
| `studio/server/project.ts` | 33 | `dbPath = join(this.targetDir, "adws", "adw_data", "sssf.db")` — fixed path for the SQLite trace database. |
| `studio/server/project.ts` | 34 | `envPath = join(this.targetDir, ".env")` — fixed path for the environment file. |
| `studio/server/project.ts` | 35 | `justfilePath = join(this.targetDir, "justfile")` — fixed path for the justfile. |
| `studio/server/index.ts` | 18 | `FACTORY_ROOT = resolve(import.meta.dir, "..", "..")` — the factory root is two levels up from the studio dir. |
| `studio/server/index.ts` | 22-24 | `initialTargetDir` comes from `process.env.TARGET_DIR` or defaults to `FACTORY_ROOT`. The project switcher sets the target dir via the `/api/studio/project/select` endpoint. |
| `studio/server/launcher.ts` | 115-117 | `setTargetDir(dir: string)` stores the target dir; all subsequent workflow launches use this dir for everything (db, specs, approvals, etc.). |
| `studio/server/approvals.ts` | (referenced) | Approval records stored in `<target>/.sssf/approvals.json` (gitignored). Assumes per-target isolated approval book. |
| `studio/server/profiles.ts` | (referenced) | Connection profiles live in `<target>/.sssf/profiles.json` (gitignored). Assumes per-target isolated profiles. |

---

## 4. Software-Only Workflow Assumptions (adw_ references)

| File | Lines | What It Assumes |
|------|-------|----------------|
| `studio/server/launcher.ts` | 28-101 | `WORKFLOW_METADATA` defines 12 ADW workflows (`adw_simple_sdlc.py`, `adw_plan_build_test.py`, etc.) with their phase lists, required agents, and descriptions. The launcher uses this metadata to list workflows, validate, and run them. |
| `studio/server/launcher.ts` | 162-251 | `launchWorkflow()` spawns `["uv", "run", scriptPath, "--config", configPath, runtimeSpecPath]` in the target dir's cwd. The Python ADW script is expected to be at `adws/<workflowId>`. |
| `studio/server/launcher.ts` | 210-212 | Args: `["uv", "run", scriptPath, "--config", configPath, runtimeSpecPath]`. The `--config` points to `adws/adw_sssf_config/sssf.config.yaml`. |
| `studio/server/discovery.ts` | 536-534 | `synthesizeSpecificationMarkdown` recommends `adw_simple_sdlc.py` or `adw_plan_build_test.py`. The discovery engine's output is designed to feed directly into the ADW workflow launch path. |
| `studio/server/index.ts` | 270-276 | `/api/studio/launch` endpoint receives a workflow request and delegates to `launcher.launchWorkflow(body)`. The launch API expects `workflowId`, `configPath`, `adwId`, and `approvalId`. |
| `studio/server/index.ts` | 268-270 | `/api/studio/workflows` lists available ADWs from the metadata. |
| `README.md` | 308-336 | Documents all 12 starter ADWs and their shapes: `uv run adws/adw_*.py "<prompt>" [--config ...] [--adw-id a1b2c3d4]`. |
| `README.md` | 69 | `uv run .claude/skills/sssf/scripts/install.py` stamps the factory into a target repo, creating `adws/`, `sssf.config.yaml`, `justfile`, `prompt_engineering/`, and `harness_engineering/`. |
| `studio/server/project.ts` | 126-179 | `stampFactory()` runs the official install script (`install.py`) via `Bun.spawn(["uv", "run", installScript], { cwd: this.targetDir })`. If `.env` is missing and `.env.sample` exists, it creates a starter `.env`. |

---

## 5. Model and Key Settings Configuration

| Setting | Where It Lives | How It Is Read Today |
|---------|---------------|----------------------|
| **Roster YAML** (agents, models, thinking levels, tools, writes) | `adws/adw_sssf_config/sssf.config.yaml` under the target dir | `ProjectManager.getProjectInfo()` reads it at lines 46-55: `Bun.file(configPath)` → `require("node:fs").readFileSync(configPath, "utf-8")` → `yaml.parse()`. The roster defines per-agent `model:`, `thinking:`, `color:`, `purpose:`, `writes:`, and `prompt_engineering:`. |
| **API Keys** (OPENROUTER_API_KEY, OPENAI_API_KEY, FIREWORKS_API_KEY, etc.) | `.env` at the target dir root | `ConfigManager` (in `studio/server/config.ts`) reads/writes `.env` keys via `Bun.file(envPath)`. The `.env` is gitignored. Keys are masked in the UI but stored plain-text in the file. |
| **Pi's model-to-key mapping** | `~/.pi/agent/models.json` (on the machine running pi) | The README (line 89) states: "Which key pi reads for a given provider comes from `~/.pi/agent/models.json`." Pi resolves the API key for a given `provider/model-id` from this file. |
| **Profile Store** (connection profiles with baseUrl, model, apiKey) | `<target>/.sssf/profiles.json` (gitignored) | `ProfileStore` class in `studio/server/profiles.ts` manages profiles via `/api/studio/profiles` GET/POST. Each profile has `role`, `baseUrl`, `model`, `apiKey`, `reasoningLevel?`, `hideThinking?`. The "local" profile is seeded for every role pointing at `http://127.0.0.1:5001/v1` with `apiKey: "none"`. The "cloud" (Venice) profile is seeded but disabled until `VENICE_API_KEY` is in `.env`. |
| **Default token cap** | Profile store (settings view) | `ProfileStore` has a `defaultTokenCap` setting exposed via `/api/studio/profiles/fetch-models`. The launcher uses `req.tokenCap` or defaults to `20_000` (launcher.ts line 184). |
| **Project switching** | `process.env.TARGET_DIR` or studio UI | The project switcher (`/api/studio/project/select`) sets a new target dir, which cascades to `ProjectManager`, `DiscoveryEngine`, `ConfigManager`, `ApprovalBook`, `ProfileStore`, and `WorkflowLauncher`. All subsequent API calls use the new target dir. |

---

## 6. Summary of Assumptions

The codebase assumes:
1. A **target directory** is set (via env var or project switcher) and contains or is a git repository.
2. A **stamped factory** exists at `<target>/adws/` with `sssf.config.yaml` (roster), `sssf.db` (trace DB), and `.env` (API keys).
3. **Git** is available in the target cwd for branch detection and commit phases.
4. **ADW Python scripts** live at `adws/adw_*.py` and are launched via `uv run adws/adw_*.py --config <path> <spec>`.
5. **Model keys** are resolved from `.env` (for direct Studio use) and `~/.pi/agent/models.json` (for Pi).
6. **Connection profiles** are stored per-target in `<target>/.sssf/profiles.json`.
7. **Token capping** reads stdout lines matching `tokens: N`, `total_tokens: N`, or `total N` — but currently has a bug (see WP5 below).

**No code changes are made in this phase** — this is a read-only impact analysis to guide the work packages ahead.