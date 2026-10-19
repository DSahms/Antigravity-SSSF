/** Bounded real workflow proof, in an ignored dedicated repository. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ApprovalBook } from "../server/approvals";
import { WorkflowLauncher } from "../server/launcher";

const root = resolve(import.meta.dir, "../..");
const capIndex = process.argv.indexOf("--cap");
const cap = capIndex >= 0 ? Number(process.argv[capIndex + 1]) : 12000;
if (!Number.isSafeInteger(cap) || cap <= 0 || cap > 60000) throw new Error("Verification cap must be a positive integer no larger than 60000.");
const target = join(root, ".sssf", "verification", `demo-${Date.now()}`);
mkdirSync(target, { recursive: true });
writeFileSync(join(target, ".env"), "");
cpSync(join(root, "adws"), join(target, "adws"), { recursive: true, filter: path => !path.includes("sessions") && !path.endsWith(".db") && !path.includes("__pycache__") });
writeFileSync(join(target, ".gitignore"), ".sssf/\nadws/adw_data/sessions/\n*.db*\n__pycache__/\n.env\n");
mkdirSync(join(target, ".sssf"), { recursive: true });
cpSync(join(root, ".sssf/profiles.json"), join(target, ".sssf/profiles.json"));
writeFileSync(join(target, ".crew-quality.json"), JSON.stringify({ test: ["node", "--test"], lint: ["node", "--check", "app.js"], typecheck: ["node", "--check", "app.js"], build: ["node", "--check", "app.js"] }));
for (const args of [["init"], ["add", "."], ["-c", "user.name=Crew verification", "-c", "user.email=verification@localhost", "commit", "-m", "Verification baseline"]]) {
  if (Bun.spawnSync(["git", ...args], { cwd: target, stdout: "ignore", stderr: "ignore" }).exitCode !== 0) throw new Error("Could not initialize isolated verification repository.");
}
const spec = "Create a tiny Node.js application in app.js (CommonJS, built-in modules only). Export a handler that returns HTTP 200 and JSON {ok:true} for GET /health, HTTP 404 otherwise. Start a server on process.env.PORT or 8765 only when run directly. Create test/app.test.js using node:test and node:assert to verify /health and the 404 path without opening a port. Preserve the existing .crew-quality.json. No package installation, no external calls, no publishing. Write a concise README explaining how to start and test the app. Use Windows-compatible file commands. Acceptance: node --test and node --check app.js pass, reviewer verifies both paths, documenter records actual behavior.";
const book = new ApprovalBook(target);
const approval = book.approve({ specMarkdown: spec, specTitle: "Isolated health demo", approvedBy: "Owner-authorized verification", sections: [{ id: "demo", name: "Bounded demo" }], summary: { willHappen: "Build and verify an isolated demo", willUse: "Saved router auto", willNotDo: "Change the owner's working tree", timeEstimate: "unknown", costEstimate: `Router-dependent, ${cap}-token reporting cap`, canUndo: "Isolated folder", cannotUndo: "Provider usage" }, workflowId: "adw_simple_sdlc.py", workflowName: "Full workflow", promptPreview: "Isolated demo" });
const launcher = new WorkflowLauncher(target, book);
const run = await launcher.launchWorkflow({ workflowId: approval.workflowId, promptMode: "approved-spec", approvalId: approval.id, tokenCap: cap });
console.log(JSON.stringify({ runId: run.runId, target, status: run.status }));
const deadline = Date.now() + 8 * 60 * 1000;
let previous = "";
while (run.status === "running" || run.status === "paused") {
  await Bun.sleep(1000);
  const phase = run.currentPhase ?? "starting";
  if (phase !== previous) { previous = phase; console.log(JSON.stringify({ phase, tokens: run.tokenUsage })); }
  if (Date.now() > deadline) launcher.stopRun(run.runId, "verification-timeout");
}
writeFileSync(join(target, ".sssf", "verification-result.json"), JSON.stringify(run, null, 2));
console.log(JSON.stringify({ status: run.status, exitCode: run.exitCode, tokens: run.tokenUsage, stopReason: run.stopReason, appExists: existsSync(join(target, "app.js")) }));
if (run.status !== "success") {
  console.log(run.logs.slice(-12).join("\n"));
  process.exitCode = 1;
}
