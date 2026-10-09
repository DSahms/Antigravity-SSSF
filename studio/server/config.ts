/**
 * SSSF Roster Configuration and .env API Key Manager.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse, stringify } from "yaml";
import type {
  AgentConfig,
  EnvKeyStatus,
  NamedRosterPreset,
  SssfConfig,
} from "../shared/types.ts";

const KNOWN_API_KEYS: Record<
  string,
  { description: string; requiredBy: string[] }
> = {
  OPENROUTER_API_KEY: {
    description: "Multi-provider gateway for Google, Anthropic, Meta, DeepSeek models",
    requiredBy: ["openrouter/*", "google/*"],
  },
  OPENAI_API_KEY: {
    description: "Direct OpenAI API key for GPT-4o, GPT-5 series",
    requiredBy: ["openai/*"],
  },
  FIREWORKS_API_KEY: {
    description: "Fireworks AI API key for fast inference & Kimi-K3",
    requiredBy: ["fireworks/*"],
  },
  ANTHROPIC_API_KEY: {
    description: "Direct Anthropic API key for Claude 3.7 Sonnet, Haiku",
    requiredBy: ["anthropic/*"],
  },
  GEMINI_API_KEY: {
    description: "Google AI Studio API key for native Gemini calls",
    requiredBy: ["google/*", "gemini/*"],
  },
};

const DEFAULT_PRESETS: NamedRosterPreset[] = [
  {
    name: "Factory Default",
    tag: "default",
    description: "The balanced starter roster shipped with SSSF (Gemini Flash, Kimi K3, GPT 5.6)",
    config: {
      defaults: {
        coding_agent: "pi",
        model: "google/gemini-3.6-flash",
        thinking: "medium",
        tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
        protected_files: ["adws/adw_modules/", "adws/adw_sssf_config/", "adws/adw_*.py"],
        data_dir: "adws/adw_data",
      },
      observability: {
        db: "adws/adw_data/sssf.db",
        poll_ms: 500,
      },
      agents: [
        {
          name: "planner",
          model: "fireworks/accounts/fireworks/models/kimi-k3",
          thinking: "high",
          color: "#a78bfa",
          purpose: "Turn a request into a plan the builder can implement without asking questions.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/planner/system.md",
            user: "adws/adw_data/prompt_engineering/planner/user.md",
          },
          harness_engineering: ["adws/adw_data/harness_engineering/subagents.ts"],
          writes: ["specs/"],
          tools: ["read", "grep", "find", "ls", "bash", "write", "subagent_create", "subagent_continue", "subagent_list", "subagent_remove"],
        },
        {
          name: "builder",
          color: "#22d3ee",
          purpose: "Implement the plan exactly; report every changed file in the envelope.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/builder/system.md",
            user: "adws/adw_data/prompt_engineering/builder/user.md",
          },
          tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
        },
        {
          name: "scout",
          color: "#fbbf24",
          purpose: "Find and report where things live; change nothing.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/scout/system.md",
            user: "adws/adw_data/prompt_engineering/scout/user.md",
          },
          harness_engineering: ["adws/adw_data/harness_engineering/subagents.ts"],
          writes: [],
          tools: ["read", "grep", "find", "ls", "bash", "write", "subagent_create", "subagent_continue", "subagent_list", "subagent_remove"],
        },
        {
          name: "reviewer",
          model: "openai/gpt-5.6-terra",
          thinking: "high",
          color: "#fb7185",
          purpose: "Confirm that what was built is what was asked for; change nothing.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/reviewer/system.md",
            user: "adws/adw_data/prompt_engineering/reviewer/user.md",
          },
          writes: [],
          tools: ["read", "grep", "find", "ls", "bash", "write"],
        },
        {
          name: "documenter",
          model: "openai/gpt-5.6-luna",
          color: "#e879f9",
          purpose: "Write up the change that was just made, from the diff; document only.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/documenter/system.md",
            user: "adws/adw_data/prompt_engineering/documenter/user.md",
          },
          writes: ["app_docs/", "docs/", "**/*.md", "*.md"],
          tools: ["read", "grep", "find", "ls", "bash", "write", "edit"],
        },
      ],
    },
  },
  {
    name: "Frontier Reasoning Roster",
    tag: "frontier",
    description: "Maximum reasoning depth for complex architectural refactors (Sonnet 3.7 + GPT-5)",
    config: {
      defaults: {
        coding_agent: "pi",
        model: "openrouter/anthropic/claude-3.7-sonnet",
        thinking: "high",
        tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
        protected_files: ["adws/adw_modules/", "adws/adw_sssf_config/", "adws/adw_*.py"],
        data_dir: "adws/adw_data",
      },
      observability: {
        db: "adws/adw_data/sssf.db",
        poll_ms: 500,
      },
      agents: [
        {
          name: "planner",
          model: "openrouter/anthropic/claude-3.7-sonnet:thinking",
          thinking: "xhigh",
          color: "#a78bfa",
          purpose: "Deep reasoning architect; rigorously designs clean contracts and implementation blueprints.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/planner/system.md",
            user: "adws/adw_data/prompt_engineering/planner/user.md",
          },
          writes: ["specs/"],
          tools: ["read", "grep", "find", "ls", "bash", "write"],
        },
        {
          name: "builder",
          model: "openrouter/anthropic/claude-3.7-sonnet",
          thinking: "medium",
          color: "#22d3ee",
          purpose: "Executes precise, idiomatic code modifications adhering to plan specs.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/builder/system.md",
            user: "adws/adw_data/prompt_engineering/builder/user.md",
          },
          tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
        },
        {
          name: "scout",
          model: "openrouter/google/gemini-2.5-flash",
          color: "#fbbf24",
          purpose: "Fast wide search across large codebases without modifying files.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/scout/system.md",
            user: "adws/adw_data/prompt_engineering/scout/user.md",
          },
          writes: [],
          tools: ["read", "grep", "find", "ls", "bash", "write"],
        },
        {
          name: "reviewer",
          model: "openrouter/openai/gpt-4o",
          thinking: "high",
          color: "#fb7185",
          purpose: "Independent critical audit of diff against approved specification.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/reviewer/system.md",
            user: "adws/adw_data/prompt_engineering/reviewer/user.md",
          },
          writes: [],
          tools: ["read", "grep", "find", "ls", "bash", "write"],
        },
        {
          name: "documenter",
          model: "openrouter/google/gemini-2.5-flash",
          color: "#e879f9",
          purpose: "Generates developer-facing and user-facing changelogs and docs.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/documenter/system.md",
            user: "adws/adw_data/prompt_engineering/documenter/user.md",
          },
          writes: ["app_docs/", "docs/", "**/*.md"],
          tools: ["read", "grep", "find", "ls", "bash", "write", "edit"],
        },
      ],
    },
  },
  {
    name: "Rapid Economy Roster",
    tag: "economy",
    description: "Ultra-fast, lowest token cost per turn (Gemini 2.5 Flash & Haiku 3.5)",
    config: {
      defaults: {
        coding_agent: "pi",
        model: "openrouter/google/gemini-2.5-flash",
        thinking: "low",
        tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
        protected_files: ["adws/adw_modules/", "adws/adw_sssf_config/", "adws/adw_*.py"],
        data_dir: "adws/adw_data",
      },
      observability: {
        db: "adws/adw_data/sssf.db",
        poll_ms: 500,
      },
      agents: [
        {
          name: "planner",
          model: "openrouter/google/gemini-2.5-flash",
          thinking: "medium",
          color: "#a78bfa",
          purpose: "Produces rapid implementation tasks.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/planner/system.md",
            user: "adws/adw_data/prompt_engineering/planner/user.md",
          },
          writes: ["specs/"],
          tools: ["read", "grep", "find", "ls", "bash", "write"],
        },
        {
          name: "builder",
          model: "openrouter/google/gemini-2.5-flash",
          color: "#22d3ee",
          purpose: "Fast code generator.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/builder/system.md",
            user: "adws/adw_data/prompt_engineering/builder/user.md",
          },
          tools: ["read", "grep", "find", "ls", "bash", "edit", "write"],
        },
        {
          name: "scout",
          model: "openrouter/google/gemini-2.5-flash",
          color: "#fbbf24",
          purpose: "High-speed repo exploration.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/scout/system.md",
            user: "adws/adw_data/prompt_engineering/scout/user.md",
          },
          writes: [],
          tools: ["read", "grep", "find", "ls", "bash", "write"],
        },
        {
          name: "reviewer",
          model: "openrouter/google/gemini-2.5-flash",
          color: "#fb7185",
          purpose: "Quick sanity checks on changes.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/reviewer/system.md",
            user: "adws/adw_data/prompt_engineering/reviewer/user.md",
          },
          writes: [],
          tools: ["read", "grep", "find", "ls", "bash", "write"],
        },
        {
          name: "documenter",
          model: "openrouter/google/gemini-2.5-flash",
          color: "#e879f9",
          purpose: "Quick doc updates.",
          prompt_engineering: {
            system: "adws/adw_data/prompt_engineering/documenter/system.md",
            user: "adws/adw_data/prompt_engineering/documenter/user.md",
          },
          writes: ["docs/"],
          tools: ["read", "grep", "find", "ls", "bash", "write", "edit"],
        },
      ],
    },
  },
];

