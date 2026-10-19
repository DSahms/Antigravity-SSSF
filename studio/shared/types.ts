/**
 * SSSF Studio – Shared types across Backend and Vue Frontend
 */

// ── Visualizer & SSSF Database Types ───────────────────────────────────────

export type SessionStatus = "running" | "success" | "fail";
export type PhaseStatus = "queued" | "running" | "success" | "fail";
export type PhaseKind = "engineer" | "code" | "agent";

export type EventType =
  | "phase_start"
  | "phase_end"
  | "agent_start"
  | "agent_end"
  | "tool_call"
  | "handoff"
  | "gate_pass"
  | "gate_fail"
  | "usage"
  | "log"
  | "error";

export interface Session {
  adw_id: string;
  adw_name: string | null;
  request: string | null;
  status: SessionStatus | null;
  engineer: string | null;
  started_at: string | null;
  ended_at: string | null;
  total_tokens: number | null;
  total_cost: number | null;
  archived: number | null;
}

export interface SessionSummary extends Session {
  phases: Phase[];
  phase_count: number;
  agents: AgentSession[];
}

export interface Phase {
  phase_id: string;
  adw_id: string;
  seq: number | null;
  name: string | null;
  kind: PhaseKind | null;
  owner: string | null;
  description: string | null;
  status: PhaseStatus | null;
  attempt: number | null;
  retries: number | null;
  error: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface Event {
  rowid: number;
  event_id: string;
  adw_id: string;
  phase_id: string | null;
  parent_id: string | null;
  type: EventType | null;
  name: string | null;
  payload_json: string | null;
  tokens: number | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface Envelope {
  envelope_id: string;
  adw_id: string;
  phase_id: string | null;
  agent: string | null;
  output_type: string | null;
  payload_json: string | null;
  valid: number | null;
  attempt: number | null;
  created_at: string | null;
}

export interface GateResult {
  id: number;
  adw_id: string;
  phase_id: string | null;
  attempt: number | null;
  gate: string | null;
  passed: number | null;
  violations_json: string | null;
  checks_json: string | null;
  created_at: string | null;
}

export interface ProcessRow {
  id: number;
  adw_id: string;
  kind: "adw" | "agent" | string;
  name: string;
  pid: number;
  command: string;
  started_at: string;
  ended_at: string | null;
}

export interface AgentSession {
  adw_id: string;
  agent: string;
  coding_agent: string | null;
  model: string | null;
  color: string | null;
  session_id: string | null;
  context_tokens: number | null;
  context_window: number | null;
  created_at: string | null;
  last_used_at: string | null;
}

export interface SessionUsage {
  read: number;
  written: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  total_tokens?: number;
}

export interface SessionDetail {
  session: Session;
  phases: Phase[];
  agents: AgentSession[];
  envelopes: Envelope[];
  gate_results: GateResult[];
  processes: ProcessRow[];
  usage?: SessionUsage;
}

export interface EventsPage {
  events: Event[];
  cursor: number;
  next_cursor?: number;
  has_more: boolean;
}

export interface GateCheck {
  item: string;
  ok: boolean;
  note: string;
}

export interface AgentStartPayload {
  model?: string;
  thinking?: string;
  session_id?: string;
  color?: string;
  coding_agent?: string;
  purpose?: string;
  tools?: string[] | null;
  harness_engineering?: string[];
}

export interface UsageBreakdown {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens?: number;
  total_tokens: number;
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
  cache_write_cost: number;
  total_cost: number;
}

export interface AgentEndPayload {
  cost?: number;
  usage?: UsageBreakdown;
  context_tokens?: number;
  context_window?: number;
}

export interface ToolCallPayload {
  tool?: string;
  tool_call_id?: string;
  args?: Record<string, unknown>;
  result_snippet?: string;
  ok?: boolean;
  duration_ms?: number;
  agent?: string;
}

export type PromptsResponse = AgentPrompts;

export interface AgentPrompts {
  system: string | null;
  user: string | null;
}

export interface HealthResponse {
  ok: boolean;
  db: string;
  journal_mode: string;
  sessions: number;
}

export interface ApiError {
  error: string;
}

// ── SSSF Studio Project & Control Layer Types ──────────────────────────────

export interface QualityConfig {
  test?: string[];
  lint?: string[];
  typecheck?: string[];
  build?: string[];
}

export interface ProjectQualityState {
  path: string;
  exists: boolean;
  config: QualityConfig | null;
  error?: string;
}

export interface DeliverableFile {
  path: string;
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface ProjectDeliverables {
  projectPath: string;
  specs: DeliverableFile[];
  changedFiles: string[];
}

export interface TargetProject {
  path: string;
  name: string;
  isStamped: boolean;
  hasConfig: boolean;
  hasDb: boolean;
  hasEnv: boolean;
  hasJustfile: boolean;
  gitBranch: string | null;
  approvedSpecs: ApprovedSpecSummary[];
  agentCount: number;
}

export interface ApprovedSpecSummary {
  filePath: string;
  fileName: string;
  title: string;
  sizeBytes: number;
  lastModified: string;
}

// ── Discovery Engine Types ──────────────────────────────────────────────────

export interface DiscoveryAnalysisItem {
  id: string;
  title: string;
  detail: string;
  severity?: "critical" | "high" | "medium" | "low";
}

export interface DiscoveryAmbiguityItem {
  id: string;
  term: string;
  explanation: string;
  suggestions?: string[];
}

export interface DiscoverySuggestionItem {
  id: string;
  title: string;
  description: string;
  status: "pending" | "accepted" | "rejected";
  patchMarkdown?: string;
}

export interface DiscoveryQuestionItem {
  id: string;
  question: string;
  answer?: string;
  choices?: string[];
  answered?: boolean;
}

export interface DiscoveryRiskItem {
  id: string;
  title: string;
  riskLevel: "critical" | "high" | "medium" | "low";
  mitigation: string;
}

export interface DiscoveryAnalysis {
  summary: string;
  missingRequirements: DiscoveryAnalysisItem[];
  ambiguities: DiscoveryAmbiguityItem[];
  suggestions: DiscoverySuggestionItem[];
  openQuestions: DiscoveryQuestionItem[];
  risks: DiscoveryRiskItem[];
}

export interface DiscoveryChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface DiscoverySessionState {
  ready?: boolean;
  id: string;
  title: string;
  rawInput: string;
  specMarkdown: string;
  analysis: DiscoveryAnalysis | null;
  chatHistory: DiscoveryChatMessage[];
  isAnalyzing: boolean;
}

export interface ApprovalRecord {
  id: string;
  timestamp: string;
  specTitle: string;
  savedFilePath: string;
  approvedBy: string;
  wordCount: number;
  summary: string;
  content: string;
}

// ── Roster & Config Types ───────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  model?: string;
  thinking?: string;
  color?: string;
  purpose: string;
  prompt_engineering: {
    system: string;
    user: string;
  };
  harness_engineering?: string[];
  writes?: string[];
  tools?: string[];
}

export interface RosterDefaults {
  coding_agent: string;
  model: string;
  thinking: string;
  tools: string[];
  protected_files: string[];
  data_dir: string;
}

export interface ObservabilityConfig {
  db: string;
  poll_ms: number;
}

export interface SssfConfig {
  defaults: RosterDefaults;
  observability: ObservabilityConfig;
  agents: AgentConfig[];
}

export interface NamedRosterPreset {
  name: string;
  description: string;
  tag: string;
  config: SssfConfig;
}

export interface EnvKeyStatus {
  key: string;
  isSet: boolean;
  maskedValue: string;
  requiredBy: string[];
  description: string;
}

// ── Launch & Workflows ──────────────────────────────────────────────────────

export interface AdwWorkflowInfo {
  id: string;
  scriptFile: string;
  name: string;
  description: string;
  phases: string[];
  requiredAgents: string[];
  recommendedWhen: string;
  badge?: string;
}

export interface LaunchRequest {
  workflowId: string;
  promptMode: "approved-spec" | "custom-text" | "file";
  specPath?: string;
  customPrompt?: string;
  configPath?: string;
  adwId?: string;
}

export interface LiveRunState {
  runId: string;
  adwId: string;
  workflowId: string;
  workflowName: string;
  status: "running" | "success" | "fail" | "stopped" | "paused";
  startedAt: string;
  endedAt?: string;
  pid?: number;
  exitCode?: number | null;
  promptPreview: string;
  logs: string[];
  currentPhase?: string;
  /** Approval that authorized this run. Always non-null for a real run. */
  approvalId?: string;
  /** Reason for a stopped run ("token-cap" | "user-stop" | "user-pause-resumed" | ...) */
  stopReason?: string;
  /** Live token usage, populated as the run progresses. */
  tokenUsage?: number;
  tokenCap?: number;
}

// ── Approval Book (server-side enforcement) ────────────────────────────────

export interface ApprovalSection {
  id: string;
  name: string;
  confirmed: boolean;
  confirmedAt?: string;
}

export interface ApprovalRecordV2 {
  executionHash?: string;
  id: string;
  specVersion: number;
  specHash: string;
  specMarkdown: string;
  specTitle: string;
  rawAttachment?: string;       // original uploaded/pasted text, verbatim
  rawAttachmentName?: string;
  approvedBy: string;
  approvedAt: string;
  withdrawnAt?: string;
  sections: ApprovalSection[];
  summary: {
    willHappen: string;
    willUse: string;
    willNotDo: string;
    timeEstimate: string;
    costEstimate: string;
    canUndo: string;
    cannotUndo: string;
  };
  /** Workflow + prompt the approval authorizes; the launcher checks these. */
  workflowId: string;
  workflowName: string;
  promptPreview: string;
}

export interface ApprovalBookSummary {
  id: string;
  specTitle: string;
  specVersion: number;
  approvedBy: string;
  approvedAt: string;
  withdrawnAt?: string;
  workflowId: string;
  workflowName: string;
}

// ── Connection Profiles ────────────────────────────────────────────────────

export type ProviderKind = "local" | "cloud";

export interface ConnectionProfile {
  role: string;
  label: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey: string;       // never logged; "none" for local
  reasoningLevel?: string;
  hideThinking?: boolean;
  /** Disabled profiles cannot be selected for a run. Local is always enabled. */
  disabled?: boolean;
}

export interface ConnectionProfileStore {
  selectedProviders?: Record<string, ProviderKind>;
  profiles: ConnectionProfile[];
  /** Per-job token cap default. */
  defaultTokenCap: number;
}

export interface FetchModelsResponse {
  models: string[];
  error?: string;
}

export interface TestConnectionResponse {
  ok: boolean;
  message: string;      // plain English, friendly
  detail?: string;      // raw error for diagnostics
}

export interface TokenGuardConfig {
  cap: number;          // 0 = no cap
  perJob: Record<string, number>;  // optional per-run override
}

// ── Drafts (New Job autosave) ──────────────────────────────────────────────

export interface NewJobDraft {
  id: string;
  savedAt: string;
  mode: "talk" | "upload" | "paste";
  text: string;          // talk textarea or pasted text or uploaded file text
  fileName?: string;     // uploaded file name
  specMarkdown: string; // current working spec
  sections?: { id: string; name: string; body: string }[];
}
