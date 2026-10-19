import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import type { ConnectionProfileStore, SssfConfig } from "../shared/types";
import { ConfigManager } from "./config";

/** Register compatible router endpoints privately; never put credentials in argv. */
export function prepareRuntime(target: string, runId: string, profiles: ConnectionProfileStore, sourceConfig: string) {
  const config = parse(readFileSync(resolve(target, sourceConfig), "utf8")) as SssfConfig;
  new ConfigManager(target).validateConfig(config);
  const dir = join(target, ".sssf", "runtime", runId);
  mkdirSync(dir, { recursive: true });
  const providers: Record<string, unknown> = {};
  const env: Record<string, string> = {};
  for (const agent of config.agents) {
    const selected = profiles.selectedProviders?.[agent.name] ?? "local";
    const profile = profiles.profiles.find(p => p.role === agent.name && p.provider === selected && !p.disabled);
    if (!profile) throw new Error(`Configure and save a connection for ${agent.name} in Settings.`);
    const provider = `crew-${agent.name}`;
    const keyName = `CREW_KEY_${agent.name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    env[keyName] = profile.apiKey || "none";
    providers[provider] = {
      baseUrl: profile.baseUrl.replace(/\/+$/, ""), api: "openai-completions", apiKey: `$${keyName}`,
      models: [{ id: profile.model, name: profile.model, reasoning: profile.reasoningLevel !== "off", input: ["text"],
        contextWindow: 128000, maxTokens: 8192,
        compat: { supportsDeveloperRole: false, supportsStore: false, maxTokensField: "max_tokens" } }],
    };
    agent.model = `${provider}/${profile.model}`;
    agent.thinking = profile.reasoningLevel || "off";
  }
  writeFileSync(join(dir, "models.json"), JSON.stringify({ providers }, null, 2));
  const configPath = join(dir, "config.yaml");
  writeFileSync(configPath, stringify(config, { defaultStringType: "QUOTE_DOUBLE" }));
  return { configPath, env: { ...env, PI_CODING_AGENT_DIR: dir, PI_MODELS_PATH: join(dir, "models.json") } };
}
