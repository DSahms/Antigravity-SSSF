/**
 * SSSF Studio Unified Server.
 *
 * Serves the unified control layer API and embedded visualizer observability data.
 */
import { existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { SssfDb } from "./db.ts";
import { ProjectManager } from "./project.ts";
import { DiscoveryEngine } from "./discovery.ts";
import { ConfigManager } from "./config.ts";
import { WorkflowLauncher } from "./launcher.ts";
import type { AgentPrompts, ApiError, HealthResponse } from "../shared/types.ts";

const PORT = Number(process.env.STUDIO_PORT ?? process.env.PORT ?? 4620);
const FACTORY_ROOT = resolve(import.meta.dir, "..", "..");
const DIST_DIR = resolve(import.meta.dir, "..", "dist");

// Default target project directory is the factory workspace root
const initialTargetDir = process.env.TARGET_DIR
  ? resolve(process.env.TARGET_DIR)
  : FACTORY_ROOT;

console.log(`[studio] Factory root:  ${FACTORY_ROOT}`);
console.log(`[studio] Initial target: ${initialTargetDir}`);

const projectMgr = new ProjectManager(initialTargetDir, FACTORY_ROOT);
const discovery = new DiscoveryEngine(initialTargetDir);
const configMgr = new ConfigManager(initialTargetDir);
const launcher = new WorkflowLauncher(initialTargetDir);

let activeDb: SssfDb | null = null;

function getDb(): SssfDb | null {
  const currentTarget = projectMgr.getTargetDir();
  const dbPath = join(currentTarget, "adws", "adw_data", "sssf.db");
  if (!existsSync(dbPath)) return null;

  if (!activeDb || activeDb.path !== dbPath) {
    try {
      activeDb?.close();
      activeDb = new SssfDb(dbPath);
    } catch (e) {
      console.error("[studio] Failed to open sssf.db:", e);
      return null;
    }
  }
  return activeDb;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS, PUT, DELETE",
      "access-control-allow-headers": "content-type",
    },
  });
}

function notFound(message: string): Response {
  return json({ error: message } satisfies ApiError, 404);
}

function safely(
  handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      console.error(`[studio] ${req.method} ${new URL(req.url).pathname}:`, error);
      return json({ error: (error as Error).message } satisfies ApiError, 500);
    }
  };
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
function isSafeSegment(value: string): boolean {
  return SAFE_SEGMENT.test(value) && value !== "." && value !== "..";
}

function param(req: Request, key: string): string {
  return decodeURIComponent(
    (req as Request & { params: Record<string, string> }).params[key] ?? "",
  );
}