export class ConfigManager {
  private targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  setTargetDir(dir: string): void {
    this.targetDir = dir;
  }

  getConfigPath(): string {
    return join(this.targetDir, "adws", "adw_sssf_config", "sssf.config.yaml");
  }

  loadConfig(): { config: SssfConfig; rawYaml: string } {
    const configPath = this.getConfigPath();
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found at ${configPath}`);
    }

    const rawYaml = readFileSync(configPath, "utf-8");
    const parsed = parse(rawYaml) as SssfConfig;

    if (!parsed || !parsed.agents) {
      throw new Error("Invalid sssf.config.yaml: missing agents definition");
    }

    return {
      config: parsed,
      rawYaml,
    };
  }

  saveConfig(config: SssfConfig): { success: boolean; rawYaml: string } {
    this.validateConfig(config);

    const configPath = this.getConfigPath();
    const yamlString = stringify(config, {
      indent: 2,
      lineWidth: 120,
    });

    const header = `# sssf.config.yaml — SSSF Agent Roster (Managed by SSSF Studio)
# One agent, one prompt, one purpose.
`;

    writeFileSync(configPath, header + yamlString, "utf-8");

    return {
      success: true,
      rawYaml: header + yamlString,
    };
  }

  validateConfig(config: SssfConfig): void {
    if (!config.defaults?.model || !config.defaults.model.includes("/")) {
      throw new Error(
        `Default model "${config.defaults?.model}" must be written as provider/model-id (e.g. google/gemini-3.6-flash)`,
      );
    }

    const validThinking = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
    if (config.defaults?.thinking && !validThinking.includes(config.defaults.thinking)) {
      throw new Error(`Invalid default thinking level: ${config.defaults.thinking}`);
    }

    if (!Array.isArray(config.agents) || config.agents.length === 0) {
      throw new Error("Roster must configure at least one agent.");
    }

    const seen = new Set<string>();
    for (const a of config.agents) {
      if (!a.name || seen.has(a.name)) {
        throw new Error(`Duplicate or empty agent name: "${a.name}"`);
      }
      seen.add(a.name);

      if (a.model && !a.model.includes("/")) {
        throw new Error(
          `Agent "${a.name}" model "${a.model}" must be written as provider/model-id`,
        );
      }
      if (a.thinking && !validThinking.includes(a.thinking)) {
        throw new Error(`Agent "${a.name}" invalid thinking level: ${a.thinking}`);
      }
    }
  }

  listRosterPresets(): NamedRosterPreset[] {
    const rostersDir = join(this.targetDir, "adws", "adw_sssf_config", "rosters");
    const customPresets: NamedRosterPreset[] = [];

    if (existsSync(rostersDir)) {
      try {
        const files = readdirSync(rostersDir);
        for (const file of files) {
          if (file.endsWith(".yaml") || file.endsWith(".yml")) {
            const filePath = join(rostersDir, file);
            try {
              const content = readFileSync(filePath, "utf-8");
              const cfg = parse(content) as SssfConfig;
              if (cfg?.agents) {
                const name = basename(file).replace(/\.(yaml|yml)$/, "");
                customPresets.push({
                  name,
                  tag: "custom",
                  description: `Custom saved roster from ${file}`,
                  config: cfg,
                });
              }
            } catch {}
          }
        }
      } catch {}
    }

    return [...DEFAULT_PRESETS, ...customPresets];
  }

  saveNamedRoster(name: string, config: SssfConfig): boolean {
    this.validateConfig(config);
    const rostersDir = join(this.targetDir, "adws", "adw_sssf_config", "rosters");
    if (!existsSync(rostersDir)) {
      mkdirSync(rostersDir, { recursive: true });
    }

    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const filePath = join(rostersDir, `${safeName}.yaml`);

    const yamlString = stringify(config, { indent: 2, lineWidth: 120 });
    writeFileSync(filePath, `# SSSF Custom Roster Preset: ${name}\n` + yamlString, "utf-8");
    return true;
  }

