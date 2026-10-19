/**
 * SSSF Studio Unified Server.
 *
 * Serves the unified control layer API and embedded visualizer observability data.
 */
import { existsSync, statSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { SssfDb } from "./db.ts";
import { ProjectManager } from "./project.ts";
import { DiscoveryEngine } from "./discovery.ts";
import { ConfigManager } from "./config.ts";
import { WorkflowLauncher } from "./launcher.ts";
import { ApprovalBook } from "./approvals.ts";
import { ProfileStore } from "./profiles.ts";
import type { AgentPrompts, ApiError, HealthResponse } from "../shared/types.ts";

function readPort(): number {
  const raw = process.env.STUDIO_PORT;
  if (!raw) return 4620;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("STUDIO_PORT must be a whole number between 1 and 65535.");
  }
  return value;
}

// Deliberately ignore a generic PORT variable. Some shells and test runners set
// PORT=0; binding a random port while Start-Crew and the browser use 4620 makes
// the app look reachable but rejects every state-changing request.
const PORT = readPort();
let listeningPort = PORT;
const FACTORY_ROOT = resolve(import.meta.dir, "..", "..");
const DIST_DIR = resolve(import.meta.dir, "..", "dist");

// Default target project directory is the factory workspace root
let savedTarget = FACTORY_ROOT;
try { const saved = JSON.parse(readFileSync(join(FACTORY_ROOT, ".sssf", "active-project.json"), "utf8")); if (typeof saved.path === "string" && existsSync(saved.path)) savedTarget = saved.path; } catch {}
const initialTargetDir = process.env.TARGET_DIR
  ? resolve(process.env.TARGET_DIR)
  : savedTarget;

console.log(`[studio] Factory root:  ${FACTORY_ROOT}`);
console.log(`[studio] Initial target: ${initialTargetDir}`);

const projectMgr = new ProjectManager(initialTargetDir, FACTORY_ROOT);
const discovery = new DiscoveryEngine(initialTargetDir);
const configMgr = new ConfigManager(initialTargetDir);
const approvalBook = new ApprovalBook(initialTargetDir);
const profiles = new ProfileStore(initialTargetDir);
const launcher = new WorkflowLauncher(initialTargetDir, approvalBook);

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
      "access-control-allow-methods": "GET, POST, OPTIONS, PUT, DELETE",
      "access-control-allow-headers": "content-type",
    },
  });
}

function notFound(message: string): Response {
  return json({ error: message } satisfies ApiError, 404);
}

function badRequest(message: string): Response {
  return json({ error: message } satisfies ApiError, 400);
}

function isAllowedOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) return false;
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    // The real bound port, not the requested one: STUDIO_PORT can be changed
    // and tests may bind an ephemeral port.
    return port === listeningPort || (parsed.protocol === "http:" && port === 5173);
  } catch {
    return false;
  }
}

