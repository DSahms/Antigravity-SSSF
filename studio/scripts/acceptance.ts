/** Prepare isolated acceptance targets, or run an already approved noncommitting workflow.
 * Never creates an approval or commits. Profiles remain private in .sssf/.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ApprovalBook } from "../server/approvals";
import { WorkflowLauncher } from "../server/launcher";

const root = resolve(import.meta.dir, "../..");
const target = join(root, ".sssf", "acceptance", "product-20261021");
const mode = process.argv[2];
if (mode === "prepare") {
  if (existsSync(target)) throw new Error("Acceptance target already exists; preserve it and use its existing specs.");
  mkdirSync(join(root, ".sssf", "acceptance"), { recursive: true });
  const clone = Bun.spawnSync(["git", "clone", "--no-hardlinks", root, target], { stdout: "ignore", stderr: "pipe" });
  if (clone.exitCode) throw new Error("Could not clone existing history into the acceptance folder.");
  cpSync(join(root, "adws"), join(target, "adws"), { recursive: true,
    filter: p => !/[\\/](sessions|__pycache__|rea_verification)([\\/]|$)/.test(p) && !/\.db(?:-|$)/.test(p) && !p.endsWith("studio_history.json") });
  cpSync(join(root, "adws/adw_data/rea_synthetic"), join(target, "synthetic-target"), { recursive: true });
  mkdirSync(join(target, ".sssf"), { recursive: true });
  const store = JSON.parse(readFileSync(join(root, ".sssf/profiles.json"), "utf8"));
  const saved = store.profiles.find((p: any) => p.role === "planner" && p.provider === "local" && !p.disabled);
  if (!saved || saved.baseUrl !== "http://127.0.0.1:31415/v1") throw new Error("Expected existing saved router connection is unavailable.");
  const roles = ["rea", "planner", "builder", "reviewer", "documenter", "interviewer"];
  store.profiles = roles.map(role => ({ ...saved, id: `acceptance-${role}`, role, provider: "local" }));
  store.selectedProviders = Object.fromEntries(roles.map(role => [role, "local"]));
  writeFileSync(join(target, ".sssf/profiles.json"), JSON.stringify(store, null, 2));
  // Prevent accidental Git commits in this disposable verification target.
  writeFileSync(join(target, ".git/hooks/pre-commit"), "#!/bin/sh\necho 'Acceptance target: commits forbidden' >&2\nexit 1\n");
  writeFileSync(join(target, ".crew-quality.json"), JSON.stringify({ test: ["node", "--test", "test/app.test.js"], lint: ["node", "--check", "app.js"], typecheck: ["node", "--check", "app.js"], build: ["node", "--check", "app.js"] }, null, 2));
  const assignment = { question: "Which modules provide normalization, and what static evidence supports their relationship?", target: join(target, "synthetic-target"), scope: "Static inspection of this synthetic-target directory only; no target execution or other targets", permitted_actions: "static-local" };
  const reaSpec = '# Synthetic REA acceptance\n\n## Goal\nCollect real CLI evidence, interpret it, then plan a tiny normalization adapter.\n\n## Requirements\nRead the REA evidence. Preserve the exact assignment in the handoff. Both handoff copies must match. The plan must cite index.js and normalize.js, distinguish static observations from runtime claims, retain unknowns and limitations, and propose trim/lowercase validation without claiming those tests ran.\n\n## Acceptance Criteria\nReal rea_collect, rea and plan phases succeed. Raw evidence stays unchanged. No build, target execution, external investigation or Git commits.\n\n## Boundaries\nOnly existing verified free connections; maximum 100000 reported tokens. Stop if charges cannot be ruled out.\n\n```crew-rea\n' + JSON.stringify(assignment, null, 2) + '\n```\n';
  const buildSpec = '# Synthetic build acceptance\n\n## Goal\nBuild a tiny CommonJS normalization adapter in app.js.\n\n## Requirements\nExport normalize(value) returning String(value).trim().toLowerCase(). Use only built-in modules. Do not read, modify or execute synthetic-target. Create test/app.test.js using node:test to assert spaces/mixed case, empty input, and numeric input. Preserve .crew-quality.json and factory files.\n\n## Acceptance Criteria\nTests and configured checks pass; review verifies requirements; documentation cites the actual change.\n\n## Boundaries\nNo packages, network, publishing, process management or commits. Use existing verified free connections only. Maximum 300000 reported tokens.\n';
  mkdirSync(join(target, "requests"), { recursive: true });
  writeFileSync(join(target, "requests/rea-acceptance.md"), reaSpec);
  writeFileSync(join(target, "requests/build-acceptance.md"), buildSpec);
  console.log(JSON.stringify({ target, specs: ["requests/rea-acceptance.md", "requests/build-acceptance.md"], approvalRequired: true }));
} else if (mode === "run") {
  const approvalId = process.argv[3];
  if (!approvalId) throw new Error("Supply a real recorded approval ID from Review & Approve. This script never creates approval.");
  if (!process.argv.includes("--verified-free")) throw new Error("Verify that the saved router cannot incur paid charges before using --verified-free.");
  const book = new ApprovalBook(target);
  const approval = book.get(approvalId);
  if (!approval || !["adw_rea_plan.py", "adw_verify_sdlc.py"].includes(approval.workflowId)) throw new Error("A recorded approval for a noncommitting acceptance workflow is required.");
  const head = () => Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: target }).stdout.toString().trim();
  const baseline = head();
  const launcher = new WorkflowLauncher(target, book);
  const run = await launcher.launchWorkflow({ approvalId, workflowId: approval.workflowId, promptMode: "approved-spec", tokenCap: approval.workflowId === "adw_rea_plan.py" ? 100000 : 300000 });
  const deadline = Date.now() + 15 * 60 * 1000;
  let previous = "";
  while (["running", "paused"].includes(run.status)) {
    await Bun.sleep(1000);
    if (Date.now() > deadline) launcher.stopRun(run.runId, "acceptance-timeout");
    const progress = `${run.currentPhase}:${run.tokenUsage}`;
    if (progress !== previous) { console.log(JSON.stringify({ phase: run.currentPhase, tokens: run.tokenUsage })); previous = progress; }
  }
  writeFileSync(join(target, ".sssf", `${run.adwId}-acceptance.json`), JSON.stringify(run, null, 2));
  if (head() !== baseline) throw new Error("Acceptance HEAD changed unexpectedly.");
  console.log(JSON.stringify({ status: run.status, tokens: run.tokenUsage, adwId: run.adwId, headUnchanged: true }));
  process.exitCode = run.status === "success" ? 0 : 1;
} else throw new Error("Use prepare, or run <approval-id> --verified-free.");
