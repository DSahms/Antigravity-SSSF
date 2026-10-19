import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

describe("/api/version endpoint", () => {
  let serverProcess: ReturnType<typeof spawn> | null = null;
  const PORT = 4737;

  beforeAll(async () => {
    serverProcess = spawn("bun", ["run", "server/index.ts"], {
      cwd: resolve(__dirname, ".."),
      env: {
        ...process.env,
        TARGET_DIR: resolve(__dirname, ".."),
        STUDIO_PORT: String(PORT),
      },
      stdout: "ignore",
      stderr: "ignore",
    });

    // Wait for server to be ready
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (res.ok) {
          return;
        }
      } catch {
        // Ignore connection errors during startup
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("Server did not start");
  });

  afterAll(async () => {
    if (serverProcess) {
      try {
        serverProcess.kill("SIGTERM");
      } catch {
        // Ignore
      }
    }
  });

  test("GET /api/version returns version JSON", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/version`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ name: 'C.R.E.W. Software', version: '1.0.0' });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
