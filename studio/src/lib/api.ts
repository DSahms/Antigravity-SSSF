/**
 * SSSF Studio Unified API Client.
 *
 * Provides typed methods for both SSSF Studio control layer and
 * visualizer observability endpoints.
 */
import type {
  AdwWorkflowInfo,
  ApprovalRecord,
  DiscoverySessionState,
  Envelope,
  EnvKeyStatus,
  Event,
  EventsPage,
  GateResult,
  HealthResponse,
  LaunchRequest,
  LiveRunState,
  NamedRosterPreset,
  SessionDetail,
  SessionSummary,
  SssfConfig,
  TargetProject,
} from "@shared/types.ts";
import type { EventRow, PromptsResponse } from "./types.ts";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Studio: Project & Stamping ──────────────────────────────────────────────

export const getProjectInfo = () => req<TargetProject>("/api/studio/project");

export const setTargetDir = (path: string) =>
  req<TargetProject>("/api/studio/project/select", {
    method: "POST",
    body: JSON.stringify({ path }),
  });

export const stampFactory = (force = false) =>
  req<{ success: boolean; log: string }>("/api/studio/project/stamp", {
    method: "POST",
    body: JSON.stringify({ force }),
  });

// ── Studio: Discovery ───────────────────────────────────────────────────────

export const getDiscoverySession = () =>
  req<DiscoverySessionState>("/api/studio/discovery/session");

export const analyzeDescription = (input: string) =>
  req<DiscoverySessionState>("/api/studio/discovery/analyze", {
    method: "POST",
    body: JSON.stringify({ input }),
  });

export const sendChatMessage = (message: string) =>
  req<DiscoverySessionState>("/api/studio/discovery/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });

export const acceptSuggestion = (id: string) =>
  req<DiscoverySessionState>("/api/studio/discovery/suggestion/accept", {
    method: "POST",
    body: JSON.stringify({ id }),
  });

export const rejectSuggestion = (id: string) =>
  req<DiscoverySessionState>("/api/studio/discovery/suggestion/reject", {
    method: "POST",
    body: JSON.stringify({ id }),
  });

export const answerQuestion = (id: string, answer: string) =>
  req<DiscoverySessionState>("/api/studio/discovery/question/answer", {
    method: "POST",
    body: JSON.stringify({ id, answer }),
  });

export const updateSpecMarkdown = (markdown: string) =>
  req<DiscoverySessionState>("/api/studio/discovery/spec", {
    method: "POST",
    body: JSON.stringify({ markdown }),
  });

export const approveSpecification = (fileName?: string, approvedBy?: string) =>
  req<ApprovalRecord>("/api/studio/discovery/approve", {
    method: "POST",
    body: JSON.stringify({ fileName, approvedBy }),
  });

export const resetDiscoverySession = () =>
  req<DiscoverySessionState>("/api/studio/discovery/reset", { method: "POST" });

export const getDiscoveryHistory = () =>
  req<ApprovalRecord[]>("/api/studio/discovery/history");

// ── Studio: Roster & Config ─────────────────────────────────────────────────

export const getRosterConfig = () =>
  req<{ config: SssfConfig; rawYaml: string }>("/api/studio/config");

export const saveRosterConfig = (config: SssfConfig) =>
  req<{ success: boolean; rawYaml: string }>("/api/studio/config", {
    method: "POST",
    body: JSON.stringify({ config }),
  });

export const getRosterPresets = () =>
  req<NamedRosterPreset[]>("/api/studio/rosters");

export const saveNamedRoster = (name: string, config: SssfConfig) =>
  req<{ ok: boolean }>("/api/studio/rosters/save", {
    method: "POST",
    body: JSON.stringify({ name, config }),
  });

export const applyRosterPreset = (name: string) =>
  req<{ config: SssfConfig }>("/api/studio/rosters/apply", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const getEnvStatus = () => req<EnvKeyStatus[]>("/api/studio/env");

export const setEnvKey = (key: string, value: string) =>
  req<{ ok: boolean }>("/api/studio/env", {
    method: "POST",
    body: JSON.stringify({ key, value }),
  });

// ── Studio: Workflows & Launcher ────────────────────────────────────────────

export const getWorkflows = () => req<AdwWorkflowInfo[]>("/api/studio/workflows");

export const launchWorkflow = (request: LaunchRequest) =>
  req<LiveRunState>("/api/studio/launch", {
    method: "POST",
    body: JSON.stringify(request),
  });

export const getActiveRuns = () => req<LiveRunState[]>("/api/studio/runs/active");

export const getRunState = (runId: string) =>
  req<LiveRunState>(`/api/studio/runs/${runId}`);

export const stopRun = (runId: string) =>
  req<{ ok: boolean }>(`/api/studio/runs/${runId}/stop`, { method: "POST" });

// ── Visualizer Observability Methods ────────────────────────────────────────

export async function fetchSessions(archived = false): Promise<SessionSummary[]> {
  return req<SessionSummary[]>(`/api/sessions?archived=${archived}`);
}

export async function fetchSession(adwId: string): Promise<SessionDetail> {
  const detail = await req<SessionDetail>(`/api/sessions/${encodeURIComponent(adwId)}`);
  return {
    session: detail.session,
    usage: detail.usage ?? { read: 0, written: 0 },
    phases: detail.phases ?? [],
    agents: detail.agents ?? [],
    envelopes: detail.envelopes ?? [],
    gate_results: detail.gate_results ?? [],
    processes: detail.processes ?? [],
  };
}

export async function fetchEvents(
  adwId: string,
  after = 0,
  limit = 500,
): Promise<EventsPage> {
  const page = await req<EventsPage | EventRow[]>(
    `/api/sessions/${encodeURIComponent(adwId)}/events?after=${after}&limit=${limit}`,
  );
  if (Array.isArray(page)) {
    const cursor = page.reduce((max, e) => Math.max(max, e.rowid), after);
    return { events: page as any, cursor, next_cursor: cursor, has_more: page.length === limit };
  }
  const cur = (page as any).cursor ?? (page as any).next_cursor ?? after;
  return {
    events: (page as any).events ?? [],
    cursor: cur,
    next_cursor: cur,
    has_more: page.has_more ?? false,
  };
}

export async function archiveSession(adwId: string, archived = true): Promise<void> {
  await req(`/api/sessions/${encodeURIComponent(adwId)}/archive`, {
    method: "POST",
    body: JSON.stringify({ archived }),
  });
}

export async function fetchHealth(): Promise<HealthResponse> {
  return req<HealthResponse>("/api/health");
}

export const getHealth = fetchHealth;

export type { PromptsResponse };

export async function fetchPrompts(adwId: string, agent: string): Promise<PromptsResponse> {
  try {
    const res = await fetch(
      `/api/sessions/${encodeURIComponent(adwId)}/agents/${encodeURIComponent(agent)}/prompts`,
    );
    if (res.status === 404) return { system: null, user: null };
    if (!res.ok) throw new Error(`GET prompts → ${res.status}`);
    const data = (await res.json()) as Partial<PromptsResponse>;
    return { system: data.system ?? null, user: data.user ?? null };
  } catch {
    return { system: null, user: null };
  }
}

export async function fetchEnvelopes(adwId: string): Promise<Envelope[]> {
  return req<Envelope[]>(`/api/sessions/${encodeURIComponent(adwId)}/envelopes`);
}

export async function fetchGates(adwId: string): Promise<GateResult[]> {
  return req<GateResult[]>(`/api/sessions/${encodeURIComponent(adwId)}/gates`);
}
