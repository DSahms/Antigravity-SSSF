import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

// Run from the repository root
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const studioRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

// Test files to run - use absolute paths to avoid picking up packaged files
const testFiles = [
  join(studioRoot, "test", "core.bun.test.ts"),
  join(studioRoot, "test", "rea.bun.test.ts")
];

// Run the tests with absolute paths
const testResult = spawnSync("bun", ["test", ...testFiles], {
  cwd: studioRoot,
  stdio: "inherit",
  windowsHide: true
});

if (testResult.status !== 0) {
  process.exitCode = testResult.status ?? 1;
} else {
  // Run typecheck
  const typecheckResult = spawnSync("node", ["node_modules/vue-tsc/bin/vue-tsc.js", "--noEmit"], {
    cwd: studioRoot,
    stdio: "inherit",
    windowsHide: true
  });

  if (typecheckResult.status !== 0) {
    process.exitCode = typecheckResult.status ?? 1;
  }
}

// Run backend tests
const backendTests = [
  ["uv", ["run", "adws/test_permissions.py"]],
  ["uv", ["run", "adws/test_workflow.py"]],
  ["uv", ["run", "adws/test_rea.py"]]
];

for (const [command, args] of backendTests) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true
  });
  
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