function intQuery(req: Request, key: string, fallback: number): number {
  const raw = new URL(req.url).searchParams.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function serveStatic(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (!existsSync(DIST_DIR)) {
    return new Response(
      `SSSF Studio API is running on :${PORT}.\n\n` +
        `Frontend not yet built. Run "bun run build" or "bun run dev" for Vite development server.\n`,
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const candidate = resolve(join(DIST_DIR, pathname));
  if (candidate === DIST_DIR || candidate.startsWith(DIST_DIR + sep)) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return new Response(Bun.file(candidate));
    }
  }

  const indexHtml = join(DIST_DIR, "index.html");
  if (existsSync(indexHtml)) {
    return new Response(Bun.file(indexHtml), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return notFound("not found");
}

const server = Bun.serve({
  port: PORT,
  routes: {
    // ── STUDIO PROJECT ENDPOINTS ──────────────────────────────────────────

    "/api/studio/project": safely(() => json(projectMgr.getProjectInfo())),

    "/api/studio/project/select": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { path: string };
        const info = projectMgr.setTargetDir(body.path);
        discovery.setTargetDir(body.path);
        configMgr.setTargetDir(body.path);
        launcher.setTargetDir(body.path);
        activeDb?.close();
        activeDb = null;
        return json(info);
      }),
    },

    "/api/studio/project/stamp": {
      POST: safely(async (req) => {
        const body = (await req.json().catch(() => ({}))) as { force?: boolean };
        const res = await projectMgr.stampFactory(Boolean(body.force));
        return json(res);
      }),
    },

    // ── STUDIO DISCOVERY ENDPOINTS ────────────────────────────────────────

    "/api/studio/discovery/session": safely(() => json(discovery.getCurrentSession())),

    "/api/studio/discovery/analyze": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { input: string };
        const updated = await discovery.analyzeDescription(body.input || "");
        return json(updated);
      }),
    },

    "/api/studio/discovery/chat": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { message: string };
        const updated = await discovery.handleChatMessage(body.message || "");
        return json(updated);
      }),
    },

    "/api/studio/discovery/suggestion/accept": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { id: string };
        return json(discovery.acceptSuggestion(body.id));
      }),
    },

    "/api/studio/discovery/suggestion/reject": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { id: string };
        return json(discovery.rejectSuggestion(body.id));
      }),
    },

    "/api/studio/discovery/question/answer": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { id: string; answer: string };
        return json(discovery.answerQuestion(body.id, body.answer));
      }),
    },

    "/api/studio/discovery/spec": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { markdown: string };
        return json(discovery.updateSpecMarkdown(body.markdown || ""));
      }),
    },

    "/api/studio/discovery/approve": {
      POST: safely(async (req) => {
        const body = (await req.json().catch(() => ({}))) as {
          fileName?: string;
          approvedBy?: string;
        };
        const record = discovery.approveSpecification(body.fileName, body.approvedBy);
        return json(record);
      }),
    },

    "/api/studio/discovery/reset": {
      POST: safely(() => json(discovery.resetSession())),
    },

    "/api/studio/discovery/history": safely(() => json(discovery.getApprovalHistory())),

    // ── STUDIO CONFIGURATION ENDPOINTS ────────────────────────────────────

    "/api/studio/config": {
      GET: safely(() => json(configMgr.loadConfig())),
      POST: safely(async (req) => {
        const body = await req.json();
        return json(configMgr.saveConfig(body.config));
      }),
    },

    "/api/studio/rosters": safely(() => json(configMgr.listRosterPresets())),

    "/api/studio/rosters/save": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { name: string; config: any };
        return json({ ok: configMgr.saveNamedRoster(body.name, body.config) });
      }),
    },

    "/api/studio/rosters/apply": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { name: string };
        return json({ config: configMgr.applyRosterPreset(body.name) });
      }),
    },

    "/api/studio/env": {
      GET: safely(() => json(configMgr.getEnvStatus())),
      POST: safely(async (req) => {
        const body = (await req.json()) as { key: string; value: string };
        return json({ ok: configMgr.setEnvKey(body.key, body.value) });
      }),
    },

    // ── STUDIO WORKFLOW & LAUNCH ENDPOINTS ────────────────────────────────

    "/api/studio/workflows": safely(() => json(launcher.listWorkflows())),

    "/api/studio/launch": {
      POST: safely(async (req) => {
        const body = (await req.json()) as any;
        const liveRun = await launcher.launchWorkflow(body);
        return json(liveRun);
      }),
    },

    "/api/studio/runs/active": safely(() => json(launcher.getActiveRuns())),

    "/api/studio/runs/:run_id": safely((req) => {
      const runId = param(req, "run_id");
      const run = launcher.getRunState(runId);
      return run ? json(run) : notFound(`no run ${runId}`);
    }),

    "/api/studio/runs/:run_id/stop": {
      POST: safely((req) => {
        const runId = param(req, "run_id");
        return json({ ok: launcher.stopRun(runId) });
      }),
    },

    // ── VISUALIZER OBSERVABILITY ENDPOINTS ────────────────────────────────

    "/api/health": safely(() => {
      const db = getDb();
      return json({
        ok: true,
        db: db?.path ?? "no db yet",
        journal_mode: db?.journalMode ?? "none",
        sessions: db?.sessionCount() ?? 0,
      } satisfies HealthResponse);
    }),

    "/api/sessions": safely((req) => {
      const db = getDb();
      if (!db) return json([]);
      const includeArchived = new URL(req.url).searchParams.get("archived") === "true";
      return json(db.sessions(intQuery(req, "limit", 200), includeArchived));
    }),

    "/api/sessions/:adw_id": safely((req) => {
      const db = getDb();
      if (!db) return notFound("no database found");
      const detail = db.sessionDetail(param(req, "adw_id"));
      return detail ? json(detail) : notFound(`no session ${param(req, "adw_id")}`);
    }),

    "/api/sessions/:adw_id/archive": {
      POST: safely(async (req) => {
        const db = getDb();
        if (!db) return notFound("no database found");
        const adwId = param(req, "adw_id");
        if (!isSafeSegment(adwId)) return json({ error: "invalid adw_id" } satisfies ApiError, 400);
        const body = (await req.json().catch(() => ({}))) as { archived?: unknown };
        const archived = body.archived === undefined ? true : Boolean(body.archived);
        return db.setArchived(adwId, archived)
          ? json({ adw_id: adwId, archived })
          : notFound(`no session ${adwId}`);
      }),
    },

    "/api/sessions/:adw_id/events": safely((req) => {
      const db = getDb();
      if (!db) return json({ events: [], cursor: 0, has_more: false });
      return json(
        db.events(
          param(req, "adw_id"),
          intQuery(req, "after", 0),
          intQuery(req, "limit", 500),
        ),
      );
    }),

    "/api/sessions/:adw_id/envelopes": safely((req) => {
      const db = getDb();
      if (!db) return json([]);
      return json(db.envelopes(param(req, "adw_id")));
    }),

    "/api/sessions/:adw_id/gates": safely((req) => {
      const db = getDb();
      if (!db) return json([]);
      return json(db.gates(param(req, "adw_id")));
    }),

    "/api/sessions/:adw_id/agents/:agent/prompts": safely(async (req) => {
      const db = getDb();
      if (!db) return notFound("no database found");
      const adwId = param(req, "adw_id");
      const agent = param(req, "agent");
      if (!isSafeSegment(adwId) || !isSafeSegment(agent)) {
        return json({ error: "invalid adw_id or agent" } satisfies ApiError, 400);
      }
      if (!db.session(adwId)) return notFound(`no session ${adwId}`);

      const dir = resolve(db.sessionsDir, adwId, agent, "prompts");
      if (dir !== db.sessionsDir && !dir.startsWith(db.sessionsDir + sep)) {
        return json({ error: "invalid path" } satisfies ApiError, 400);
      }

      const read = async (name: string): Promise<string | null> => {
        const file = Bun.file(join(dir, `${name}.md`));
        return (await file.exists()) ? await file.text() : null;
      };
      return json({
        system: await read("system"),
        user: await read("user"),
      } satisfies AgentPrompts);
    }),
  },

  fetch(req) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS, PUT, DELETE",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/")) return notFound(`no route ${pathname}`);
    return serveStatic(req);
  },
});

console.log(`[studio] SSSF Studio API running at http://localhost:${server.port}`);
