import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
for (const [command, args] of [["bun", ["test", "studio/test/core.bun.test.ts"]], ["uv", ["run", "adws/test_permissions.py"]], ["uv", ["run", "adws/test_workflow.py"]]]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
