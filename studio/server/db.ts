/**
 * SQLite reader for SSSF Studio over a target repo's sssf.db.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type {
  AgentSession,
  Envelope,
  Event,
  EventsPage,
  GateResult,
  Phase,
  ProcessRow,
  Session,
  SessionDetail,
  SessionSummary,
  SessionUsage,
} from "../shared/types.ts";

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export class SssfDb {
  readonly path: string;
  readonly sessionsDir: string;
  readonly journalMode: string;
  private readonly db: Database;
  private writer: Database | null = null;
  private readonly columnCache = new Map<string, boolean>();

  constructor(path: string) {
    if (!existsSync(path)) {
      throw new Error(`sssf.db not found at ${path}`);
    }
    this.path = path;
    this.sessionsDir = resolve(dirname(path), "sessions");
    this.db = new Database(path, { readonly: true });

    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA synchronous = NORMAL");
    const mode = this.db
      .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
      .get();
    this.journalMode = mode?.journal_mode ?? "unknown";
  }

  private hasColumn(table: string, column: string): boolean {
    const key = `${table}.${column}`;
    if (!this.columnCache.get(key)) {
      const cols = this.db
        .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
        .all();
      this.columnCache.set(key, cols.some((c) => c.name === column));
    }
    return this.columnCache.get(key) ?? false;
  }

  private optionalColumn(table: string, column: string): string {
    return this.hasColumn(table, column) ? column : `NULL AS ${column}`;
  }

  close(): void {
    try {
      this.writer?.close();
    } catch {}
    try {
      this.db.close();
    } catch {}
  }

  setArchived(adwId: string, archived: boolean): boolean {
    if (!this.hasColumn("sessions", "archived")) {
      return false;
    }
    if (!this.writer) {
      this.writer = new Database(this.path);
      this.writer.exec("PRAGMA busy_timeout=5000;");
    }
    this.writer
      .query("UPDATE sessions SET archived = ? WHERE adw_id = ?")
      .run(archived ? 1 : 0, adwId);
    return this.session(adwId) !== null;
  }

  sessions(limit = 200, includeArchived = false): SessionSummary[] {
    const archiveCondition = includeArchived
      ? "1=1"
      : `COALESCE(${this.hasColumn("sessions", "archived") ? "archived" : "0"}, 0) = 0`;

    const rows = this.db
      .query<Session, [number]>(
        `SELECT adw_id, ${this.optionalColumn("sessions", "adw_name")}, request,
                status, engineer, started_at, ended_at,
                total_tokens, total_cost,
                ${this.optionalColumn("sessions", "archived")}
           FROM sessions
          WHERE ${archiveCondition}
          ORDER BY started_at DESC, rowid DESC
          LIMIT ?`,
      )
      .all(clamp(limit, 1, MAX_LIMIT));

    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.adw_id);
    const placeholders = ids.map(() => "?").join(", ");
    const phaseRows = this.db
      .query<Phase, string[]>(
        `SELECT phase_id, adw_id, seq, name, kind, owner, description, status,
                attempt, retries, error, started_at, ended_at
           FROM phases WHERE adw_id IN (${placeholders}) ORDER BY seq, rowid`,
      )
      .all(...ids);

    const byAdw = new Map<string, Phase[]>();
    for (const phase of phaseRows) {
      const list = byAdw.get(phase.adw_id);
      if (list) list.push(phase);
      else byAdw.set(phase.adw_id, [phase]);
    }

    const agentsByAdw = this.agentsFor(ids);

    const summaries: SessionSummary[] = [];
    for (const session of rows) {
      const phases = byAdw.get(session.adw_id) ?? [];
      summaries.push({
        ...session,
        phases,
        phase_count: phases.length,
        agents: agentsByAdw.get(session.adw_id) ?? [],
      });
    }
    return summaries;
  }

  session(adwId: string): Session | null {
    return (
      this.db
        .query<Session, [string]>(
          `SELECT adw_id, ${this.optionalColumn("sessions", "adw_name")}, request,
                  status, engineer, started_at, ended_at,
                  total_tokens, total_cost,
                  ${this.optionalColumn("sessions", "archived")}
             FROM sessions WHERE adw_id = ?`,
        )
        .get(adwId) ?? null
    );
  }

  phases(adwId: string): Phase[] {
    return this.db
      .query<Phase, [string]>(
        `SELECT phase_id, adw_id, seq, name, kind, owner, description, status,
                attempt, retries, error, started_at, ended_at
           FROM phases WHERE adw_id = ? ORDER BY seq, rowid`,
      )
      .all(adwId);
  }

  agentSessions(adwId: string): AgentSession[] {
    return this.agentsFor([adwId]).get(adwId) ?? [];
  }

  private agentsFor(adwIds: string[]): Map<string, AgentSession[]> {
    const byAdw = new Map<string, AgentSession[]>();
    if (adwIds.length === 0) return byAdw;
    const placeholders = adwIds.map(() => "?").join(", ");

    const append = (adwId: string, agent: AgentSession) => {
      const list = byAdw.get(adwId);
      if (list) list.push(agent);
      else byAdw.set(adwId, [agent]);
    };

    const color = this.optionalColumn("agent_sessions", "color");
    const ctxUsed = this.optionalColumn("agent_sessions", "context_tokens");
    const ctxWindow = this.optionalColumn("agent_sessions", "context_window");

    const completed = this.db
      .query<AgentSession, string[]>(
        `SELECT adw_id, agent, coding_agent, model, session_id, ${color},
                ${ctxUsed}, ${ctxWindow}, created_at, last_used_at
           FROM agent_sessions WHERE adw_id IN (${placeholders})
          ORDER BY created_at, agent`,
      )
      .all(...adwIds);
    for (const row of completed) append(row.adw_id, row);

    const started = this.db
      .query<
        {
          adw_id: string;
          agent: string | null;
          payload_json: string | null;
          started_at: string | null;
        },
        string[]
      >(
        `SELECT e.adw_id, p.owner AS agent, e.payload_json, e.started_at
           FROM events e JOIN phases p ON p.phase_id = e.phase_id
          WHERE e.adw_id IN (${placeholders}) AND e.type = 'agent_start'
          ORDER BY e.rowid`,
      )
      .all(...adwIds);

    for (const row of started) {
      if (!row.agent) continue;
      if (byAdw.get(row.adw_id)?.some((a) => a.agent === row.agent)) continue;
      let payload: Record<string, any> = {};
      try {
        payload = JSON.parse(row.payload_json ?? "{}");
      } catch {}
      append(row.adw_id, {
        adw_id: row.adw_id,
        agent: row.agent,
        coding_agent: null,
        model: payload.model ?? null,
        session_id: payload.session_id ?? null,
        color: payload.color ?? null,
        context_tokens: null,
        context_window: null,
        created_at: row.started_at,
        last_used_at: row.started_at,
      });
    }
    return byAdw;
  }

  sessionDetail(adwId: string): SessionDetail | null {
    const session = this.session(adwId);
    if (!session) return null;

    return {
      session,
      usage: this.usage(adwId),
      phases: this.phases(adwId),
      agents: this.agentSessions(adwId),
      envelopes: this.envelopes(adwId),
      gate_results: this.gates(adwId),
      processes: this.processes(adwId),
    };
  }

  usage(adwId: string): SessionUsage {
    const rows = this.db
      .query<{ payload_json: string | null }, [string]>(
        "SELECT payload_json FROM events WHERE adw_id = ? AND type = 'agent_end'",
      )
      .all(adwId);

    let read = 0;
    let written = 0;
    for (const row of rows) {
      if (!row.payload_json) continue;
      try {
        const p = JSON.parse(row.payload_json);
        const u = p.usage;
        if (u) {
          read += (u.input_tokens ?? 0) + (u.cache_write_tokens ?? 0);
          written += u.output_tokens ?? 0;
        }
      } catch {}
    }
    return { read, written };
  }

  events(adwId: string, after = 0, limit = DEFAULT_LIMIT): EventsPage {
    const cappedLimit = clamp(limit, 1, MAX_LIMIT);
    const events = this.db
      .query<Event, [string, number, number]>(
        `SELECT rowid, event_id, adw_id, phase_id, parent_id, type, name,
                payload_json, tokens, started_at, ended_at
           FROM events
          WHERE adw_id = ? AND rowid > ?
          ORDER BY rowid
          LIMIT ?`,
      )
      .all(adwId, Math.max(0, after), cappedLimit);

    return {
      events,
      cursor: events.length > 0 ? events[events.length - 1]!.rowid : Math.max(0, after),
      has_more: events.length === cappedLimit,
    };
  }

  envelopes(adwId: string): Envelope[] {
    return this.db
      .query<Envelope, [string]>(
        `SELECT envelope_id, adw_id, phase_id, agent, output_type, payload_json,
                valid, attempt, created_at
           FROM envelopes WHERE adw_id = ? ORDER BY created_at, rowid`,
      )
      .all(adwId);
  }

  gates(adwId: string): GateResult[] {
    const checks = this.optionalColumn("gate_results", "checks_json");
    return this.db
      .query<GateResult, [string]>(
        `SELECT id, adw_id, phase_id, attempt, gate, passed, violations_json,
                ${checks}, created_at
           FROM gate_results WHERE adw_id = ? ORDER BY id`,
      )
      .all(adwId);
  }

  processes(adwId: string): ProcessRow[] {
    if (!this.hasColumn("processes", "pid")) return [];
    return this.db
      .query<ProcessRow, [string]>(
        `SELECT id, adw_id, kind, name, pid, command, started_at, ended_at
           FROM processes WHERE adw_id = ? ORDER BY id`,
      )
      .all(adwId);
  }

  sessionCount(): number {
    const row = this.db
      .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM sessions")
      .get();
    return row?.n ?? 0;
  }
}
