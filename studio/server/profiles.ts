/**
 * Connection Profile Store — one saved profile per agent role.
 *
 * The "local" profile points at a KoboldCpp server at 127.0.0.1:5001 and
 * is the default for all roles and for all testing. The "cloud" profile
 * uses Venice AI; it is disabled until a `VENICE_API_KEY` exists in .env.
 *
 * Profiles live in `<target>/.sssf/profiles.json` (gitignored). API keys
 * are never logged.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ConnectionProfile,
  ConnectionProfileStore,
  FetchModelsResponse,
  TestConnectionResponse,
} from "../shared/types.ts";

const DEFAULT_LOCAL_URL = "http://127.0.0.1:5001/v1";
const DEFAULT_LOCAL_MODEL = "koboldcpp/default";
const DEFAULT_TOKEN_CAP = 20_000;

const KNOWN_ROLES: { role: string; label: string }[] = [
  { role: "planner", label: "Planner" },
  { role: "builder", label: "Builder" },
  { role: "scout", label: "Scout" },
  { role: "reviewer", label: "Reviewer" },
  { role: "documenter", label: "Documenter" },
  // Generic roles per the mission:
  { role: "interviewer", label: "Interviewer" },
  { role: "researcher", label: "Researcher" },
  { role: "specialist", label: "Specialist" },
  { role: "validator", label: "Validator" },
  { role: "scrutiny", label: "Scrutiny" },
];

export class ProfileStore {
  private dir: string;
  private file: string;
  private state: ConnectionProfileStore | null = null;

  constructor(targetDir: string) {
    this.dir = join(targetDir, ".sssf");
    this.file = join(this.dir, "profiles.json");
    this.load();
  }

  setTargetDir(targetDir: string) {
    this.dir = join(targetDir, ".sssf");
    this.file = join(this.dir, "profiles.json");
    this.load();
  }

  private load() {
    try {
      if (existsSync(this.file)) {
        const raw = readFileSync(this.file, "utf-8");
        this.state = JSON.parse(raw);
      }
    } catch (e) {
      console.error("[profiles] failed to load store:", e);
      this.state = null;
    }
    if (!this.state) this.state = this.seedDefaults();
    // Always ensure cloud profiles are disabled if no key present.
    this.syncCloudDisabled();
  }

  private persist() {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state, null, 2), "utf-8");
  }

  private seedDefaults(): ConnectionProfileStore {
    const profiles: ConnectionProfile[] = KNOWN_ROLES.map((r) => ({
      role: r.role,
      label: r.label,
      provider: "local",
      baseUrl: DEFAULT_LOCAL_URL,
      model: DEFAULT_LOCAL_MODEL,
      apiKey: "none",
      reasoningLevel: "off",
      hideThinking: false,
      disabled: false,
    }));
    // Add cloud variants (disabled by default until key exists)
    for (const r of KNOWN_ROLES) {
      profiles.push({
        role: r.role,
        label: `${r.label} (cloud)`,
        provider: "cloud",
        baseUrl: "https://api.venice.ai/api/v1",
        model: "llama-3.3-70b",
        apiKey: "", // read from .env at runtime
        reasoningLevel: "off",
        hideThinking: false,
        disabled: true,
      });
    }
    return { profiles, defaultTokenCap: DEFAULT_TOKEN_CAP };
  }

  /** Disable cloud profiles when no VENICE_API_KEY is in .env or process.env. */
  private syncCloudDisabled() {
    if (!this.state) return;
    const hasKey = Boolean(readVeniceKey(this.dir));
    for (const p of this.state.profiles) {
      if (p.provider === "cloud") {
        p.disabled = !hasKey;
        // Inject the key into the in-memory copy if present
        if (hasKey) p.apiKey = readVeniceKey(this.dir) ?? "";
      }
    }
  }

  list(): ConnectionProfileStore {
    this.syncCloudDisabled();
    return this.state!;
  }

  upsert(profile: ConnectionProfile): ConnectionProfileStore {
    if (!this.state) this.state = this.seedDefaults();
    const idx = this.state.profiles.findIndex(
      (p) => p.role === profile.role && p.provider === profile.provider,
    );
    if (idx >= 0) this.state.profiles[idx] = { ...profile, apiKey: maskOrKeep(profile.apiKey, this.state.profiles[idx].apiKey) };
    else this.state.profiles.push(profile);
    this.syncCloudDisabled();
    this.persist();
    return this.state;
  }

  setDefaultTokenCap(cap: number) {
    if (!this.state) this.state = this.seedDefaults();
    this.state.defaultTokenCap = Math.max(0, Math.floor(cap));
    this.persist();
    return this.state;
  }

  /** Fetch models from `${baseUrl}/models` (OpenAI-compatible). */
  async fetchModels(baseUrl: string, apiKey: string): Promise<FetchModelsResponse> {
    try {
      const url = baseUrl.replace(/\/+$/, "") + "/models";
      const headers: Record<string, string> = {};
      if (apiKey && apiKey !== "none") headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        return { models: [], error: plainHttpError(res.status, res.statusText) };
      }
      const data = await res.json() as any;
      const models: string[] = (data?.data ?? data?.models ?? [])
        .map((m: any) => (typeof m === "string" ? m : m?.id))
        .filter(Boolean);
      return { models };
    } catch (e: any) {
      return { models: [], error: plainNetError(e) };
    }
  }

  /** Test a connection with a tiny chat completion. Plain-English errors. */
  async testConnection(p: {
    baseUrl: string;
    model: string;
    apiKey: string;
  }): Promise<TestConnectionResponse> {
    const key = (p.apiKey || "").trim();
    try {
      const url = p.baseUrl.replace(/\/+$/, "") + "/chat/completions";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key && key !== "none") headers["Authorization"] = `Bearer ${key}`;
      const body = {
        model: p.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 4,
        temperature: 0,
      };
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: "Key rejected by the server.", detail: `HTTP ${res.status}` };
      }
      if (res.status === 404) {
        return { ok: false, message: "That URL exists but doesn't look like a chat endpoint. Check the model id and base URL.", detail: "HTTP 404" };
      }
      if (res.status >= 500) {
        return { ok: false, message: "The server is up but returned an error. Try again in a moment.", detail: `HTTP ${res.status}` };
      }
      if (!res.ok) {
        return { ok: false, message: plainHttpError(res.status, res.statusText) };
      }
      const data = await res.json() as any;
      const content = data?.choices?.[0]?.message?.content ?? "";
      return {
        ok: true,
        message: `Connected. Model "${p.model}" replied: "${String(content).slice(0, 40) || "ok"}"`,
      };
    } catch (e: any) {
      return { ok: false, message: plainNetError(e) };
    }
  }
}