  applyRosterPreset(nameOrTag: string): SssfConfig {
    const presets = this.listRosterPresets();
    const matched = presets.find((p) => p.name.toLowerCase() === nameOrTag.toLowerCase() || p.tag.toLowerCase() === nameOrTag.toLowerCase());

    if (!matched) {
      throw new Error(`Roster preset not found: ${nameOrTag}`);
    }

    this.saveConfig(matched.config);
    return matched.config;
  }

  // ── .env API Key Management ───────────────────────────────────────────────

  getEnvStatus(): EnvKeyStatus[] {
    const envPath = join(this.targetDir, ".env");
    const envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";

    const envMap = new Map<string, string>();
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        envMap.set(key, val);
      }
    }

    const statuses: EnvKeyStatus[] = [];
    for (const [key, meta] of Object.entries(KNOWN_API_KEYS)) {
      const val = envMap.get(key) || process.env[key] || "";
      const isSet = val.length > 0;
      const masked = isSet
        ? val.length > 10
          ? val.slice(0, 4) + "••••••••" + val.slice(-4)
          : "••••••••"
        : "";

      statuses.push({
        key,
        isSet,
        maskedValue: masked,
        requiredBy: meta.requiredBy,
        description: meta.description,
      });
    }

    return statuses;
  }

  setEnvKey(key: string, value: string): boolean {
    const envPath = join(this.targetDir, ".env");
    let content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";

    const lines = content.split("\n");
    let replaced = false;

    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith(`${key}=`)) {
        replaced = true;
        return `${key}=${value}`;
      }
      return line;
    });

    if (!replaced) {
      newLines.push(`${key}=${value}`);
    }

    writeFileSync(envPath, newLines.join("\n"), "utf-8");
    return true;
  }
}