function safely(
  handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      const url = new URL(req.url);
      if (!["localhost", "127.0.0.1"].includes(url.hostname)) return json({ error: "Invalid host" }, 403);
      const origin = req.headers.get("origin");
      if (origin && !isAllowedOrigin(origin)) {
        return json({ error: "This request must come from Crew Platform." }, 403);
      }
      if (req.headers.get("sec-fetch-site") === "cross-site") return json({ error: "Cross-site request rejected" }, 403);
      return await handler(req);
    } catch (error) {
      console.error(`[studio] ${req.method} ${new URL(req.url).pathname}:`, error);
      // 403-style errors from the approval gate should be 4xx, not 500.
      const msg = (error as Error).message || "internal error";
      const status = /approval|approve|withdraw/i.test(msg) ? 403 : 500;
      return json({ error: msg } satisfies ApiError, status);
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
  if (pathname.startsWith("/manuals/")) {
    const relative = pathname.slice("/manuals/".length);
    const base = resolve(FACTORY_ROOT, "docs");
    const path = resolve(base, relative);
    if (!path.startsWith(base + sep)) return notFound("invalid manual path");
    if (existsSync(path) && statSync(path).isFile()) return new Response(Bun.file(path));
    return notFound("manual not found");
  }

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
  hostname: "127.0.0.1",
  port: PORT,
  routes: {
    // ── STUDIO PROJECT ENDPOINTS ──────────────────────────────────────────

    "/api/studio/project": safely(() => json(projectMgr.getProjectInfo())),

    "/api/studio/project/select": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { path: string };
        if (discovery.getCurrentSession().isAnalyzing) return badRequest("Wait for the interviewer before switching projects.");
        if (launcher.getActiveRuns().some(r => r.status === "running" || r.status === "paused")) return badRequest("Stop the current job before switching projects.");
        const info = projectMgr.setTargetDir(body.path);
        discovery.setTargetDir(body.path);
        configMgr.setTargetDir(body.path);
        launcher.setTargetDir(body.path);
        approvalBook.setTargetDir(body.path);
        profiles.setTargetDir(body.path);
        activeDb?.close();
        activeDb = null;
        return json(info);
      }),
    },

    "/api/studio/project/deliverables": safely(() => json(projectMgr.getDeliverables())),

    "/api/studio/project/quality": {
      GET: safely(() => json(projectMgr.getQualityConfig())),
      POST: safely(async (req) => {
        const body = await req.json();
        return json(projectMgr.saveQualityConfig(body));
      }),
    },

    "/api/studio/project/create": {
      POST: safely(async req => {
        if (discovery.getCurrentSession().isAnalyzing) return badRequest("Wait for the interviewer before creating another project.");
        if (launcher.getActiveRuns().some(r => r.status === "running" || r.status === "paused")) return badRequest("Stop the current job before creating another project.");
        const body = await req.json() as { name: string };
        const info = projectMgr.createProject(body.name);
        discovery.setTargetDir(info.path); configMgr.setTargetDir(info.path);
        launcher.setTargetDir(info.path); approvalBook.setTargetDir(info.path); profiles.setTargetDir(info.path);
        activeDb?.close(); activeDb = null;
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
        return json(await discovery.answerQuestion(body.id, body.answer));
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
        const config = configMgr.applyRosterPreset(body.name);
        profiles.setTargetDir(projectMgr.getTargetDir());
        return json({ config });
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
        return json({ ok: launcher.stopRun(runId, "user-stop") });
      }),
    },

    "/api/studio/runs/:run_id/pause": {
      POST: safely((req) => {
        const runId = param(req, "run_id");
        return json({ ok: launcher.pauseRun(runId) });
      }),
    },

    "/api/studio/runs/:run_id/resume": {
      POST: safely((req) => {
        const runId = param(req, "run_id");
        return json({ ok: launcher.resumeRun(runId) });
      }),
    },

    // ── APPROVAL BOOK (server-side enforcement) ────────────────────────────

    "/api/studio/approvals": safely(() => json(approvalBook.list())),

    "/api/studio/approvals/:id": safely((req) => {
      const a = approvalBook.get(param(req, "id"));
      return a ? json(a) : notFound("approval not found");
    }),

    "/api/studio/approvals/create": {
      POST: safely(async (req) => {
        const body = (await req.json()) as {
          specMarkdown: string;
          specTitle: string;
          rawAttachment?: string;
          rawAttachmentName?: string;
          approvedBy: string;
          sections: { id: string; name: string }[];
          summary: {
            willHappen: string;
            willUse: string;
            willNotDo: string;
            timeEstimate: string;
            costEstimate: string;
            canUndo: string;
            cannotUndo: string;
          };
          workflowId: string;
          workflowName: string;
          promptPreview: string;
        };
        if (!body.specMarkdown?.trim()) return badRequest("spec is empty");
        if (!body.workflowId) return badRequest("workflowId is required");
        if (!body.approvedBy?.trim()) return badRequest("approvedBy is required");
        return json(approvalBook.approve(body));
      }),
    },

    "/api/studio/approvals/:id/withdraw": {
      POST: safely((req) => {
        const ok = approvalBook.withdraw(param(req, "id"));
        return json({ ok });
      }),
    },

    "/api/studio/approvals/:id/section": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { sectionId: string; confirmed: boolean };
        const updated = approvalBook.setSection(param(req, "id"), body.sectionId, body.confirmed);
        return updated ? json(updated) : notFound("approval not found");
      }),
    },

    // ── CONNECTION PROFILES ────────────────────────────────────────────────

    "/api/studio/profiles": {
      GET: safely(() => json(profiles.publicList())),
      POST: safely(async (req) => {
        const body = (await req.json()) as any;
        if (body.defaultTokenCap != null) {
          return json(profiles.setDefaultTokenCap(body.defaultTokenCap));
        }
        return json(profiles.upsert(body.profile));
      }),
    },

    "/api/studio/profiles/fetch-models": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { baseUrl: string; apiKey: string; role?: string; provider?: string };
        const res = await profiles.fetchModels(body.baseUrl, profiles.connectionKey(body));
        return json(res);
      }),
    },

    "/api/studio/profiles/apply-all": {
      POST: safely(async req => {
        const body = await req.json() as { role: string; provider: string };
        return json(profiles.applyToAll(body.role, body.provider));
      }),
    },

    "/api/studio/profiles/test": {
      POST: safely(async (req) => {
        const body = (await req.json()) as { baseUrl: string; model: string; apiKey: string; role?: string; provider?: string };
        const res = await profiles.testConnection({ ...body, apiKey: profiles.connectionKey(body) });
        return json(res);
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

    // ── STUDIO VERSION ENDPOINT ──────────────────────────────────────────

    "/api/version": safely(() => {
      return json({ name: 'C.R.E.W. Software', version: '1.0.0' });
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

listeningPort = server.port ?? PORT;
console.log(`[studio] Crew Platform API running at http://127.0.0.1:${server.port}`);