function readVeniceKey(ssfDir: string): string | null {
  // .sssf is at <target>/.sssf; .env is at <target>/.env
  const envPath = join(ssfDir, "..", ".env");
  if (!existsSync(envPath)) return process.env.VENICE_API_KEY || null;
  const text = readFileSync(envPath, "utf-8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i !== -1 && t.slice(0, i).trim() === "VENICE_API_KEY") {
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      return v || null;
    }
  }
  return process.env.VENICE_API_KEY || null;
}

/**
 * Never overwrite a real key with a masked placeholder string from the UI.
 * If the UI sends a masked value (starts with "••••"), keep the existing key.
 */
function maskOrKeep(incoming: string, existing: string): string {
  if (incoming && incoming.startsWith("••••")) return existing;
  return incoming.trim();
}

function plainHttpError(status: number, statusText: string): string {
  switch (status) {
    case 0: return "Couldn't reach the URL. Is the server running?";
    case 400: return "Server rejected the request as malformed.";
    case 401:
    case 403: return "Key rejected by the server.";
    case 404: return "URL not found. Check the base URL and model id.";
    case 429: return "Rate limited. Wait a moment and try again.";
    default: return `Server returned HTTP ${status} ${statusText}`;
  }
}

function plainNetError(e: any): string {
  const msg = e?.message ?? String(e);
  if (msg.includes("fetch failed") || msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED")) {
    return "Can't reach that URL. Is the server running and the address correct?";
  }
  if (msg.includes("timeout") || msg.includes("Timeout")) {
    return "Took too long to answer. Try a smaller model or a closer server.";
  }
  return `That didn't work. Here's what to try: ${msg.slice(0, 200)}`;
}
